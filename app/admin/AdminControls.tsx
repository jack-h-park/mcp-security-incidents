// app/admin/AdminControls.tsx
"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import type { PipelineActionState } from "./types"

type ActionResult = {
  ok: boolean
  status: number
  body: unknown
  error?: string
  timestamp: number
}

export function AdminControls({ actions }: { actions: PipelineActionState[] }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(
    (action: PipelineActionState) => {
      setError(null)
      startTransition(async () => {
        const res = await action.handler()
        setResult({ ...res, timestamp: Date.now() })
        if (!res.ok) {
          setError(res.error ?? "Pipeline request failed")
        }
      })
    },
    []
  )

  const lastUpdated = useMemo(() => {
    if (!result) return ""
    return new Date(result.timestamp).toLocaleString()
  }, [result])

  const buttonClass = isPending ? "btn btn--pending" : "btn"

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleClick(action)}
            disabled={isPending}
            className={buttonClass}
          >
            {isPending ? "Running..." : action.label}
          </button>
        ))}
      </div>

      {result && (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            padding: 16,
            background: result.ok ? "var(--surface-success)" : "var(--surface-error)",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)"
          }}
        >
          <header style={{ marginBottom: 8, fontWeight: 600 }}>
            Result ({result.status}) {lastUpdated && "- " + lastUpdated}
          </header>
          {result.error && (
            <p style={{ color: "var(--text-error)", marginBottom: 8 }}>{result.error}</p>
          )}
          <pre style={{ maxHeight: 280, overflow: "auto", fontSize: 12 }}>
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--text-error)" }}>
          {error}
        </p>
      )}
    </section>
  )
}
