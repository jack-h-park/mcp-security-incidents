// app/admin/page.tsx
import { AdminControls } from './AdminControls'
import { runCrawl, runSummarize } from './actions'
import type { PipelineActionState } from './types'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const actions: PipelineActionState[] = [
    { label: 'Run Crawl Pipeline', handler: runCrawl },
    { label: 'Run Summarize Pipeline', handler: runSummarize }
  ]

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Pipeline Control</h1>
      <p style={{ color: '#555', marginTop: 8 }}>
        Trigger ingestion and summarization jobs on-demand. Results are fetched
        using the server-side pipeline token.
      </p>

      <div style={{ marginTop: 24 }}>
        <AdminControls actions={actions} />
      </div>

      <section style={{ marginTop: 32, color: '#666', fontSize: 14 }}>
        <h2 style={{ fontSize: 16 }}>Notes</h2>
        <ul style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.6 }}>
          <li>Ensure `PIPELINE_TOKEN` and base URL environment variables are configured.</li>
          <li>Jobs run on the server and share the same Supabase credentials as the API routes.</li>
          <li>Review the console logs to diagnose any ingestion or summarization errors.</li>
        </ul>
      </section>
    </main>
  )
}
