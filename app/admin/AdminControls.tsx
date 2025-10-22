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
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 16,
            background: result.ok ? "#f6ffed" : "#fff1f0"
          }}
        >
          <header style={{ marginBottom: 8, fontWeight: 600 }}>
            Result ({result.status}) {lastUpdated && "- " + lastUpdated}
          </header>
          {result.error && (
            <p style={{ color: "#c00", marginBottom: 8 }}>{result.error}</p>
          )}
          <pre
            style={{
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: 12,
              maxHeight: 280,
              overflow: "auto",
              fontSize: 12
            }}
          >
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <p style={{ color: "#c00" }}>
          {error}
        </p>
      )}
    </section>
  )
}
