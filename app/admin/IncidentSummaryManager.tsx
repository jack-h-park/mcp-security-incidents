"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import {
  DEFAULT_SUMMARIZER_OPTION,
  SUMMARIZER_OPTION_METADATA,
  summarizerLabel,
  type SummarizerOption
} from "@/lib/summarizer-options"
import type {
  IncidentSummaryAdminRow,
  SummaryHistoryEntry
} from "./types"
import {
  deleteSummaryRun,
  summarizeIncidentNow
} from "./actions"

type Props = {
  incidents: IncidentSummaryAdminRow[]
  defaultProvider: SummarizerOption
}

type StatusMessage =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

function parseDate(value: string | null | undefined): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function sortSummaries(entries: SummaryHistoryEntry[]): SummaryHistoryEntry[] {
  return [...entries].sort(
    (a, b) => parseDate(b.ran_at ?? b.created_at) - parseDate(a.ran_at ?? a.created_at)
  )
}

export function IncidentSummaryManager({ incidents, defaultProvider }: Props) {
  const [items, setItems] = useState<IncidentSummaryAdminRow[]>(() =>
    incidents.map(incident => ({
      ...incident,
      summaries: sortSummaries(incident.summaries ?? [])
    }))
  )
  const [selection, setSelection] = useState<Record<string, SummarizerOption>>(() =>
    incidents.reduce<Record<string, SummarizerOption>>((acc, incident) => {
      acc[incident.id] =
        incident.last_summary_provider ?? defaultProvider
      return acc
    }, {})
  )
  const [status, setStatus] = useState<Record<string, StatusMessage | undefined>>({})
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const providerOptions = useMemo(
    () =>
      Object.entries(SUMMARIZER_OPTION_METADATA).map(([value, meta]) => ({
        value: value as SummarizerOption,
        label: meta.label
      })),
    []
  )

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "Unknown date"
    return new Date(value).toLocaleString()
  }

  const handleProviderChange = (incidentId: string, provider: SummarizerOption) => {
    setSelection(prev => ({ ...prev, [incidentId]: provider }))
  }

  useEffect(() => {
    setSelection(prev => {
      let changed = false
      const next = { ...prev }
      items.forEach(incident => {
        if (!(incident.id in next)) {
          next[incident.id] =
            incident.last_summary_provider ?? defaultProvider ?? DEFAULT_SUMMARIZER_OPTION
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [items, defaultProvider])

  const handleSummarize = (incidentId: string) => {
    const provider = selection[incidentId] ?? defaultProvider ?? DEFAULT_SUMMARIZER_OPTION
    const actionKey = `summarize-${incidentId}`
    setPendingKey(actionKey)
    setStatus(prev => ({ ...prev, [incidentId]: undefined }))

    startTransition(() => {
      ;(async () => {
        const result = await summarizeIncidentNow({ incidentId, provider })
        if (!result.ok) {
          setStatus(prev => ({
            ...prev,
            [incidentId]: {
              kind: "error",
              message: result.error
            }
          }))
        } else {
          const summary = result.summary
          setItems(prev =>
            prev.map(item => {
              if (item.id !== incidentId) return item
              const entry: SummaryHistoryEntry = {
                id: summary.id,
                tl_dr: summary.tl_dr,
                summary_md: summary.summary_md,
                provider: summary.provider,
                model: summary.model,
                fallback_from: summary.fallback_from ?? null,
                ran_at: summary.ran_at,
                created_at: summary.created_at
              }
              const summaries = sortSummaries([entry, ...(item.summaries ?? [])])
              return {
                ...item,
                summaries,
                last_summarized_at: entry.ran_at ?? entry.created_at,
                last_summary_provider: summary.provider,
                last_summary_model: summary.model ?? null
              }
            })
          )
          setSelection(prev => ({
            ...prev,
            [incidentId]: summary.provider
          }))
          setStatus(prev => ({
            ...prev,
            [incidentId]: {
              kind: "success",
              message: `Summarized via ${summarizerLabel(summary.provider)}`
            }
          }))
        }
        setPendingKey(prev => (prev === actionKey ? null : prev))
      })()
    })
  }

  const handleDelete = (incidentId: string, summaryId: string) => {
    const actionKey = `delete-${summaryId}`
    setPendingKey(actionKey)

    startTransition(() => {
      ;(async () => {
        const result = await deleteSummaryRun({ incidentId, summaryId })
        if (!result.ok) {
          setStatus(prev => ({
            ...prev,
            [incidentId]: {
              kind: "error",
              message: result.error
            }
          }))
        } else {
          setItems(prev =>
            prev.map(item => {
              if (item.id !== incidentId) return item
              const summaries = item.summaries.filter(entry => entry.id !== summaryId)
              const [latest] = sortSummaries(summaries)
              return {
                ...item,
                summaries,
                last_summarized_at: latest
                  ? latest.ran_at ?? latest.created_at
                  : null,
                last_summary_provider: latest?.provider ?? null,
                last_summary_model: latest?.model ?? null
              }
            })
          )
          setStatus(prev => ({
            ...prev,
            [incidentId]: {
              kind: "success",
              message: "Summary deleted"
            }
          }))
        }
        setPendingKey(prev => (prev === actionKey ? null : prev))
      })()
    })
  }

  if (!items.length) {
    return (
      <p style={{ color: "var(--muted)", marginTop: 12 }}>
        No incidents available.
      </p>
    )
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {items.map(incident => {
        const currentStatus = status[incident.id]
        const isSummarizePending = pendingKey === `summarize-${incident.id}` && isPending
        return (
          <article
            key={incident.id}
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 16,
              background: "var(--surface)",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)"
            }}
          >
            <header>
              <div style={{ fontFamily: "monospace", fontWeight: 600 }}>
                {incident.canonical_key}
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{incident.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {incident.last_summarized_at
                  ? `Last summarized ${formatDate(incident.last_summarized_at)} via ${summarizerLabel(incident.last_summary_provider)}${incident.last_summary_model ? ` (${incident.last_summary_model})` : ""}`
                  : "No summaries yet"}
              </div>
            </header>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 16,
                alignItems: "center"
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 500 }}>Summarizer</span>
                <select
                  value={selection[incident.id] ?? defaultProvider ?? DEFAULT_SUMMARIZER_OPTION}
                  onChange={event =>
                    handleProviderChange(
                      incident.id,
                      event.target.value as SummarizerOption
                    )
                  }
                  disabled={isSummarizePending}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-inset)"
                  }}
                >
                  {providerOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => handleSummarize(incident.id)}
                disabled={isSummarizePending}
                style={{ minWidth: 140 }}
              >
                {isSummarizePending ? "Summarizing..." : "Summarize Now"}
              </button>
            </div>

            {currentStatus && (
              <p
                style={{
                  marginTop: 12,
                  color:
                    currentStatus.kind === "success"
                      ? "var(--text-success)"
                      : "var(--text-error)",
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word"
                }}
              >
                {currentStatus.message}
              </p>
            )}

            <section style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 8 }}>History</h4>
              {incident.summaries.length ? (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    display: "grid",
                    gap: 12
                  }}
                >
                  {incident.summaries.map(entry => {
                    const deletePending =
                      pendingKey === `delete-${entry.id}` && isPending
                    return (
                      <li
                        key={entry.id}
                        style={{
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 10,
                          padding: 12,
                          background: "var(--surface-muted)"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap"
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {summarizerLabel(entry.provider)}
                              {entry.model ? ` (${entry.model})` : ""}
                            </div>
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>
                              {formatDate(entry.ran_at ?? entry.created_at)}
                              {entry.fallback_from && (
                                <>
                                  {" "}
                                  • fallback from{" "}
                                  {summarizerLabel(entry.fallback_from)}
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: "6px 12px" }}
                            onClick={() => handleDelete(incident.id, entry.id)}
                            disabled={deletePending}
                          >
                            {deletePending ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 13 }}>
                          <strong>TL;DR:</strong> {entry.tl_dr}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  No summary runs yet.
                </p>
              )}
            </section>
          </article>
        )
      })}
    </section>
  )
}
