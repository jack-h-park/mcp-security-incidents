// app/api/pipeline/summarize/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createSummaryRun } from '@/lib/summary-runner'
import { getSummarizerOption } from '@/lib/settings'
import { authenticatePipelineRequest } from '@/lib/pipeline-auth'

export async function POST(req: Request) {
  const authError = authenticatePipelineRequest(req)
  if (authError) return authError
  const provider = await getSummarizerOption()
  const { data: latest } = await supabaseAdmin
    .from('incidents')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(10)

  const changedIncidentIds: string[] = []
  for (const inc of latest ?? []) {
    const run = await createSummaryRun({
      incidentId: inc.id,
      providerOverride: provider,
      triggeredBy: 'pipeline'
    })

    if (!run.ok) {
      console.warn('[pipeline:summarize] failed', {
        incidentId: inc.id,
        error: run.error
      })
      continue
    }

    changedIncidentIds.push(inc.id)

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: process.env.REVALIDATE_TOKEN, path: '/' })
    }).catch(() => {})

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: process.env.REVALIDATE_TOKEN,
        path: `/incidents/${inc.id}`
      })
    }).catch(() => {})
  }

  return Response.json({ ok: true, provider, changed: changedIncidentIds })
}
