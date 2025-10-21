// app/incidents/[id]/page.tsx
import { supabaseAdmin } from '@/lib/supabase-admin'

export const revalidate = 300

export default async function IncidentPage({ params }: { params: { id: string }}) {
  const [{ data: inc }, { data: sum }] = await Promise.all([
    supabaseAdmin.from('incidents').select('*').eq('id', params.id).single(),
    supabaseAdmin.from('summaries').select('*').eq('incident_id', params.id)
      .order('created_at', { ascending:false }).limit(1).single()
  ])

  if (!inc) return <div style={{padding:24}}>Not found</div>
  return (
    <main style={{padding:24, maxWidth:800, margin:'0 auto'}}>
      <h2 style={{fontFamily:'monospace'}}>{inc.canonical_key}</h2>
      <p style={{marginTop:8}}>{inc.title}</p>

      {sum ? (
        <>
          <h3 style={{marginTop:16}}>TL;DR</h3>
          <p>{sum.tl_dr}</p>
          <h3 style={{marginTop:16}}>Summary</h3>
          <pre style={{whiteSpace:'pre-wrap'}}>{sum.summary_md}</pre>
        </>
      ) : <p>No summary yet.</p>}
    </main>
  )
}
