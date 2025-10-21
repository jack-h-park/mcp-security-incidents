// app/api/pipeline/summarize/route.ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import { summarize } from '@/lib/summarize'
import { authenticatePipelineRequest } from '@/lib/pipeline-auth'

export async function POST(req: Request) {
  const authError = authenticatePipelineRequest(req)
  if (authError) return authError
  const { data: latest } = await supabaseAdmin
    .from('incidents')
    .select('id, title')
    .order('updated_at', { ascending: false })
    .limit(10)

  for (const inc of latest ?? []) {
    const { data: src } = await supabaseAdmin
      .from('incident_sources').select('raw_id').eq('incident_id', inc.id).limit(1)
    if (!src?.[0]) continue
    const { data: raw } = await supabaseAdmin
      .from('raw_items').select('title, body_markdown').eq('id', src[0].raw_id).single()
    if (!raw) continue

    const sum = await summarize({ title: inc.title, text: raw.body_markdown ?? '' })
    await supabaseAdmin
      .from('summaries')
      .upsert({
        incident_id: inc.id,
        tl_dr: sum.tl_dr,
        summary_md: sum.summary_md,
        citations: sum.citations ?? []
      }, { onConflict: 'incident_id' })

    // 해당 페이지들 캐시 무효화
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/revalidate`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ token: process.env.REVALIDATE_TOKEN, path:'/' })
    }).catch(()=>{})

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/revalidate`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ token: process.env.REVALIDATE_TOKEN, path:`/incidents/${inc.id}` })
    }).catch(()=>{})
  }

  return Response.json({ ok: true })
}
