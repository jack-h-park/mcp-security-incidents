// lib/summarize.ts
import { getSummarizerOption } from '@/lib/settings'
import {
  DEFAULT_SUMMARIZER_OPTION,
  SummarizerOption
} from '@/lib/summarizer-options'

type SummarizeParams = {
  title?: string
  text: string
  provider?: SummarizerOption
}

export type SummaryResult = {
  tl_dr: string
  summary_md: string
  citations: unknown[]
  provider: SummarizerOption
  model: string | null
  fallbackFrom?: SummarizerOption
}

const OPENAI_SUMMARY_MODEL =
  process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-4o-mini'

const GEMINI_MODEL =
  process.env.GEMINI_SUMMARY_MODEL ?? 'gemini-1.5-flash-latest'

export async function summarize(params: SummarizeParams): Promise<SummaryResult> {
  const { text, title } = params
  const selected =
    params.provider ??
    (await getSummarizerOption().catch(() => DEFAULT_SUMMARIZER_OPTION))

  switch (selected) {
    case 'openai':
      return runProvider('openai', title, text, () =>
        openAiSummary(text, title)
      )
    case 'huggingface':
      return runProvider('huggingface', title, text, () =>
        huggingFaceSummary(text, title)
      )
    case 'gemini':
      return runProvider('gemini', title, text, () =>
        geminiSummary(text, title)
      )
    case 'rule_based':
    default:
      return ruleBased(text, title)
  }
}

function ruleBased(text: string, title?: string): SummaryResult {
  const firstLines = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3)
  const tl_dr = (title ?? firstLines[0] ?? '').slice(0, 140)
  const md = [
    '## Impact',
    `- ${firstLines[0] ?? 'Summary unavailable; review source.'}`,
    '',
    '## Mitigations',
    `- ${firstLines[1] ?? 'Review upstream advisory for mitigation details.'}`,
    '',
    '## References',
    '- (ref:source)'
  ].join('\n')
  return {
    tl_dr,
    summary_md: md,
    citations: [],
    provider: 'rule_based',
    model: 'template-v1'
  }
}

async function runProvider(
  provider: SummarizerOption,
  title: string | undefined,
  text: string,
  run: () => Promise<SummaryResult>
): Promise<SummaryResult> {
  try {
    const result = await run()
    if (result && result.summary_md) {
      return result
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error')
    throw new Error(`[summarize] ${provider} summarizer failed: ${message}`)
  }
  throw new Error(`[summarize] ${provider} summarizer returned empty output`)
}

function buildStructuredPrompt(title: string | undefined, text: string) {
  const trimmed = text.slice(0, 6000)
  return [
    'You are generating a security incident briefing.',
    'Return a compact JSON object with keys:',
    'tl_dr (<=140 chars), summary_md (markdown with sections Impact, Mitigations, References), citations (array).',
    `Title: ${title ?? ''}`,
    'Body:',
    trimmed
  ].join('\n')
}

async function openAiSummary(
  text: string,
  title?: string
): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const prompt = buildStructuredPrompt(title, text)
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(
      `OpenAI request failed (${response.status}) ${bodyText}`
    )
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content)
  return {
    tl_dr: parsed.tl_dr ?? '',
    summary_md: parsed.summary_md ?? '',
    citations: parsed.citations ?? [],
    provider: 'openai',
    model: OPENAI_SUMMARY_MODEL
  }
}

async function huggingFaceSummary(
  text: string,
  title?: string
): Promise<SummaryResult> {
  const apiKey = process.env.HUGGINGFACE_API_KEY
  if (!apiKey) throw new Error('HUGGINGFACE_API_KEY is not configured')

  const model =
    process.env.HUGGINGFACE_MODEL ?? 'facebook/bart-large-cnn'

  const prompt = [
    'Summarize the following security incident in 3 concise sentences.',
    'Focus on impact and potential mitigations.',
    `Title: ${title ?? ''}`,
    'Incident:',
    text.slice(0, 5000)
  ].join('\n')

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 512,
          return_full_text: false
        }
      })
    }
  )

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(
      `Hugging Face request failed (${response.status}) ${bodyText}`
    )
  }

  const data = await response.json()
  const summaryText = Array.isArray(data)
    ? (data[0]?.summary_text as string | undefined)
    : (data?.summary_text as string | undefined)

  const summary = (summaryText ?? '').trim()
  if (!summary) throw new Error('Hugging Face response did not include summary')

  const sentences = summary.split(/(?<=[.?!])\s+/).filter(Boolean)
  const impact = sentences.slice(0, 2).join(' ')
  const mitigations =
    sentences.slice(2).join(' ') ||
    'Review the advisory for mitigation guidance.'

  const tl_drSource = summary.slice(0, 140)
  const tl_dr = (tl_drSource || title || '').slice(0, 140)

  const md = [
    '## Impact',
    `- ${impact || 'Details available in source.'}`,
    '',
    '## Mitigations',
    `- ${mitigations}`,
    '',
    '## References',
    '- (ref:source)'
  ].join('\n')

  return {
    tl_dr,
    summary_md: md,
    citations: [],
    provider: 'huggingface',
    model
  }
}

async function geminiSummary(
  text: string,
  title?: string
): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

  const prompt = buildStructuredPrompt(title, text)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    }
  )

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(
      `Gemini request failed (${response.status}) ${bodyText}`
    )
  }

  const json = await response.json()
  const content =
    json.candidates?.[0]?.content?.parts?.[0]?.text ??
    json.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args ??
    '{}'

  const parsed =
    typeof content === 'string' ? JSON.parse(content) : content ?? {}

  return {
    tl_dr: parsed.tl_dr ?? '',
    summary_md: parsed.summary_md ?? '',
    citations: parsed.citations ?? [],
    provider: 'gemini',
    model: GEMINI_MODEL
  }
}
