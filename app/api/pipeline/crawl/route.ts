// app/api/pipeline/crawl/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import { firecrawlScrapeBatch } from '@/lib/mcp-firecrawl'
import { extractCVEs, hashContent, makeCanonicalKey } from '@/lib/normalize'
import { authenticatePipelineRequest } from '@/lib/pipeline-auth'

type CrawlItem = {
  url: string
  title?: string
  content?: string
  fetched_at?: string
  source?: string
  metadata?: Record<string, unknown>
}

type StructuredKind = 'json' | 'csv' | 'rss'

const MAX_FEED_ITEMS = Number(process.env.CRAWL_MAX_FEED_ITEMS ?? 100)
const FEED_LOOKBACK_DAYS = Number(process.env.CRAWL_FEED_LOOKBACK_DAYS ?? 30)
const FEED_CUTOFF =
  Number.isFinite(FEED_LOOKBACK_DAYS) && FEED_LOOKBACK_DAYS > 0
    ? Date.now() - FEED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    : null

async function collectSeedItems(seeds: string[]): Promise<CrawlItem[]> {
  const aggregated: CrawlItem[] = []
  let allFailed = true

  for (const rawSeed of seeds) {
    const seed = normalizeSeed(rawSeed)
    try {
      const structuredItems = await tryStructuredSeed(seed)
      if (structuredItems) {
        aggregated.push(...structuredItems)
        allFailed = false
        continue
      }
    } catch (error) {
      console.error('[pipeline:crawl] structured fetch failed', {
        seed,
        message: error instanceof Error ? error.message : String(error)
      })
      continue
    }

    try {
      const { items } = await firecrawlScrapeBatch([seed])
      if (items.length) allFailed = false
      aggregated.push(...items)
    } catch (error) {
      console.error('[pipeline:crawl] firecrawl failed', {
        seed,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (allFailed && !aggregated.length) {
    throw new Error('No crawl sources succeeded')
  }

  return aggregated
}

function normalizeSeed(seed: string) {
  if (seed.startsWith('https://www.cisa.gov/known-exploited-vulnerabilities-catalog') && !seed.endsWith('/')) {
    return `${seed}/`
  }
  return seed
}

function detectStructuredKind(url: string): StructuredKind | null {
  const lower = url.toLowerCase()
  if (lower.endsWith('.json') || lower.includes('/feeds/')) return 'json'
  if (lower.endsWith('.csv')) return 'csv'
  if (
    lower.endsWith('/rss') ||
    lower.endsWith('.rss') ||
    lower.endsWith('.xml') ||
    lower.includes('/rss/')
  ) {
    return 'rss'
  }
  if (lower.includes('known-exploited-vulnerabilities-catalog')) return 'json'
  return null
}

async function tryStructuredSeed(seed: string): Promise<CrawlItem[] | null> {
  const kindHint = detectStructuredKind(seed)
  if (!kindHint) return null

  const res = await fetch(seed, {
    headers: { 'User-Agent': 'mcp-security-incidents/1.0 (+https://example.com)' },
    cache: 'no-store'
  })
  if (!res.ok) {
    const bodyPreview = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`Structured fetch failed (${res.status}) ${bodyPreview}`)
  }
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
  const text = await res.text()

  const finalKind = resolveStructuredKind(kindHint, contentType, text)
  const fetched_at = new Date().toISOString()

  switch (finalKind) {
    case 'json':
      return parseJsonFeed(text, seed, fetched_at)
    case 'csv':
      return parseCsvFeed(text, seed, fetched_at)
    case 'rss':
      return parseRssFeed(text, seed, fetched_at)
    default:
      return null
  }
}

function resolveStructuredKind(
  hint: StructuredKind,
  contentType: string,
  text: string
): StructuredKind | null {
  if (contentType.includes('application/json') || contentType.includes('application/ld+json')) return 'json'
  if (contentType.includes('text/csv') || contentType.includes('application/csv')) return 'csv'
  if (contentType.includes('application/xml') || contentType.includes('text/xml') || contentType.includes('application/rss')) {
    return 'rss'
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss')) return 'rss'
  if (trimmed.includes(',') && trimmed.includes('\n')) return 'csv'

  return hint
}

function parseJsonFeed(text: string, seed: string, fetched_at: string): CrawlItem[] {
  try {
    const data = JSON.parse(text) as unknown
    const records = extractJsonRecords(data)
    if (!records.length) {
      return [
        {
          url: seed,
          title: 'JSON Feed',
          content: JSON.stringify(data, null, 2),
          fetched_at,
          source: 'structured-json'
        }
      ]
    }
    const items: CrawlItem[] = []
    records.every((entry, index) => {
      const title = pickFirstString(entry, [
        'title',
        'name',
        'vulnerabilityName',
        'vulnerability',
        'cveID',
        'cve',
        'id'
      ]) || `JSON Item ${index + 1}`
      const cve = pickFirstString(entry, ['cve', 'cveID', 'cve_id'])
      const description = pickFirstString(entry, [
        'description',
        'shortDescription',
        'summary',
        'notes'
      ])
      const dateStr = pickFirstString(entry, [
        'timestamp',
        'published',
        'publishedDate',
        'date',
        'dateAdded',
        'datePublished',
        'releaseDate',
        'lastModified',
        'modified',
        'dueDate'
      ])
      if (!isRecent(dateStr, index)) return true
      const extraLines: string[] = []
      if (description) extraLines.push(description)
      const action = pickFirstString(entry, ['action', 'requiredAction'])
      if (action) extraLines.push(`Action: ${action}`)
      const vendor = pickFirstString(entry, ['vendor', 'vendorProject'])
      const product = pickFirstString(entry, ['product'])
      if (vendor || product) extraLines.push(`Product: ${[vendor, product].filter(Boolean).join(' / ')}`)
      const references = toArray(pickValue(entry, 'references')).join('\n')
      if (references) extraLines.push(`References:\n${references}`)
      const body = extraLines.length ? extraLines.join('\n\n') : JSON.stringify(entry, null, 2)
      const entryUrl =
        pickFirstString(entry, ['url', 'sourceURL', 'sourceUrl']) ??
        (cve ? `https://www.cve.org/CVERecord?id=${cve}` : `${seed}#${index}`)
      items.push({
        url: entryUrl,
        title,
        content: body,
        fetched_at,
        source: 'structured-json',
        metadata: { cve }
      })
      return items.length < MAX_FEED_ITEMS
    })
    return items
  } catch (error) {
    console.error('[pipeline:crawl] json parse failed', {
      seed,
      message: error instanceof Error ? error.message : String(error)
    })
    return []
  }
}

function extractJsonRecords(data: unknown): Record<string, unknown>[] {
  let candidate: unknown = null
  if (Array.isArray(data)) {
    candidate = data
  } else if (data && typeof data === 'object') {
    candidate = Object.values(data).find(value => Array.isArray(value))
  }
  if (!Array.isArray(candidate)) return []
  return candidate.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
}

function pickValue(entry: Record<string, unknown>, key: string): unknown {
  if (key in entry) return entry[key]
  return undefined
}

function pickFirstString(entry: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = pickValue(entry, key)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function toArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(v => String(v))
  if (typeof value === 'string') return [value]
  return [JSON.stringify(value)]
}

function parseCsvFeed(text: string, seed: string, fetched_at: string): CrawlItem[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (!lines.length) return []
  const rows = lines.map(parseCsvLine)
  const header = rows.shift()
  if (!header) return []
  const items: CrawlItem[] = []
  rows.every((row, index) => {
    if (row.every(cell => !cell.trim())) return
    const record: Record<string, string> = {}
    header.forEach((key, idx) => {
      record[key] = row[idx] ?? ''
    })
    const title =
      record['title'] ||
      record['Title'] ||
      record['vulnerabilityName'] ||
      record['Vulnerability Name'] ||
      record['cveID'] ||
      record['CVEID'] ||
      record['CVE'] ||
      `CSV Item ${index + 1}`
    const dateStr =
      record['dateAdded'] ||
      record['Date Added'] ||
      record['Publish Date'] ||
      record['published'] ||
      record['Last Modified'] ||
      record['Due Date'] ||
      record['DueDate']
    if (!isRecent(dateStr, index)) return true
    const content = Object.entries(record)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    const cve = record['cveID'] || record['CVE'] || record['CVE ID']
    items.push({
      url: record['url'] || `${seed}#${index}`,
      title: title.trim(),
      content,
      fetched_at,
      source: 'structured-csv',
      metadata: { cve }
    })
    return items.length < MAX_FEED_ITEMS
  })
  return items
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result.map(cell => cell.trim())
}

function parseRssFeed(text: string, seed: string, fetched_at: string): CrawlItem[] {
  const items: CrawlItem[] = []
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi
  const matches = text.match(itemRegex)
  if (!matches) return items
  matches.every((block, index) => {
    const title = extractTag(block, 'title') ?? `RSS Item ${index + 1}`
    const description =
      extractTag(block, 'description') ??
      extractTag(block, 'content:encoded') ??
      ''
    const link = extractTag(block, 'link') ?? `${seed}#${index}`
    const dateStr = extractTag(block, 'pubDate') ?? extractTag(block, 'updated')
    if (!isRecent(dateStr, index)) return true
    items.push({
      url: link,
      title,
      content: description,
      fetched_at,
      source: 'structured-rss'
    })
    return items.length < MAX_FEED_ITEMS
  })
  return items
}

function extractTag(block: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = block.match(pattern)
  if (!match) return undefined
  return decodeXml(match[1])
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return timestamp
}

function isRecent(dateStr: string | undefined, index: number): boolean {
  if (MAX_FEED_ITEMS && index >= MAX_FEED_ITEMS) return false
  if (FEED_CUTOFF === null) return true
  const ts = parseDate(dateStr)
  if (ts === null) {
    return index < MAX_FEED_ITEMS
  }
  return ts >= FEED_CUTOFF
}

export async function POST(req: Request) {
  const authError = authenticatePipelineRequest(req)
  if (authError) return authError

  const seeds = [
    'https://api.msrc.microsoft.com/update-guide/rss',
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    'https://nvd.nist.gov/feeds/json/cve/1.1/recent.json'
  ]
  console.info('[pipeline:crawl] starting run', { seeds: seeds.length })

  let items
  try {
    items = await collectSeedItems(seeds)
  } catch (err) {
    console.error('[pipeline:crawl] collection failed', err)
    return Response.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }

  const changedIncidentIds: string[] = []
  for (const it of items) {
    const text = (it.title ?? '') + '\n' + (it.content ?? '')
    const content_hash = hashContent(text)
    const { data: existingRaw } = await supabaseAdmin
      .from('raw_items')
      .select('id')
      .eq('content_hash', content_hash)
      .maybeSingle()
    if (existingRaw) {
      continue
    }
    const cves = extractCVEs(text)
    const canonical_key = makeCanonicalKey({
      cves,
      source: it.source,
      date: it.fetched_at,
      fingerprint: content_hash,
      url: it.url
    })

    const { data: rawUpsert, error: rawErr } = await supabaseAdmin
      .from('raw_items')
      .upsert({
        url: it.url,
        source: it.source ?? 'web',
        fetched_at: it.fetched_at ?? new Date().toISOString(),
        title: it.title ?? null,
        body_markdown: it.content ?? null,
        content_hash,
        metadata: { cves }
      }, { onConflict: 'content_hash' })
      .select().single()
    if (rawErr) continue

    const { data: incSelect } = await supabaseAdmin
      .from('incidents')
      .select('id').eq('canonical_key', canonical_key).maybeSingle()
    let incidentId = incSelect?.id
    if (!incidentId) {
      const { data: ins } = await supabaseAdmin
        .from('incidents')
        .insert({ canonical_key, title: it.title ?? '', kev: false })
        .select('id').single()
      incidentId = ins?.id
    }
    if (!incidentId) continue
    changedIncidentIds.push(incidentId)

    await supabaseAdmin.from('incident_sources')
      .upsert({ incident_id: incidentId, raw_id: rawUpsert.id })
  }

  const changed = Array.from(new Set(changedIncidentIds))
  console.info('[pipeline:crawl] completed', { changedCount: changed.length })
  return Response.json({ changed })
}
