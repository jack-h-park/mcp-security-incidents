// lib/summarizer-options.ts
export type SummarizerOption =
  | 'rule_based'
  | 'huggingface'
  | 'openai'
  | 'gemini'

export const DEFAULT_SUMMARIZER_OPTION: SummarizerOption = 'rule_based'

export const SUMMARIZER_OPTION_METADATA: Record<
  SummarizerOption,
  { label: string; description: string }
> = {
  rule_based: {
    label: 'Rule-based (default)',
    description: 'Quick template summary without external APIs.'
  },
  huggingface: {
    label: 'Hugging Face (free tier)',
    description:
      'Uses Hugging Face Inference API and the configured model to draft summaries.'
  },
  openai: {
    label: 'OpenAI API',
    description:
      'Calls the configured OpenAI model for structured summaries (requires API key).'
  },
  gemini: {
    label: 'Gemini',
    description:
      'Uses Gemini (Google Generative Language API) for structured summaries.'
  }
}

export function isSummarizerOption(value: string): value is SummarizerOption {
  return value === 'rule_based'
    || value === 'huggingface'
    || value === 'openai'
    || value === 'gemini'
}

export function summarizerLabel(option: SummarizerOption | null | undefined): string {
  if (!option) return 'Unknown'
  return SUMMARIZER_OPTION_METADATA[option]?.label ?? option
}
