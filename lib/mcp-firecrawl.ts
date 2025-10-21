// lib/mcp-firecrawl.ts
type FirecrawlItem = {
  url: string
  title?: string
  content?: string
  fetched_at?: string
  source?: string
}

type FirecrawlResponse = {
  items: FirecrawlItem[]
}

const FIRECRAWL_TIMEOUT_MS = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? 15000)
const FIRECRAWL_RETRIES = Number(process.env.FIRECRAWL_RETRIES ?? 3)

export async function firecrawlScrapeBatch(seeds: string[]): Promise<FirecrawlResponse> {
  const baseUrl = process.env.FIRECRAWL_API_URL
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('Firecrawl environment variables (FIRECRAWL_API_URL, FIRECRAWL_API_KEY) must be set')
  }

  const payload = {
    urls: seeds,
    extractor: 'markdown',
    options: { returnContent: true }
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= FIRECRAWL_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS)

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/scrapeBatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      clearTimeout(timeout)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 200)}`)
      }

      const json = (await res.json()) as FirecrawlResponse | null
      if (!json?.items?.length) {
        throw new Error('Firecrawl returned no items')
      }

      return {
        items: json.items.map(item => ({
          ...item,
          content: item.content ?? '',
          fetched_at: item.fetched_at ?? new Date().toISOString(),
          source: item.source ?? 'firecrawl'
        }))
      }
    } catch (err) {
      clearTimeout(timeout)
      lastError = err
      const isLastAttempt = attempt === FIRECRAWL_RETRIES
      const isAbortError = err instanceof Error && err.name === 'AbortError'
      const shouldRetry = !isLastAttempt && !isAbortError
      if (!shouldRetry) break
      await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

