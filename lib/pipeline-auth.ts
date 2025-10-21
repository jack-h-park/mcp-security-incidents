// lib/pipeline-auth.ts
export function authenticatePipelineRequest(req: Request) {
  const token = process.env.PIPELINE_TOKEN
  if (!token) {
    console.error('PIPELINE_TOKEN is not configured')
    return new Response('Pipeline authentication misconfigured', { status: 500 })
  }

  const provided =
    req.headers.get('authorization') ??
    req.headers.get('x-pipeline-token') ??
    ''

  const normalized = provided.startsWith('Bearer ')
    ? provided.slice(7)
    : provided

  if (normalized !== token) {
    return new Response('Unauthorized', { status: 401 })
  }

  return null
}
