// lib/mcp-firecrawl.ts
import { getMcpClient } from '@/lib/mcp-client'
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

type FirecrawlItem = {
  url: string
  title?: string
  content?: string
  fetched_at?: string
  source?: string
  metadata?: Record<string, unknown>
}

type FirecrawlResponse = {
  items: FirecrawlItem[]
}

const FIRECRAWL_SERVER_ID = 'firecrawl-mcp'

const defaultArgs = ['-y', 'firecrawl-mcp']

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return defaultArgs
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : defaultArgs
  } catch {
    return defaultArgs
  }
}

function parseJsonObject(value: string | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)])
      )
    }
  } catch {
    // ignore parse failures, fall back to empty object
  }
  return {}
}

function getServerParameters(): StdioServerParameters {
  const args = parseJsonArray(process.env.FIRECRAWL_MCP_ARGS)
  const extraEnv = parseJsonObject(process.env.FIRECRAWL_MCP_ENV)
  const env: Record<string, string> = {
    ...extraEnv
  }
  if (process.env.FIRECRAWL_API_KEY) {
    env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
  }
  if (process.env.FIRECRAWL_API_URL) {
    env.FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL
  }
  if (process.env.FIRECRAWL_TIMEOUT_MS) {
    env.FIRECRAWL_TIMEOUT_MS = process.env.FIRECRAWL_TIMEOUT_MS
  }
  if (process.env.FIRECRAWL_RETRIES) {
    env.FIRECRAWL_RETRIES = process.env.FIRECRAWL_RETRIES
  }
  return {
    command: process.env.FIRECRAWL_MCP_COMMAND ?? 'npx',
    args,
    env
  }
}

function extractTextPayload(result: CallToolResult): string {
  if (result.isError) {
    const message =
      result.content
        ?.filter(part => part.type === 'text')
        ?.map(part => ('text' in part ? part.text : ''))
        .join('\n')
        .trim() || 'Unknown Firecrawl MCP error'
    throw new Error(message)
  }
  for (const part of result.content ?? []) {
    if (part.type === 'text' && 'text' in part && part.text?.trim()) {
      return part.text
    }
  }
  throw new Error('Firecrawl MCP response did not include text content')
}

function normaliseFirecrawlOutput(url: string, raw: unknown): FirecrawlItem {
  const data =
    (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) ??
    {}
  const innerData =
    (typeof data.data === 'object' && data.data !== null
      ? (data.data as Record<string, unknown>)
      : {}) ?? {}
  const markdown =
    (typeof data.markdown === 'string' && data.markdown) ||
    (typeof innerData.markdown === 'string' && innerData.markdown) ||
    ''
  const html =
    (typeof data.html === 'string' && data.html) ||
    (typeof innerData.html === 'string' && innerData.html) ||
    ''
  const titleCandidates = [
    data.title,
    innerData.title,
    data.pageTitle,
    innerData.pageTitle,
    data?.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>).title
      : undefined,
    innerData?.metadata && typeof innerData.metadata === 'object'
      ? (innerData.metadata as Record<string, unknown>).title
      : undefined
  ].filter(v => typeof v === 'string' && v.trim().length > 0) as string[]
  const fetched =
    (typeof data.fetchedAt === 'string' && data.fetchedAt) ||
    (typeof data.fetched_at === 'string' && data.fetched_at) ||
    (typeof innerData.fetchedAt === 'string' && innerData.fetchedAt) ||
    (typeof innerData.fetched_at === 'string' && innerData.fetched_at) ||
    new Date().toISOString()
  const metadata =
    (typeof data.metadata === 'object' && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : undefined) ??
    (typeof innerData.metadata === 'object' && innerData.metadata !== null
      ? (innerData.metadata as Record<string, unknown>)
      : undefined)

  let fallbackContent = ''
  try {
    fallbackContent = JSON.stringify(raw, null, 2)
  } catch {
    fallbackContent = ''
  }
  const content = markdown || html || fallbackContent

  return {
    url,
    title: titleCandidates[0],
    content,
    fetched_at: fetched,
    source: 'firecrawl-mcp',
    metadata
  }
}

export async function firecrawlScrapeBatch(
  seeds: string[]
): Promise<FirecrawlResponse> {
  if (!seeds.length) return { items: [] }

  const client = await getMcpClient(FIRECRAWL_SERVER_ID, getServerParameters())

  const items: FirecrawlItem[] = []
  for (const url of seeds) {
    try {
      const result = await client.callTool({
        name: 'firecrawl_scrape',
        arguments: {
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          removeBase64Images: true
        }
      })
      const text = extractTextPayload(result)
      const payload = JSON.parse(text)
      items.push(normaliseFirecrawlOutput(url, payload))
    } catch (error) {
      console.error('[firecrawl:mcp] scrape failed', { url, error })
    }
  }

  return { items }
}

