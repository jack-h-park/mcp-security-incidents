"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { updateSummarizerPreference } from "./actions"
import {
  SUMMARIZER_OPTION_METADATA,
  SummarizerOption
} from "@/lib/summarizer-options"

type Props = {
  initialOption: SummarizerOption
}

type Status =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

const optionEntries = Object.entries(SUMMARIZER_OPTION_METADATA) as Array<
  [SummarizerOption, { label: string; description: string }]
>

export function SummarizerSettingsForm({ initialOption }: Props) {
  const [selected, setSelected] = useState<SummarizerOption>(initialOption)
  const [applied, setApplied] = useState<SummarizerOption>(initialOption)
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [isPending, startTransition] = useTransition()

  const hasChanges = selected !== applied

  const activeLabel = useMemo(() => {
    return SUMMARIZER_OPTION_METADATA[selected]?.label ?? "Unknown"
  }, [selected])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!hasChanges) return
    setStatus({ kind: "idle" })
    startTransition(async () => {
      const result = await updateSummarizerPreference(selected)
      if (result.ok) {
        setApplied(selected)
        setStatus({
          kind: "success",
          message: `Summarizer updated to "${activeLabel}".`
        })
      } else {
        setStatus({
          kind: "error",
          message: result.error ?? "Failed to update summarizer preference."
        })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 20,
        display: "grid",
        gap: 16,
        background: "var(--surface)",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)"
      }}
    >
      <header>
        <h2 style={{ fontSize: 18, margin: 0 }}>Default Summarizer</h2>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          Sets the default summarization engine for pipeline runs and pre-selects
          manual summarizations in the incident list.
        </p>
      </header>

      <fieldset
        style={{
          margin: 0,
          padding: 0,
          border: "none",
          display: "grid",
          gap: 12
        }}
      >
        {optionEntries.map(([value, meta]) => (
          <label
            key={value}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--border-subtle)",
              borderRadius: 10,
              background: value === applied ? "var(--surface)" : "var(--surface-muted)",
              boxShadow: value === selected ? "var(--focus-ring)" : "none"
            }}
          >
            <input
              type="radio"
              name="summarizer"
              value={value}
              checked={selected === value}
              onChange={() => setSelected(value)}
              disabled={isPending}
              style={{ marginTop: 4 }}
            />
            <span>
              <div style={{ fontWeight: 600 }}>{meta.label}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{meta.description}</div>
            </span>
          </label>
        ))}
      </fieldset>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="submit"
          className="btn"
          disabled={!hasChanges || isPending}
          style={{ minWidth: 140 }}
        >
          {isPending ? "Saving..." : "Save Preference"}
        </button>
        {status.kind === "success" && (
          <span style={{ color: "var(--text-success)", fontSize: 13 }}>{status.message}</span>
        )}
        {status.kind === "error" && (
          <span style={{ color: "var(--text-error)", fontSize: 13 }}>{status.message}</span>
        )}
      </div>
    </form>
  )
}
