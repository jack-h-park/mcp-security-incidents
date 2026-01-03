// lib/summary-runner.ts
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { summarize, type SummaryResult } from '@/lib/summarize'
import type { SummarizerOption } from '@/lib/summarizer-options'

type CreateSummaryOptions = {
  incidentId: string
  providerOverride?: SummarizerOption
  triggeredBy?: string
}

export async function createSummaryRun({
  incidentId,
  providerOverride,
  triggeredBy
}: CreateSummaryOptions): Promise<
  | {
      ok: true
      summary: {
        id: string
        incident_id: string
        tl_dr: string
        summary_md: string
        citations: unknown[]
        provider: SummarizerOption
        model: string | null
        fallback_from: SummarizerOption | null
        ran_at: string
        created_at: string
      }
      result: SummaryResult
    }
  | { ok: false; error: string }
> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: incident, error: incidentError } = await supabaseAdmin
    .from('incidents')
    .select('id, title')
    .eq('id', incidentId)
    .maybeSingle()

  if (incidentError) {
    return { ok: false, error: incidentError.message }
  }
  if (!incident) {
    return { ok: false, error: 'Incident not found' }
  }

  let sourceRow: { raw_id: string | null } | null = null
  const primarySource = await supabaseAdmin
    .from('incident_sources')
    .select('raw_id, created_at')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (
    primarySource.error &&
    ((primarySource.error as { code?: string }).code === '42703' ||
      primarySource.error.message?.toLowerCase().includes('created_at'))
  ) {
    const fallbackSource = await supabaseAdmin
      .from('incident_sources')
      .select('raw_id')
      .eq('incident_id', incidentId)
      .order('raw_id', { ascending: false })
      .limit(1)
    if (fallbackSource.error) {
      return { ok: false, error: fallbackSource.error.message }
    }
    sourceRow = fallbackSource.data?.[0] ?? null
  } else if (primarySource.error) {
    return { ok: false, error: primarySource.error.message }
  } else {
    sourceRow = primarySource.data?.[0] ?? null
  }

  if (!sourceRow?.raw_id) {
    return {
      ok: false,
      error:
        'No source material found for this incident. Try running the crawl pipeline first.'
    }
  }

  const { data: raw, error: rawError } = await supabaseAdmin
    .from('raw_items')
    .select('title, body_markdown')
    .eq('id', sourceRow.raw_id)
    .maybeSingle()

  if (rawError) {
    return { ok: false, error: rawError.message }
  }

  const sourceText = (raw?.body_markdown || raw?.title || '').trim()
  if (!sourceText) {
    return {
      ok: false,
      error:
        'Source document is empty. Re-run the crawl pipeline or verify the raw item contents.'
    }
  }

  let result: SummaryResult
  try {
    result = await summarize({
      title: incident.title,
      text: sourceText,
      provider: providerOverride
    })
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Summarization failed unexpectedly'
    }
  }

  const ranAt = new Date().toISOString()
  const insertPayload = {
    incident_id: incidentId,
    tl_dr: result.tl_dr,
    summary_md: result.summary_md,
    citations: result.citations ?? [],
    provider: result.provider,
    model: result.model,
    fallback_from: result.fallbackFrom ?? null,
    ran_at: ranAt,
    triggered_by: triggeredBy ?? null
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('summaries')
    .insert(insertPayload)
    .select('*')
    .maybeSingle()

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError?.message ?? 'Failed to store summary'
    }
  }

  await supabaseAdmin
    .from('incidents')
    .update({
      last_summarized_at: ranAt,
      last_summary_provider: result.provider,
      last_summary_model: result.model
    })
    .eq('id', incidentId)

  return {
    ok: true,
    summary: {
      id: inserted.id,
      incident_id: inserted.incident_id,
      tl_dr: inserted.tl_dr,
      summary_md: inserted.summary_md,
      citations: inserted.citations ?? [],
      provider: inserted.provider,
      model: inserted.model,
      fallback_from: inserted.fallback_from,
      ran_at: inserted.ran_at ?? ranAt,
      created_at: inserted.created_at ?? ranAt
    },
    result
  }
}
