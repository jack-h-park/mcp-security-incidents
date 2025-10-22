// app/admin/actions.ts
'use server'

type PipelineType = 'crawl' | 'summarize'

type PipelineResult = {
  ok: boolean
  status: number
  body: unknown
  error?: string
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

async function triggerPipeline(type: PipelineType): Promise<PipelineResult> {
  const token = process.env.PIPELINE_TOKEN
  if (!token) {
    return {
      ok: false,
      status: 500,
      body: null,
      error: 'PIPELINE_TOKEN is not configured on the server'
    }
  }

  const base =
    process.env.INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    DEFAULT_BASE_URL

  try {
    const res = await fetch(`${base}/api/pipeline/${type}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        error:
          (body as { error?: string }).error ??
          `Request failed with ${res.status}`
      }
    }

    return { ok: true, status: res.status, body }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error triggering pipeline'
    }
  }
}

export async function runCrawl(): Promise<PipelineResult> {
  return triggerPipeline('crawl')
}

export async function runSummarize(): Promise<PipelineResult> {
  return triggerPipeline('summarize')
}
