// app/api/pipeline/crawl/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import { firecrawlScrapeBatch } from '@/lib/mcp-firecrawl'
import { extractCVEs, hashContent, makeCanonicalKey } from '@/lib/normalize'
import { authenticatePipelineRequest } from '@/lib/pipeline-auth'

export async function POST(req: Request) {
  const authError = authenticatePipelineRequest(req)
  if (authError) return authError

  const seeds = [
    'https://msrc.microsoft.com/update-guide/rss',
    'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    'https://nvd.nist.gov/vuln/recent'
  ]
  console.info('[pipeline:crawl] starting run', { seeds: seeds.length })

  let items
  try {
    const result = await firecrawlScrapeBatch(seeds)
    items = result.items
  } catch (err) {
    console.error('[pipeline:crawl] firecrawl failed', err)
    return Response.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }

  const changedIncidentIds: string[] = []
  for (const it of items) {
    const text = (it.title ?? '') + '\n' + (it.content ?? '')
    const content_hash = hashContent(text)
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
