// app/page.tsx
import { supabaseAdmin } from '@/lib/supabase-admin'
import { summarizerLabel } from '@/lib/summarizer-options'

export const revalidate = 300 // ISR: 5 minutes

export default async function Page() {
  const { data } = await supabaseAdmin
    .from('incidents')
    .select('id, canonical_key, title, kev, cvss_base, updated_at, last_summarized_at, last_summary_provider, last_summary_model')
    .order('updated_at', { ascending: false })
    .limit(50)

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1>Security Incidents</h1>
      <ul style={{ display: 'grid', gap: 16, marginTop: 16, listStyle: 'none', padding: 0 }}>
        {(data ?? []).map(x => (
          <li
            key={x.id}
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: 16,
              background: 'var(--surface)',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
            }}
          >
            <a href={`./incidents/${x.id}`} style={{ fontFamily: 'monospace' }}>
              {x.canonical_key}
            </a>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {x.kev && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-success)',
                    background: 'var(--surface-success)',
                    borderRadius: 6,
                    padding: '2px 8px'
                  }}
                >
                  KEV
                </span>
              )}
              {x.cvss_base && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    background: 'var(--surface-muted)',
                    borderRadius: 6,
                    padding: '2px 8px'
                  }}
                >
                  CVSS {x.cvss_base}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 600, marginTop: 12 }}>{x.title}</div>

            <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
              {x.last_summarized_at ? (
                <>
                  Summarized {new Date(x.last_summarized_at).toLocaleString()} via{' '}
                  {summarizerLabel(x.last_summary_provider)}
                  {x.last_summary_model ? ` (${x.last_summary_model})` : ''}
                </>
              ) : (
                <>Not summarized yet</>
              )}
            </div>

            <small style={{ display: 'block', color: 'var(--muted)', marginTop: 8 }}>
              Updated {new Date(x.updated_at).toLocaleString()}
            </small>
          </li>
        ))}
      </ul>
    </main>
  )
}
