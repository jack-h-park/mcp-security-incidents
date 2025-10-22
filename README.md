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
FIRECRAWL_MCP_COMMAND=npx
FIRECRAWL_MCP_ARGS=["-y","firecrawl-mcp"]
# optional extra env for the MCP process
# FIRECRAWL_MCP_ENV={"NODE_EXTRA_CA_CERTS":"/path/to/cert.pem"}
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

### Admin Console
- Visit `/admin` while the dev server is running to trigger crawl/summarize pipelines.
- The server must have `PIPELINE_TOKEN` configured; the admin page invokes the existing API routes using that token.
- Optional overrides: `INTERNAL_BASE_URL` if the app is deployed behind a proxy.

Trigger the crawl pipeline securely:
```bash
curl -XPOST http://localhost:3000/api/pipeline/crawl \
  -H "Authorization: Bearer $PIPELINE_TOKEN"
```

### Firecrawl Integration
- The crawler now talks to the `firecrawl-mcp` server over MCP stdio (`npx -y firecrawl-mcp` by default)
- Configure the MCP binary via `FIRECRAWL_MCP_COMMAND`, `FIRECRAWL_MCP_ARGS`, and `FIRECRAWL_MCP_ENV`
- API credentials/URL are forwarded to the MCP process from the current environment
- Ensure your Firecrawl project is configured for the seeds in `app/api/pipeline/crawl/route.ts`

### Summaries
Running `/api/pipeline/summarize` stores one summary per incident, using the rule-based fallback when no LLM key is present.
