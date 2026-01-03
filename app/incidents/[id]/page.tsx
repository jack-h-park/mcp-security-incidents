// app/incidents/[id]/page.tsx
import {
  getSupabaseAdmin,
  hasSupabaseAdminConfig
} from '@/lib/supabase-admin'
import { summarizerLabel, type SummarizerOption } from '@/lib/summarizer-options'

export const revalidate = 300

type SummaryRow = {
  id: string
  tl_dr: string
  summary_md: string
  provider: SummarizerOption | null
  model: string | null
  fallback_from: SummarizerOption | null
  ran_at: string | null
  created_at: string | null
}

export default async function IncidentPage({
  params
}: {
  params: { id: string }
}) {
  if (!hasSupabaseAdminConfig()) {
    return (
      <div
        style={{
          padding: 24,
          maxWidth: 720,
          margin: '0 auto',
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
        }}
      >
        <p style={{ color: 'var(--muted)' }}>
          Supabase admin credentials are missing. Configure
          <code>SUPABASE_URL</code> (or <code>NEXT_PUBLIC_SUPABASE_URL</code>) and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to view incidents.
        </p>
      </div>
    )
  }
  const supabaseAdmin = getSupabaseAdmin()
  const [{ data: incident }, { data: summaries }] = await Promise.all([
    supabaseAdmin.from('incidents').select('*').eq('id', params.id).maybeSingle(),
    supabaseAdmin
      .from('summaries')
      .select(
        'id, tl_dr, summary_md, provider, model, fallback_from, ran_at, created_at'
      )
      .eq('incident_id', params.id)
      .order('ran_at', { ascending: false })
  ])

  if (!incident) {
    return (
      <div
        style={{
          padding: 24,
          maxWidth: 720,
          margin: '0 auto',
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
        }}
      >
        Not found
      </div>
    )
  }

  const history = (summaries as SummaryRow[] | null) ?? []
  const latest = history[0]

  const formatDate = (value: string | null | undefined) => {
    if (!value) return 'Unknown date'
    return new Date(value).toLocaleString()
  }

  const formatProvider = (
    value: SummarizerOption | null | undefined,
    model?: string | null
  ) => {
    const label = summarizerLabel(value)
    return model ? `${label} (${model})` : label
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 800,
        margin: '0 auto',
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
      }}
    >
      <h2 style={{ fontFamily: 'monospace' }}>{incident.canonical_key}</h2>
      <p style={{ marginTop: 8, color: 'var(--muted)' }}>{incident.title}</p>

      {latest ? (
        <>
          <h3 style={{ marginTop: 24 }}>TL;DR</h3>
          <p>{latest.tl_dr}</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
            Latest run: {formatProvider(latest.provider, latest.model)} •{' '}
            {formatDate(latest.ran_at ?? latest.created_at)}
            {latest.fallback_from && (
              <> (fallback from {summarizerLabel(latest.fallback_from)})</>
            )}
          </p>

          <h3 style={{ marginTop: 24 }}>Summary</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{latest.summary_md}</pre>

          {history.length > 1 && (
            <section style={{ marginTop: 32 }}>
              <h3>History</h3>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  marginTop: 12,
                  display: 'grid',
                  gap: 12
                }}
              >
                {history.slice(1).map(entry => (
                  <li
                    key={entry.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 10,
                      padding: 12,
                      background: 'var(--surface-muted)'
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {formatProvider(entry.provider, entry.model)}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {formatDate(entry.ran_at ?? entry.created_at)}
                      {entry.fallback_from && (
                        <>
                          {' '}
                          • fallback from {summarizerLabel(entry.fallback_from)}
                        </>
                      )}
                    </div>
                    <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {entry.summary_md}
                    </pre>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--muted)', marginTop: 24 }}>
          No summary yet.
        </p>
      )}
    </main>
  )
}
