## MCP Security Incidents

This app crawls security advisories, normalizes them into Supabase, and renders incident summaries with Next.js.

### Prerequisites
- Node 18+ (Next.js App Router)
- Supabase project with tables: `raw_items`, `incidents`, `incident_sources`, `summaries`
- Supabase key/value table for app settings:
  - default: `settings` with columns `key text primary key`, `value jsonb`
  - override the table name via `APP_SETTINGS_TABLE` if needed
- Firecrawl instance (cloud or self-hosted)

#### Database migrations
Add/adjust the following columns so summarization history works as expected:

```sql
-- summaries history (multiple rows per incident)
alter table public.summaries
  add column if not exists id uuid primary key default gen_random_uuid(),
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists fallback_from text,
  add column if not exists ran_at timestamptz default now(),
  add column if not exists triggered_by text,
  add column if not exists created_at timestamptz default now();

alter table public.summaries
  drop constraint if exists summaries_incident_id_key;

create index if not exists summaries_incident_ran_at_idx
  on public.summaries (incident_id, ran_at desc);

-- incidents cache of last summary metadata
alter table public.incidents
  add column if not exists last_summarized_at timestamptz,
  add column if not exists last_summary_provider text,
  add column if not exists last_summary_model text;
```

Optionally backfill existing data:

```sql
update public.summaries
set ran_at = coalesce(ran_at, created_at, now())
where ran_at is null;

with latest as (
  select distinct on (incident_id)
    incident_id,
    provider,
    model,
    ran_at
  from public.summaries
  order by incident_id, ran_at desc
)
update public.incidents i
set
  last_summarized_at = l.ran_at,
  last_summary_provider = l.provider,
  last_summary_model = l.model
from latest l
where l.incident_id = i.id;
```

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
OPENAI_SUMMARY_MODEL=gpt-4o-mini # optional override
HUGGINGFACE_API_KEY=hf_xxxx
HUGGINGFACE_MODEL=facebook/bart-large-cnn # optional override
GEMINI_API_KEY=...
GEMINI_SUMMARY_MODEL=gemini-1.5-flash-latest # optional override
REVALIDATE_TOKEN=...
APP_SETTINGS_TABLE=settings # optional override for summarizer preference storage
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
- The `/admin` console now exposes a "Default Summarizer" card with four options:
  1. Rule-based (default template)
  2. Hugging Face (free tier via Inference API)
  3. OpenAI API
  4. Gemini (Google Generative Language API)
- Pipeline runs use the selected provider; failures or missing API keys automatically fall back to the rule-based template.
- Configure API keys in the server environment as shown above. Without keys, only the rule-based option will produce output.
- The selected provider is stored in the Supabase settings table (`key = "summarizer_provider"`).
- Each incident keeps a full summarization history. The home page shows whether an incident has been summarized and by which provider.
- `/admin` now includes an "Incident Summaries" section:
  - choose a provider per incident and run summarization immediately,
  - inspect past runs (provider, model, timestamp, TL;DR),
  - delete individual history entries if necessary.
