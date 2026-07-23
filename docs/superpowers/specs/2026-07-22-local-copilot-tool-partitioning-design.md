# Local Copilot Hard Tool Partitioning

**Date:** 2026-07-22  
**Status:** Approved  
**Scope:** Hybrid model-routed specialists matching Cloud’s 12 subagent partitions  
**Approach:** 1 — Specialist-as-native-tools (parent sees only the 12 entry tools)

## Decisions

| Topic | Choice |
|-------|--------|
| Shape | Hybrid: parent = specialist entry tools only; specialists own leaf catalogs |
| Routing | Model-routed (parent LLM calls specialist tools) — Cloud-like |
| Specialist set | Cloud’s 12: `workflow`, `run`, `deploy`, `auth`, `knowledge`, `table`, `scheduled_task`, `agent`, `research`, `media`, `file`, `superagent` |
| Parent always-on leaves | None (strict Cloud parity) |
| Multi-specialist fan-out | Parallel up to 3 per parent round; remainder sequential |
| Nested specialists | Forbidden — specialists see leaf tools only |
| Heuristic pre-routing | Removed from the parent path (`useFullCatalog`, auto parallel/specialist passes) |
| Process model | In-process nested loops (reuse `executeSpecialistLoop` / parallel helpers) — not separate processes |

## Problem

Local Copilot exposes ~86 tool definitions to a single main-agent loop. Soft partitioning (`classifyLocalCopilotIntent` + domain allow-lists) exists, but ambiguous turns set `useFullCatalog: true` and dump the full catalog into every model round. That creates:

1. **Token pressure** — large tool-definition prefix every turn (Anthropic caching helps cost/latency, not routing quality).
2. **Weaker routing** — the model juggles unrelated domains (deploy + media + schedule + …) in one decision surface.
3. **Cloud gap** — Cloud never shows the full leaf catalog to one model; it partitions across 12 Go subagents. Local’s soft filter only approximates that under ideal keyword matches.

## Goals

1. Parent model sees **exactly 12 specialist entry tools** — never the full leaf catalog.
2. Each specialist loop sees only **always-on ∪ domain leaves** for its partition.
3. Parent chooses specialists by **calling tools** (same mental model as Cloud).
4. Multi-intent turns can run **up to 3 specialists in parallel** per parent tool round.
5. Nested leaf tool SSE continues to stream so the UI shows real work under a parent specialist call.
6. Remove the soft-partition fallback that reintroduces the full catalog on ambiguous turns.

## Non-goals

- Porting Go subagent processes or the external sim-agent catalog membership as a hard dependency.
- Giving the parent discovery/action leaf tools (`search_docs`, `invoke_integration_tool`, etc.).
- Exact behavioral parity of Cloud `agent` / `superagent` beyond Local’s available leaves.
- Changing provider selection, prompt budget (120k), or Anthropic cache breakpoints (parent’s 12-tool prefix remains cache-friendly).
- UI redesign for subagent lanes (reuse existing `tool_call_*` + `status` events).

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|--------|
| Soft domains | `local-copilot/lib/agent/specialists/domains.ts` | 9 domains + `general`; `data` merges knowledge+table; `useFullCatalog` |
| Heuristic classifier | `.../specialists/classify.ts` | Keyword scores → primary/secondary; weak → full catalog |
| Specialist loop | `.../specialists/specialist-pass.ts` | ≤3 rounds; leaf filter; findings truncation |
| Parallel fan-out | `.../specialists/parallel-subagents.ts` | Pre-turn heuristic fan-out, cap 3, 90s timeout |
| Orchestrator | `.../agent/orchestrator.ts` | Filters tools → optional parallel/specialist → main loop with filtered/full tools |
| Leaf catalog | `.../tools/definitions.ts` + delegated defs | ~86 tools resolved per turn |
| Cloud subagent defs | `lib/copilot/generated/tool-catalog-v1.ts` | 12 `route: 'subagent'` entries with arg schemas |

## Architecture

```
User turn
  → Parent loop (≤20 rounds)
       tools = exactly the 12 specialist entry tools
  → Parent emits tool_calls (e.g. research, workflow)
  → Executor treats those as subagent tools:
       · up to 3 in parallel, rest sequential
       · each runs executeSpecialistLoop with domain leaf catalog only
       · specialists cannot call other specialists
  → Tool results = truncated findings (+ nested status / leaf tool SSE)
  → Parent synthesizes / may call more specialists / final text
```

| Role | Tool surface | Max rounds |
|------|--------------|------------|
| Parent | 12 specialist entry tools only | existing ≤20 |
| Specialist | always-on ∪ domain leaves (no specialist tools) | keep ~3 (tunable) |

## Parent-facing specialist schemas

Names and primary args align with Cloud catalog entries:

| Tool | Args |
|------|------|
| `workflow` | optional `prompt` |
| `run` | `request`, optional `context` |
| `deploy` | `request` |
| `auth` | `request` |
| `knowledge` | `request` |
| `table` | `request` |
| `scheduled_task` | `request` |
| `agent` | `request` |
| `research` | `topic` |
| `media` | optional `prompt` |
| `file` | optional `prompt` |
| `superagent` | `task` |

**Brief resolution:** use the provided string argument; if the arg is optional and omitted, fall back to the last user turn text (plus any optional `context` for `run`).

## Leaf membership

### Always-on (every specialist; never on parent)

`search_docs`, `search_documentation`, `get_workflow_context`, `get_available_blocks`, `get_available_integrations`, `get_blocks_metadata`, `list_integration_tools`, `open_resource`, `get_platform_actions`, `list_user_workspaces`, `load_user_skill`, `explain_error`, `user_memory`

### Domain leaves (plus always-on)

| Specialist | Leaves |
|------------|--------|
| `workflow` | Existing `WORKFLOW_TOOLS` |
| `run` | Existing `RUN_TOOLS` |
| `deploy` | Existing `DEPLOY_TOOLS` **minus** workspace MCP server CRUD (those move to `agent`) |
| `research` | Existing `RESEARCH_TOOLS` |
| `file` | Existing `FILE_TOOLS` |
| `auth` | Existing `AUTH_TOOLS` |
| `media` | Existing `MEDIA_TOOLS` |
| `scheduled_task` | Existing `SCHEDULE_TOOLS` (rename domain key from `schedule`) |
| `knowledge` | `knowledge_base`, `materialize_file` |
| `table` | `user_table`, `enrichment_run`, `materialize_file` |
| `agent` | `manage_skill`, `manage_custom_tool`, `manage_mcp_tool`, `list_workspace_mcp_servers`, `create_workspace_mcp_server`, `update_workspace_mcp_server`, `delete_workspace_mcp_server`, `load_user_skill` |
| `superagent` | `invoke_integration_tool`, `list_integration_tools`, `get_available_integrations`, `oauth_get_auth_link`, `oauth_request_access`, `manage_credential` |

Remove the soft `data` and `general` domains. Move workspace MCP server CRUD out of `deploy` so it is owned only by `agent`. Destructive leaves keep existing server-side permission checks.

### Parent system prompt

Update the parent `SYSTEM_PROMPT` so it instructs routing via the 12 specialist tools (what each is for) and never names leaf tools as something the parent can call directly. Specialist loops keep their existing focused system hints.

## Execution design

### Specialist-as-native-tools

1. Register 12 synthetic Local tool definitions for the parent catalog.
2. On parent `tool_call` for a specialist name, dispatch to a nested `executeSpecialistLoop` instead of a mothership leaf handler.
3. Batch specialist calls within one parent round: **parallel ≤3**, then sequential for any remaining.
4. Return truncated findings (`SPECIALIST_FINDINGS_MAX_CHARS`) as the parent tool result (`success` + `message` / findings payload).
5. Stream nested leaf `tool_call_start` / `tool_call_result` / `status` events to the client while the specialist runs.

### Abort / timeout / failure

- Parent abort cancels nested specialists (existing signal merge).
- Per-specialist wall timeout (~90s, reuse `PARALLEL_SUBAGENT_TIMEOUT_MS`).
- Specialist failure → tool result `{ success: false, message }` so the parent can retry another specialist or answer without tools.

### Orchestrator cleanup

Remove from the parent turn path:

- `classifyLocalCopilotIntent` → `toolNamesForIntent` / `filterToolsByNames` for the parent catalog
- `useFullCatalog` full-catalog fallback
- Pre-turn auto `runParallelSubagents` / sequential specialist pass injection

Keep / adapt:

- `executeSpecialistLoop` for on-demand nested runs
- Parallel helper for capped concurrent specialist tool calls in a parent round
- Domain system hints inside specialist loops

`classify.ts` may be deleted or reduced to test/telemetry helpers if nothing else imports it after the orchestrator change.

## File touchpoints

| Area | Change |
|------|--------|
| `domains.ts` | 12 Cloud domains; leaf maps; drop `general` / `data` / `useFullCatalog` intent shape |
| New `specialist-tools.ts` (or equivalent) | Parent tool defs + brief parsing + dispatch |
| `specialist-pass.ts` | Accept Cloud domain ids; ensure specialist tools excluded from leaf set |
| `parallel-subagents.ts` | Reuse for on-demand batches of parent specialist calls |
| `orchestrator.ts` | Parent tools = 12 specialists; wire batch dispatch; remove heuristic pre-routing |
| `executor.ts` / tool registry | Register specialist handlers |
| `overview.md` / related docs | Document hard partitioning |
| Tests | Parent catalog size = 12; leaf isolation; parallel cap; no nested specialists; brief fallback |

## Testing

1. **Unit — domains:** each specialist allow-list excludes other specialists’ exclusive leaves and all 12 specialist entry names.
2. **Unit — parent catalog:** `resolveParentTools()` (or equivalent) returns exactly the 12 defs.
3. **Unit — dispatch:** calling `research` with `{ topic }` runs a loop whose tools ⊆ research∪always-on.
4. **Unit — parallel cap:** 5 specialist calls in one round → first 3 concurrent, then 2 sequential (or equivalent observable ordering/cap).
5. **Unit — nesting guard:** specialist tool list never includes specialist entry names.
6. **Integration (optional/light):** one orchestrator turn mock where parent calls `workflow` and receives findings without ever seeing `deploy_*` defs on the parent request.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Parent cannot answer trivial doc questions without a specialist | Expected under strict C; parent must call `research` (or relevant specialist). Monitor latency; revisit always-on only if product requires it. |
| Wrong specialist chosen | Parent can call another specialist in a later round; tool result errors are actionable. |
| Leaf map drift vs Cloud | Soft mirror in `domains.ts`; document that Go catalog is source of truth for Cloud only. |
| Token cost of nested loops | Cap specialist rounds (~3) + findings truncation; parallel cap 3. |
| Anthropic cache churn | Parent tool list is fixed at 12 — better cache stability than soft-filtered variable catalogs. |

## Success criteria

1. Parent model requests never include leaf tool definitions.
2. Ambiguous user turns no longer expand to the ~86-tool catalog.
3. Multi-domain turns can invoke multiple specialists with ≤3 concurrent nested loops.
4. Existing leaf tool execution paths (native + delegated) remain unchanged inside specialists.
5. Docs describe Local partitioning as Cloud-aligned hard partitions, not soft intent filtering.
