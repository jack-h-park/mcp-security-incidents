// lib/summarize.ts
export async function summarize({ title, text }: { title?: string; text: string }) {
  const base = ruleBased(text, title)
  if (!process.env.OPENAI_API_KEY) return base
  try { return await llmSummary(text, title) } catch { return base }
}

function ruleBased(text: string, title?: string) {
  const firstLines = text.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,3)
  const tl_dr = (title ?? firstLines[0] ?? '').slice(0,140)
  const md = [
    '## Impact', '-', '',
    '## Mitigations', '-', '',
    '## References', '- (ref:source)'
  ].join('\n')
  return { tl_dr, summary_md: md, citations: [] }
}

async function llmSummary(text: string, title?: string) {
  const prompt = `Title: ${title ?? ''}\nText:\n${text.slice(0,6000)}\n\nReturn JSON with keys tl_dr(<=140 chars), summary_md (markdown with Impact/Mitigations/References).`
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages:[{role:'user', content: prompt}] })
  })
  const j = await r.json()
  const content = j.choices?.[0]?.message?.content ?? '{}'
  return JSON.parse(content)
}
