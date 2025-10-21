// lib/normalize.ts
export const extractCVEs = (text: string) => {
  const re = /\bCVE-\d{4}-\d{4,7}\b/gi
  return Array.from(new Set(text.match(re) ?? [])).map(s=>s.toUpperCase())
}

export function makeCanonicalKey(item: {
  cves: string[]
  source?: string
  date?: string
  fingerprint?: string
  url?: string
}) {
  if (item.cves?.length) {
    const sorted = [...item.cves].map(s => s.toUpperCase()).sort()
    return sorted[0]
  }

  const source = (item.source ?? 'misc').toLowerCase()
  const date = (item.date ?? '').slice(0, 10) || 'unknown'
  const fingerprint =
    item.fingerprint?.slice(0, 12) ??
    (item.url ? hashContent(item.url).slice(0, 12) : hashContent(`${source}-${date}`).slice(0, 12))

  return `${source}:${date}:${fingerprint}`
}

export function hashContent(s: string) {
  let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i)|0
  return String(h) // 데모용 간이 해시
}
