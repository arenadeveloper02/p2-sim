# Local Copilot Stronger Multi-Agent Orchestration

**Date:** 2026-07-22  
**Status:** Approved (design)  
**Scope:** Expand Local Copilot specialists beyond soft domain subsets + ≤3 parallel fact-gathering passes toward Cloud’s 12-subagent quality  
**Approach:** Hybrid — expanded turn-start pre-pass + Cloud-named callable specialist tools with free nesting under hard budgets

## Decisions

| Topic | Choice |
|-------|--------|
| Orchestration model | Hybrid: keep/expand classify → parallel pre-pass **and** mid-turn callable specialists |
| Callable specialist set | Full Cloud catalog (12) |
| Specialist authority | Domain-scoped writes (same server-side permission checks as leaf tools today) |
| Nesting | Free nesting, gated by turn budget |
| Turn budget (v1) | Max depth 3, max 4 concurrent specialists, 90s per specialist, max 8 specialist invocations per user turn |
| Pre-pass | Keep + expand across all 12 domains; parallel cap ≤4 |
| Specialist tool exposure | Synthetic Cloud-named tools in the main (and nested) catalog |
| Main agent leaf tools | Intent-filtered leaf tools ∪ always-on ∪ 12 specialists (not full leaf catalog every turn) |
| SSE / UI (v1) | Specialist = tool call + status + nested leaf tool events; no new Cloud subagent-span protocol |
| Shared runner | One `executeSpecialistLoop` for pre-pass and mid-turn / nested calls |

## Problem

Cloud Mothership partitions work across 12 Go-orchestrated specialist subagents:

`workflow`, `run`, `deploy`, `auth`, `knowledge`, `table`, `scheduled_task`, `agent`, `research`, `media`, `file`, `superagent`

Local Copilot today only:

1. Heuristically classifies the user turn into soft domains (`data` merges knowledge+table; `schedule` ≠ Cloud `scheduled_task`).
2. Optionally runs a sequential research/auth “specialist pass” **or** up to **3** parallel fact-gathering loops.
3. Leaves the main agent in one loop with a filtered (or full) leaf tool list — no mid-turn specialist delegation, no nesting, weak write specialization.

That is the largest remaining quality gap vs Cloud on complex multi-domain turns (build + auth + deploy, research then edit, integration actions via superagent, etc.).

## Goals

1. Expose all **12 Cloud-named** specialists as callable Local tools the main agent (and nested specialists) can invoke mid-turn.
2. Expand turn-start pre-pass to the same 12 domains with parallel fan-out **≤4**, injecting findings into the parent prompt.
3. Allow specialists **domain-scoped writes** so delegated work can complete, not only gather facts.
4. Allow **free nesting** under explicit budgets so e.g. `workflow` → `auth` → leaf tools works without unbounded cost.
5. Reuse one specialist runner for pre-pass and callable paths to avoid two orchestration models.
6. Keep mothership streaming compatible: specialist invocations appear as tool calls (existing UI titles in `tool-display.ts`).

## Non-goals

- Porting Go-only web tools (`scrape_page`, `crawl_website`, `get_page_contents`, `search_library_docs`, `search_patterns`).
- Emitting Cloud subagent span / lane protocol in v1 (polish later).
- Accurate Anthropic cache-priced billing for nested specialist rounds.
- Dropping intent-based leaf filtering on the main agent (full catalog every turn).
- Separate OS processes or a Go-style supervisor binary — stay in-process TS inside `local-copilot`.
- Changing Cloud Mothership Go agent behavior.

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|-------|
| Domains | `local-copilot/lib/agent/specialists/domains.ts` | Soft domains; `data` + `schedule`; always-on + leaf sets |
| Classifier | `…/specialists/classify.ts` | Keyword heuristic; `MAX_PARALLEL_SUBAGENTS = 3` |
| Specialist loop | `…/specialists/specialist-pass.ts` | ≤3 rounds; gather-oriented system prompt; no nested specialists |
| Parallel fan-out | `…/specialists/parallel-subagents.ts` | Promise.all + 90s timeout; abort-linked |
| Orchestrator | `local-copilot/lib/agent/orchestrator.ts` | Pre-pass then main tool loop; leaf executor only |
| Cloud catalog | `lib/copilot/generated/tool-catalog-v1.ts` | 12 `route: 'subagent'` entries with param shapes |
| UI titles | `lib/copilot/tools/tool-display.ts` | Already maps most specialist names to “X Agent” |

## Design

### Architecture

```
User turn
  → classifyLocalCopilotIntent (12 domains)
  → optional pre-pass: parallel specialists (≤4) via shared runner
  → inject findings into parent messages
  → main agent loop:
        tools = always-on ∪ intent leaf tools ∪ 12 specialist tools
        on specialist tool call → nested executeSpecialistLoop
              (depth≤3, concurrent≤4, 90s, ≤8 invocations/turn)
        specialists may call other specialists (same caps)
  → parent synthesizes / continues
```

### Domain realignment (Cloud parity)

Replace Local soft names with Cloud IDs. Drop `general` as a specialist (keep as classifier fallback → full leaf catalog + specialists).

| Domain | Leaf tools (writes included) |
|--------|------------------------------|
| `workflow` | create/edit/validate/patch, folder/skill/custom-tool management, workflow inspect helpers (as today’s WORKFLOW_TOOLS) |
| `run` | run_*, logs, validate, related inspect |
| `deploy` | deploy_*, promote, MCP server CRUD, diff/deployed state |
| `auth` | manage_credential, OAuth links, generate_api_key, integration discovery |
| `knowledge` | `knowledge_base` (+ materialize where relevant) |
| `table` | `user_table`, `enrichment_run` |
| `scheduled_task` | manage/complete/history/logs |
| `agent` | `list_integration_tools`, `invoke_integration_tool`, `manage_mcp_tool`, `load_user_skill`, `function_execute` |
| `research` | `search_online`, docs search, `user_memory` |
| `media` | `generate_image` / `generate_audio` / `generate_video`, `ffmpeg` |
| `file` | VFS read/write/edit/delete/folders |
| `superagent` | Union of `agent` + `auth` + light file read (`read` / `glob`) so integration actions can auth and attach files |

Always-on tools remain on every agent (main + specialists). When nesting depth allows, specialists also receive the **other** specialist tools (excluding self-call optional; self-call is allowed but still consumes budget).

### Synthetic specialist tools

New module `specialist-tools.ts` defines 12 `LocalCopilotToolDefinition`s mirroring Cloud param shapes from `tool-catalog-v1.ts`:

- `workflow` / `file` / `media` — optional `prompt`
- `research` — required `topic`
- `run` — required `request`, optional `context`
- `deploy` / `auth` / `knowledge` / `table` / `scheduled_task` / `agent` — required `request`
- `superagent` — required `task`

These are **not** leaf tools in `executeLocalCopilotTool`. The orchestrator (and nested specialist loop) intercepts by name before the leaf executor.

### Shared runner & nesting

`executeSpecialistLoop` becomes the single execution engine:

1. Build tool list: domain leaf ∪ always-on ∪ specialist tools (if `budget.depth < maxDepth`).
2. Domain system hint + write-capable specialist prompt (complete the request; return a concise result).
3. Bounded internal model↔tool rounds: keep `SPECIALIST_PASS_MAX_ROUNDS = 3` per specialist invocation (nested specialist calls are separate invocations, each with their own 3-round cap).
4. On nested specialist tool call: recurse with `budget.enter(childDomain)`.
5. Return truncated findings/result string to parent as the tool result (~12k char cap aggregate).

Pre-pass (`runParallelSubagents`) and mid-turn calls share this runner. **Pre-pass invocations count toward the same turn budget** (max 8 total).

### Turn budget (`budget.ts`)

Per user turn, create one `SpecialistBudget`:

| Cap | Value |
|-----|-------|
| Max nesting depth | 3 — main agent is depth 0; first specialist is depth 1; deepest allowed is depth 3 (main → s1 → s2 → s3) |
| Max concurrent specialists | 4 |
| Per-specialist wall timeout | 90_000 ms |
| Max specialist invocations / turn | 8 (pre-pass + mid-turn + nested, combined) |

Exhaustion behavior: return a structured soft failure to the calling model (`success: false` + reason). Do **not** abort the whole user turn unless the parent `AbortSignal` fired.

Concurrency: when the main model emits multiple specialist tool calls in one round, run up to 4 in parallel (reuse parallel-subagents patterns); queue or soft-fail excess within that round according to remaining invocation budget.

### Classifier & pre-pass

Update `classify.ts`:

- Patterns for `knowledge` vs `table` (split today’s `data`).
- Rename `schedule` → `scheduled_task`.
- Add `agent` / `superagent` heuristics (integration invoke, “send email”, MCP, skills).
- `PARALLEL_SUBAGENT_PRIORITY` covers all 12 (ordered by value).
- `MAX_PARALLEL_SUBAGENTS = 4` for pre-pass.
- Pre-pass still requires ≥2 focused candidate domains; otherwise skip (main agent can still call specialists).

Sequential single-domain specialist pass (`shouldRunSpecialistPass`) can remain as a fallback when parallel selection returns empty but research/auth-before-build still applies — or fold into “run one specialist” via the same parallel helper with a 1-domain list. Prefer one code path.

### Orchestrator wiring

In `orchestrator.ts`:

1. Classify → filter leaf tools by intent → **append** 12 specialist tool defs.
2. Run expanded pre-pass when `selectParallelSubagentDomains` returns ≥2 domains (cap 4); inject findings system message.
3. In the main tool-execution path: if `isSpecialistTool(name)`, run shared specialist path with turn budget; else existing leaf executor.
4. Stream nested leaf tool events and the specialist tool call/result through existing SSE / mothership bridge.

### Prompt / system guidance

Add concise main-agent guidance:

- Prefer specialist tools for multi-step domain work; keep leaf tools for simple single calls.
- Do not re-run research/auth already present in pre-pass findings unless stale or failed.
- `superagent` for third-party integration actions; `agent` for listing/invoking tools and skills; `auth` when credentials are missing.

Specialist system prompts: domain hint + “you may call other specialists if needed; respect that nesting is budgeted; finish with a short actionable summary.”

### Error handling

| Failure | Behavior |
|---------|----------|
| Specialist timeout / model error | Soft fail tool result to parent; log warn |
| Budget exhausted | Soft fail with explicit reason |
| Leaf permission / tool error | Unchanged leaf semantics inside specialist |
| Parent abort | Abort all in-flight specialists immediately |

### SSE / UI (v1)

- Specialist invocation = normal `tool_call_start` / `tool_call_result` with Cloud tool name.
- Nested leaf tools stream the same way (flat event stream).
- Status messages: “Consulting workflow specialist…”, “Running N specialists in parallel…”.
- Out of scope: mothership `lane: 'subagent'` span nesting parity.

### Testing

- Unit: domain rename/split, classifier, budget enter/exit/exhaust, `isSpecialistTool`, parallel domain selection ≤4.
- Mocked-provider: main calls `research` then continues; nested `workflow`→`auth` respects depth; budget soft-fail; pre-pass counts against invocation budget.
- No live LLM e2e required for merge.

### Docs follow-ups (same PR or immediate after)

- Update `local-copilot/overview.md` parity table: specialists = hybrid 12 callable + pre-pass ≤4.
- Update README agent layout for new modules.

## Implementation sketch (file plan)

| File | Change |
|------|--------|
| `specialists/domains.ts` | 12 Cloud domains + leaf sets + hints |
| `specialists/classify.ts` | Heuristics, priority, `MAX_PARALLEL_SUBAGENTS = 4` |
| `specialists/specialist-tools.ts` | New — 12 synthetic defs + `isSpecialistTool` |
| `specialists/budget.ts` | New — turn budget |
| `specialists/specialist-pass.ts` | Nested specialist calls, write-capable prompt, budget hooks |
| `specialists/parallel-subagents.ts` | Cap 4; share budget |
| `agent/orchestrator.ts` | Append specialist tools; intercept mid-turn |
| `overview.md` / `README.md` | Parity notes |
| `*.test.ts` | Classifier, budget, intercept, nesting |

## Risks

- **Cost/latency:** Nested specialists multiply model rounds; budgets are mandatory and must be logged (`specialistInvocations`, `maxDepthReached`).
- **Double work:** Expanded pre-pass + mid-turn calls can overlap; mitigate via findings injection + prompt “don’t repeat unless needed.”
- **Prompt size:** +12 small tool schemas is acceptable; avoid also dumping full leaf catalog when intent is focused.
- **Destructive writes in nested agents:** Same permission checks as today; system prompt still requires explicit user intent for deletes/promotes.

## Success criteria

1. All 12 Cloud specialist names are invocable from Local’s main agent tool list.
2. Pre-pass can fan out up to 4 domains from the expanded classifier.
3. Nested specialist calls work up to depth 3 and soft-fail past budget.
4. Specialists can perform domain writes (e.g. `edit_workflow` inside `workflow`) under existing authz.
5. Unit/mocked tests cover classifier split, budget, and nested intercept.
6. Overview docs no longer describe Local as “≤3 soft specialists only.”
