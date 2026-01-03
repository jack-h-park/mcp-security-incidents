// app/admin/page.tsx
import {
  getSupabaseAdmin,
  hasSupabaseAdminConfig
} from '@/lib/supabase-admin'
import { AdminControls } from './AdminControls'
import { IncidentSummaryManager } from './IncidentSummaryManager'
import { SummarizerSettingsForm } from './SummarizerSettingsForm'
import { loadSummarizerPreference, runCrawl, runSummarize } from './actions'
import type { IncidentSummaryAdminRow, PipelineActionState } from './types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  if (!hasSupabaseAdminConfig()) {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <h1>Pipeline Control</h1>
        <p style={{ color: 'var(--muted)' }}>
          Supabase admin credentials are not available. Set{' '}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> (or <code>SUPABASE_URL</code>) and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to access admin controls.
        </p>
      </main>
    )
  }
  const { option } = await loadSummarizerPreference()
  const actions: PipelineActionState[] = [
    { label: 'Run Crawl Pipeline', handler: runCrawl },
    { label: 'Run Summarize Pipeline', handler: runSummarize }
  ]

  const supabaseAdmin = getSupabaseAdmin()
  const { data: incidentsData } = await supabaseAdmin
    .from('incidents')
    .select(`
      id,
      canonical_key,
      title,
      last_summarized_at,
      last_summary_provider,
      last_summary_model,
      summaries (
        id,
        tl_dr,
        summary_md,
        provider,
        model,
        fallback_from,
        ran_at,
        created_at
      )
    `)
    .order('updated_at', { ascending: false })
    .limit(25)

  const incidents = (incidentsData as IncidentSummaryAdminRow[] | null) ?? []

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Pipeline Control</h1>
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>
        Trigger ingestion and summarization jobs on-demand. Results are fetched
        using the server-side pipeline token.
      </p>

      <div style={{ marginTop: 24 }}>
        <AdminControls actions={actions} />
      </div>

      <section style={{ marginTop: 32 }}>
        <SummarizerSettingsForm initialOption={option} />
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          This default applies to background pipeline runs and seeds the dropdown
          for manual incident summaries. Hugging Face, OpenAI, and Gemini options
          require their respective API keys to be set on the server.
        </p>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 18 }}>Incident Summaries</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
          Manually rerun summaries per incident, choose a provider, and manage history.
        </p>
        <div style={{ marginTop: 16 }}>
          <IncidentSummaryManager
            incidents={incidents}
            defaultProvider={option}
          />
        </div>
      </section>

      <section style={{ marginTop: 32, color: 'var(--muted)', fontSize: 14 }}>
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
