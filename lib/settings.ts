// lib/settings.ts
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  DEFAULT_SUMMARIZER_OPTION,
  isSummarizerOption,
  SummarizerOption
} from '@/lib/summarizer-options'

export const SUMMARIZER_SETTINGS_TABLE =
  process.env.APP_SETTINGS_TABLE ?? 'settings'

export const SUMMARIZER_SETTING_KEY = 'summarizer_provider'

function coerceSummarizerOption(input: unknown): SummarizerOption | null {
  if (typeof input === 'string') {
    return isSummarizerOption(input) ? input : null
  }
  if (input && typeof input === 'object') {
    const option = (input as { option?: unknown }).option
    if (typeof option === 'string' && isSummarizerOption(option)) {
      return option
    }
    const value = (input as { value?: unknown }).value
    if (typeof value === 'string' && isSummarizerOption(value)) {
      return value
    }
  }
  return null
}

export async function getSummarizerOption(): Promise<SummarizerOption> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from(SUMMARIZER_SETTINGS_TABLE)
      .select('value')
      .eq('key', SUMMARIZER_SETTING_KEY)
      .maybeSingle()

    if (error) {
      console.warn('[settings] failed to load summarizer option', {
        message: error.message
      })
      return DEFAULT_SUMMARIZER_OPTION
    }

    const parsed = coerceSummarizerOption(data?.value)
    return parsed ?? DEFAULT_SUMMARIZER_OPTION
  } catch (error) {
    console.warn('[settings] unexpected error loading summarizer option', {
      message: error instanceof Error ? error.message : String(error)
    })
    return DEFAULT_SUMMARIZER_OPTION
  }
}

export async function setSummarizerOption(
  option: SummarizerOption
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from(SUMMARIZER_SETTINGS_TABLE)
      .upsert(
        {
          key: SUMMARIZER_SETTING_KEY,
          value: { option }
        },
        { onConflict: 'key' }
      )

    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
