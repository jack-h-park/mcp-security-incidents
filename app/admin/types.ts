// app/admin/types.ts
import type { SummarizerOption } from '@/lib/summarizer-options'

export type PipelineActionResult = {
  ok: boolean
  status: number
  body: unknown
  error?: string
}

export type PipelineAction = () => Promise<PipelineActionResult>

export type PipelineActionState = {
  label: string
  handler: PipelineAction
}

export type SummaryHistoryEntry = {
  id: string
  tl_dr: string
  summary_md: string
  provider: SummarizerOption | null
  model: string | null
  fallback_from: SummarizerOption | null
  ran_at: string | null
  created_at: string | null
}

export type IncidentSummaryAdminRow = {
  id: string
  canonical_key: string
  title: string
  last_summarized_at: string | null
  last_summary_provider: SummarizerOption | null
  last_summary_model: string | null
  summaries: SummaryHistoryEntry[]
}
