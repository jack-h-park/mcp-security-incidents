// app/admin/actions.ts
'use server'

import { revalidatePath } from 'next/cache'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSummarizerOption, setSummarizerOption } from '@/lib/settings'
import { createSummaryRun } from '@/lib/summary-runner'
import { SummarizerOption } from '@/lib/summarizer-options'

type PipelineType = 'crawl' | 'summarize'

type PipelineResult = {
  ok: boolean
  status: number
  body: unknown
  error?: string
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

async function triggerPipeline(type: PipelineType): Promise<PipelineResult> {
  const token = process.env.PIPELINE_TOKEN
  if (!token) {
    return {
      ok: false,
      status: 500,
      body: null,
      error: 'PIPELINE_TOKEN is not configured on the server'
    }
  }

  const base =
    process.env.INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    DEFAULT_BASE_URL

  try {
    const res = await fetch(`${base}/api/pipeline/${type}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        error:
          (body as { error?: string }).error ??
          `Request failed with ${res.status}`
      }
    }

    return { ok: true, status: res.status, body }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error triggering pipeline'
    }
  }
}

export async function runCrawl(): Promise<PipelineResult> {
  return triggerPipeline('crawl')
}

export async function runSummarize(): Promise<PipelineResult> {
  return triggerPipeline('summarize')
}

export async function loadSummarizerPreference(): Promise<{
  option: SummarizerOption
}> {
  const option = await getSummarizerOption()
  return { option }
}

export async function updateSummarizerPreference(
  option: SummarizerOption
): Promise<{ ok: boolean; error?: string }> {
  const result = await setSummarizerOption(option)
  return result
}

export async function summarizeIncidentNow({
  incidentId,
  provider
}: {
  incidentId: string
  provider: SummarizerOption
}): Promise<
  | {
      ok: true
      summary: {
        id: string
        incident_id: string
        tl_dr: string
        summary_md: string
        provider: SummarizerOption
        model: string | null
        fallback_from: SummarizerOption | null
        ran_at: string
        created_at: string
      }
    }
  | { ok: false; error: string }
> {
  const run = await createSummaryRun({
    incidentId,
    providerOverride: provider,
    triggeredBy: 'admin'
  })

  if (!run.ok) {
    return { ok: false, error: run.error }
  }

  revalidatePath('/')
  revalidatePath(`/incidents/${incidentId}`)

  return { ok: true, summary: run.summary }
}

export async function deleteSummaryRun({
  summaryId,
  incidentId
}: {
  summaryId: string
  incidentId: string
}): Promise<
  | { ok: true; latest?: { id: string; ran_at: string | null; provider: SummarizerOption | null; model: string | null } }
  | { ok: false; error: string }
> {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('summaries')
    .delete()
    .eq('id', summaryId)

  if (error) {
    return { ok: false, error: error.message }
  }

  const { data: latest } = await supabaseAdmin
    .from('summaries')
    .select('id, provider, model, ran_at, created_at')
    .eq('incident_id', incidentId)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest) {
    await supabaseAdmin
      .from('incidents')
      .update({
        last_summarized_at: latest.ran_at ?? latest.created_at,
        last_summary_provider: latest.provider,
        last_summary_model: latest.model
      })
      .eq('id', incidentId)
  } else {
    await supabaseAdmin
      .from('incidents')
      .update({
        last_summarized_at: null,
        last_summary_provider: null,
        last_summary_model: null
      })
      .eq('id', incidentId)
  }

  revalidatePath('/')
  revalidatePath(`/incidents/${incidentId}`)

  return {
    ok: true,
    latest: latest
      ? {
          id: latest.id,
          ran_at: latest.ran_at ?? latest.created_at,
          provider: latest.provider,
          model: latest.model
        }
      : undefined
  }
}
