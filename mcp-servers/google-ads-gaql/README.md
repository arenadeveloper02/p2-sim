# Google Ads GAQL MCP Server

MCP server that exposes the Google Ads GAQL schema (resources, metrics, segments, rules) and a GAQL validator over **Streamable HTTP** transport.

## Why this exists

The Sim Google Ads V1 block had a hardcoded GAQL prompt — every time Google Ads added a new resource, metric, or segment, someone had to edit `prompt.ts`. This MCP server is the source of truth for the GAQL surface, so the GAQL generator can fetch it dynamically.

## Tools exposed

| Tool | Purpose |
|------|---------|
| `get_schema` | Full schema dump (resources + metrics + segments + rules). |
| `get_schema_for_prompt` | Compact human-readable schema, ready to paste into a system prompt. |
| `get_resources` | List/filter resources (tables) by category or search. |
| `get_resource` | Get one resource with required fields, supported segments/metrics. |
| `get_metrics` | List/filter metrics by category or search. |
| `get_segments` | List/filter segments by category or search. |
| `get_rules` | Quality gates / validation rules (mandatory date filter, no DURING, etc.). |
| `validate_query` | Validate a GAQL string against the rules. |

## Setup

```bash
cd mcp-servers/google-ads-gaql
bun install   # or: npm install
bun run build # or: npm run build
bun run start # or: npm run start
```

By default it listens on `http://0.0.0.0:3333/mcp` and exposes a health check at `http://0.0.0.0:3333/health`.

Override with env vars:

- `PORT` (default `3333`)
- `HOST` (default `0.0.0.0`)

## Connecting from Sim

1. Open Sim → **Workspace Settings → MCP Servers**.
2. Click **Add MCP Server**.
3. Set:
   - **Name**: `google-ads-gaql`
   - **Transport**: `streamable-http`
   - **URL**: `http://<host>:3333/mcp`
4. Save and verify status is **Connected**. The 8 tools above should appear.

## Using it from the GAQL block

Two integration paths:

1. **Server-side (recommended)** — call `get_schema_for_prompt` once per request inside `app/api/google-ads-v1/query/query-generation.ts` and inject the returned text into the system prompt instead of the hardcoded constant. New Google Ads resources/metrics show up automatically as soon as the MCP schema is updated.
2. **Agent-driven** — let an Agent block call `get_resources` / `get_metrics` / `validate_query` directly during multi-step planning.

## Extending the schema

Source files (no DB, no API calls — pure data):

- `src/schema/resources.ts`
- `src/schema/metrics.ts`
- `src/schema/segments.ts`
- `src/schema/rules.ts`

When Google Ads ships a new resource or metric, add it to the matching file and rebuild. (Future improvement: optionally hydrate live from the Google Ads `GoogleAdsField` API.)
