# Local Copilot (Arena Copilot) — Technical Overview

An in-process AI workflow assistant that runs inside the Arena Next.js application (`apps/sim`) and calls your own LLM provider directly. For allowlisted users it fully replaces the cloud "Mothership" Go agent (`copilot.sim.ai`) — same chat UI, same tools, zero external copilot dependency.

At a glance:

| Metric | Value |
|--------|-------|
| External copilot dependencies (Local users) | 0 |
| Max tool rounds per turn | 20 |
| Prompt token budget (estimated) | 120k |

---

## Why it exists (business value)

| Goal | How Local Copilot delivers it |
|------|-------------------------------|
| Data residency | Prompts, workflow structure, and chat transcripts stay in your Postgres and your LLM account — nothing relayed through the cloud copilot service. |
| Air-gapped / private cloud | The only outbound traffic is Arena app → your configured provider endpoint (e.g. `api.anthropic.com` or an internal OpenAI-compatible gateway). |
| Cost control | Bring your own API keys and models; spend is visible on your provider dashboard, not metered by the platform. |
| Gradual rollout | Deny-by-default per-user DB allowlist plus a per-user Local / Cloud switch in the chat UI. |

---

## Architecture: one chat pipeline, two backends

The product UI is unchanged. Home chat and the workflow editor both post to `/api/mothership/chat`; the server decides per request whether to run the agent in-process or forward to the cloud Go agent. The local agent emits the same Mothership SSE event schema, so the client needs no fork.

```
Browser — Home chat / Workflow editor chat
  useChat → POST /api/mothership/chat  ·  optional Local / Cloud switch sets copilotBackend
        │
        ▼
handleUnifiedChatPost → runCopilotLifecycle
  Auth (Better Auth session) · workspace access · chat row + user message persisted · SSE stream opened
        │
        ▼  shouldRouteToLocalCopilot() — the single control point (local-copilot/lib/routing.ts)
        │
  ┌─────┴──────────────────────────────┬─────────────────────────────────────┐
  ▼ LOCAL                              ▼ CLOUD                               │
runLocalCopilotMothershipLifecycle   runCheckpointLoop                       │
  in-process bridge                    requires COPILOT_API_KEY              │
        │                                    │                               │
        ▼                                    ▼                               │
runLocalCopilotAgent                 Go Mothership agent                     │
  context build → token budget         SIM_AGENT_API_URL                     │
  → LLM stream → tool loop (≤20)       (default copilot.sim.ai)              │
        │                              cloud-hosted orchestration            │
        ▼                                    │                               │
Your LLM provider                            │                               │
  Anthropic Messages API or any              │                               │
  OpenAI-compatible endpoint                 │                               │
  └──────────────────┬───────────────────────┘
                     ▼
       SSE stream → client (Mothership stream v1)
  Text deltas, tool call/result events, diff overlay for workflow edits —
  identical shape on both paths
```

**Standalone path (optional):** a second, self-contained surface exists at `POST /api/local-copilot/chat` with its own persistence (`local_copilot_*` tables) and an explicit patch-confirmation flow. The primary product path is the Mothership bridge above.

---

## Routing & access control

Access is deny-by-default. A request runs locally only when every gate passes; any failure silently falls back to the cloud backend.

| Gate | Mechanism | Result on failure |
|------|-----------|-------------------|
| Deployment flag | `COPILOT_ENABLED` env (defaults to `true` if unset) | Cloud |
| Per-user allowlist | Row in `local_copilot_user_access` with `has_access = true` (or `local_only = true`). New signups auto-get a row with `has_access = false` via a DB trigger. | Cloud |
| User preference | Local / Cloud switch in the chat toolbar → `copilotBackend` in the request body (stored in localStorage). Users flagged `local_only` are pinned to Local and never see the switch. | Cloud (if user chose it) |
| Request shape | `workspaceId` and `userId` must be present; DB errors fail closed. | Cloud |

Grant access with a single SQL update:

```sql
UPDATE local_copilot_user_access
SET has_access = true, updated_at = now()
WHERE email = 'alice@yourcompany.com';
```

There is no feature-flag service — the gate is env + DB only.

---

## Capabilities (what users get)

### Local-native agent tools

- `create_workflow`, `edit_workflow` — build and mutate workflows (same server implementations as Cloud)
- `get_workflow_context`, `get_available_blocks`, `get_available_integrations`, `invoke_integration_tool` — discovery and integration access
- `validate_workflow`, `get_execution_logs`, `explain_error` — debugging
- `generate_workflow_patch`, `propose_workflow_patch` — diff-based proposals requiring explicit user confirmation
- `search_docs`, optional `load_user_skill`

### Reused platform server tools (70, delegated)

- Run: `run_workflow`, `run_workflow_until_block`, `query_logs`
- Workflow management: `rename_workflow`, `move_workflow`, `delete_workflow`, `manage_folder`, `get_block_upstream_references`, `set_block_enabled`, `set_global_workflow_variables`, `get_deployed_workflow_state`, `list_user_workspaces`
- Workspace: files/VFS (`read`, `glob`, `grep`, create/rename/move/delete files & folders, `workspace_file`), `user_table`, `knowledge_base`, `enrichment_run`, `restore_resource`
- Content & media: `edit_content`, `generate_image`, `generate_audio`, `generate_video`, `ffmpeg`, `search_online`, `function_execute` (code sandbox)
- Deploy & inspect: `deploy_chat`, `deploy_api`, `deploy_mcp`, `redeploy`, `load_deployment`, `promote_to_live`, `update_deployment_version`, `get_deployment_log`, `check_deployment_status`, `diff_workflows`, `get_block_outputs`
- MCP servers: `list_workspace_mcp_servers`, `create_workspace_mcp_server`, `update_workspace_mcp_server`, `delete_workspace_mcp_server`
- Scheduled tasks: `manage_scheduled_task`, `complete_scheduled_task`, `update_scheduled_task_history`, `get_scheduled_task_logs`
- Credentials & OAuth: `manage_credential`, `oauth_get_auth_link`, `oauth_request_access`, `generate_api_key`
- Skills & custom tools: `manage_skill`, `manage_custom_tool`, `manage_mcp_tool`, `search_documentation`, `get_platform_actions`

End-user experience matches Cloud: natural-language build/edit/debug of workflows, file attachments, @-mention context (workflows, logs, knowledge bases, tables, files), streaming responses, a diff overlay with accept/reject for every workflow edit, and voice input. Workflow edits are never silently applied — the editor shows a canvas diff, and the standalone patch path additionally requires an explicit Apply click.

---

## Tool coverage: full 95-tool cloud catalog vs Local

The cloud catalog (`lib/copilot/generated/tool-catalog-v1.ts`) defines 95 tools. Local exposes 72 of them (70 delegated + `create_workflow` / `edit_workflow` natively) plus ~11 local-only tools — about 83 total visible to the model. Every portable `sim`-route tool is now delegated except two deliberate exclusions. Here is where the other 23 catalog tools stand.

| Group | Count | Portable to Local? | What it takes |
|-------|-------|--------------------|---------------|
| Server-route (`sim`), deliberately excluded | 2 | Yes, but withheld | `set_environment_variables` (secret-adjacent write) and `load_integration_tool` (Cloud-only; Local uses `invoke_integration_tool` instead). |
| Client-route runs | 2 | Yes — small work | `run_block`, `run_from_block`. The same server-side delegation trick already used for `run_workflow` applies. |
| Go-route web tools | 6 | Reimplementation | `scrape_page`, `crawl_website`, `get_page_contents`, `search_library_docs`, `search_patterns`, `user_memory` live inside the Go binary. Each needs a TS port + provider keys — `search_online` was already ported this way (Exa). |
| Subagents | 12 | No (architecture) | `workflow`, `run`, `deploy`, `auth`, `knowledge`, `table`, `scheduled_task`, `agent`, `research`, `media`, `file`, `superagent` — these are Go-orchestrated specialist loops, not tools. Porting them means building a multi-agent orchestrator in TS. |
| Internal | 1 | N/A | `respond` is an internal protocol tool of the Go stream, meaningless locally. |

> **Curation trade-offs still apply.**
> (1) Token cost — every tool definition is resent to the model on every turn inside the 120k budget; ~70 delegated definitions are a large slice. (2) Reliability — Cloud partitions the catalog across 12 subagents so no single model sees all 95 tools; Local is one model in one loop. (3) Blast radius — destructive tools (`delete_workflow`, `delete_file`, `delete_workspace_mcp_server`, `manage_credential` delete, `promote_to_live`, …) rely on the same server-side permission checks as Cloud plus system-prompt guardrails requiring explicit user intent. `set_environment_variables` remains deliberately excluded.

---

## LLM providers & configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `COPILOT_ENABLED` | `true` | Master switch for the local backend |
| `COPILOT_PROVIDER` | `anthropic` | `anthropic` \| `openai` \| `azure-openai` \| `bedrock` \| `gemini` \| `openai-compatible` |
| `COPILOT_MODEL` | `claude-sonnet-4-6` | Main agent model |
| `ANTHROPIC_API_KEY` (+`_1`..`_3`) | — | Anthropic key(s), rotated |
| `OPENAI_API_KEY` (+`_1`..`_3`) | — | OpenAI / OpenAI-compatible key(s) |
| `COPILOT_BASE_URL` | provider default | Required for openai-compatible / Azure gateways |
| `COPILOT_ENGAGEMENT_MODEL` | `gpt-4.1-nano` | Small model for live status copy (optional) |

> **Two providers are fully wired today.** `anthropic` uses the native Anthropic Messages API; everything else rides the OpenAI-compatible client. `bedrock` and `gemini` are accepted provider IDs but have no dedicated key resolution — they only work behind an OpenAI-compatible gateway. `COPILOT_API_KEY` is Cloud Mothership auth and is never used for local LLM calls.

When `COPILOT_PROVIDER=anthropic`, Local Copilot sends Anthropic `cache_control` on the last tool definition and the static system prompt block (plus top-level automatic caching). Verify hits via `Arena Copilot model round finished` logs: look for `cacheReadTokens` / `cacheCreationTokens`.

---

## Context engineering & token management

Providers are stateless — the full prompt is rebuilt from Postgres on every turn. A budget layer (`lib/context/context-budget.ts`) keeps large workflows and long threads inside model limits.

| Mechanism | Default | Behavior |
|-----------|---------|----------|
| Total prompt budget | 120,000 est. tokens | Oldest conversational messages dropped until the prompt fits |
| Workflow full-state budget | 24,000 est. tokens | Above this, workflow switches to compact mode (block ids/types/names only; selected block keeps full detail) |
| Recent turns verbatim | 6 turns | Older turns collapse into one compressed system summary |
| History cap | 50 messages | Hard limit on prior rows loaded per turn |
| Per-message cap | 8,000 chars | Long messages truncated in recent history |

Token estimation is chars ÷ 4 (heuristic, not a tokenizer) — budget decisions are logged per turn as `Arena Copilot prompt budget applied`.

---

## Data & persistence

**Mothership bridge (primary path — home + editor chat):** transcript in shared `copilot_chats` / `copilot_messages` — same history whether the user is on Local or Cloud, so switching backends never loses context. Local-copilot tables are not written on this path (`persistLocally: false`).

**Standalone path (local-native API):** six dedicated tables — `local_copilot_conversations`, `_messages`, `_tool_calls`, `_patches`, `_audit_logs`, `_user_access`. Full audit trail: every tool invocation and patch apply/reject is a row.

Migrations: `0248` (core tables), `0249` (allowlist), `0250` (auto-provision trigger + backfill), `0251` (adds `local_only`).

---

## Security model

| Control | Implementation |
|---------|----------------|
| Authentication | Better Auth session on every route |
| Authorization | Workspace membership check + deny-by-default user allowlist; DB errors fail closed |
| Secret handling | `sanitizeForLlm()` strips API keys/tokens from all context JSON before prompting; credentials appear as metadata only (provider name, connection status) |
| Change safety | Editor edits go through a visible diff with accept/reject; standalone patches carry `requiresConfirmation: true` and the apply route re-validates |
| Network surface | Arena app → your provider endpoint only; no cloud relay for Local users |
| Auditability | `local_copilot_audit_logs` records chat, tool, and patch actions (standalone path) |

---

## Feature parity vs Cloud Mothership

| Capability | Local | Cloud (Go Mothership) |
|------------|-------|------------------------|
| Home chat workflow creation | Yes | Yes |
| Workflow editor chat (same UI) | Yes | Yes |
| VFS / workspace file context | Partial (workspace snapshot in payload) | Full Go-side context engine |
| Subagents / advanced orchestration | Limited | Full (12 specialist subagents) |
| Web research tools (scrape, crawl, memory) | `search_online` only | Full Go-executed suite |
| Chat history | `copilot_messages` (shared) | `copilot_messages` + Go memory |

Design intent: parity on core build/debug flows for self-hosted deployments, not a byte-for-byte replica of every Cloud feature.

---

## Moving from Cloud to Local: advantages vs trade-offs

### Advantages

- **Data residency & privacy** — prompts, workflow structure, and transcripts never leave your infrastructure except to the LLM provider you choose; works air-gapped behind an internal gateway.
- **No vendor dependency** — the cloud agent (`copilot.sim.ai`) is out of the request path entirely; a vendor outage cannot take down your copilot.
- **Cost control** — bring your own keys and models; Local mothership still honors platform spend caps when billing is enabled, and records usage to the same ledger.
- **Model freedom** — any Anthropic or OpenAI-compatible model, including self-hosted models behind a compatible gateway; swap via env without code changes.
- **One less network hop** — inference goes app → provider directly, with no relay through a third party.
- **Compliance & audit** — chat history in your Postgres; standalone path adds a full tool/patch audit trail.

### Disadvantages

- **Capability gap** — ~83 tools vs the 95-tool cloud catalog; no specialist subagents, no web scrape/crawl or long-term user memory; `set_environment_variables` withheld by design.
- **Quality ceiling on complex tasks** — one model in one loop vs the cloud's orchestrated multi-agent pipeline; context summarization is a chars÷4 heuristic rather than a native engine.
- **Operational ownership** — you manage API keys, spend monitoring, model upgrades, the allowlist, and DB migrations; agent load scales with your Next.js instances.
- **No automatic failover** — if your provider is down, users must manually switch to Cloud (impossible for `local_only` users).
- **Parity drift** — new cloud copilot features arrive on the Go agent first and must be ported deliberately.

---

## Risks & operational considerations

- **Token pressure** — very large workflows plus long threads can still approach model limits despite budgeting; compact mode trades context fidelity for headroom, and the chars÷4 estimate can miss provider hard limits at the edges.
- **No automatic fallback** — if your LLM provider is down, Local users have no cloud fallback unless they manually flip the switch to Cloud (and only if they are not `local_only`).
- **Scaling is tied to the app** — the agent has no separate scaling unit; chat concurrency scales with your Next.js instances. Plan horizontal app scaling as adoption grows.
- **Billing** — Local mothership turns use the same spend gates as Cloud (`checkMothershipUsageLimits` / self-hosted mothership copilot cap) before the agent runs, and Local records model cost via `recordModelUsage` (`source: 'copilot'`). When billing is disabled (`isBillingEnabled` false), those checks no-op — spend control then lives on your LLM provider dashboard. The standalone `/api/local-copilot/chat` path does not apply the mothership spend gate.

---

## Recommended rollout

1. Apply DB migrations `0248`–`0251` in staging (`cd packages/db && bun run db:migrate`).
2. Set `COPILOT_ENABLED=true`, provider, model, and provider API key in `apps/sim/.env`.
3. Grant pilot users: `UPDATE local_copilot_user_access SET has_access = true WHERE email = ...`.
4. Verify `GET /api/local-copilot/config` returns `enabled: true, canSwitchBackend: true`.
5. Exercise home chat (multi-turn, workflow create) and editor chat; watch logs for provider errors and `workflowDetail: 'compact'`.
6. Expand the allowlist for broader org rollout; optionally pin sensitive users with `local_only = true`.

---

## Key files for engineering review

| Concern | Start here |
|---------|------------|
| Routing decision | `apps/sim/local-copilot/lib/routing.ts` · `apps/sim/lib/copilot/request/lifecycle/run.ts` |
| Agent behavior | `apps/sim/local-copilot/lib/agent/orchestrator.ts` (system prompt + tool loop) |
| Context sizing | `apps/sim/local-copilot/lib/context/context-budget.ts` |
| Security | `apps/sim/local-copilot/lib/security/sanitize.ts` · `lib/access.ts` |
| UI bridge | `apps/sim/local-copilot/integration/mothership-lifecycle.ts` |
| Schema | `packages/db/migrations/0248_local_copilot.sql` (+ `0249`–`0251`) |
| Full docs | `apps/sim/local-copilot/README.md` (operators) · `executive.md` (leadership) |
