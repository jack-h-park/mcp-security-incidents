## MCP Security Incidents

This app crawls security advisories, normalizes them into Supabase, and renders incident summaries with Next.js.

### Prerequisites
- Node 18+ (Next.js App Router)
- Supabase project with tables: `raw_items`, `incidents`, `incident_sources`, `summaries`
- Firecrawl instance (cloud or self-hosted)

### Environment Variables
Create `.env.local` with at least:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
PIPELINE_TOKEN=super-secret-token
FIRECRAWL_API_URL=https://api.firecrawl.dev
FIRECRAWL_API_KEY=fc_xxxx
# optional
FIRECRAWL_TIMEOUT_MS=15000
FIRECRAWL_RETRIES=3
OPENAI_API_KEY=sk-...
REVALIDATE_TOKEN=...
```

### Running Locally
```bash
npm install
npm run dev
```

Trigger the crawl pipeline securely:
```bash
curl -XPOST http://localhost:3000/api/pipeline/crawl \
  -H "Authorization: Bearer $PIPELINE_TOKEN"
```

### Firecrawl Integration
- `lib/mcp-firecrawl.ts` calls `POST ${FIRECRAWL_API_URL}/scrapeBatch`
- Requests return markdown (`extractor: 'markdown'`) and retry on transient failures
- Ensure your Firecrawl project is configured for the seeds in `app/api/pipeline/crawl/route.ts`

### Summaries
Running `/api/pipeline/summarize` stores one summary per incident, using the rule-based fallback when no LLM key is present.
