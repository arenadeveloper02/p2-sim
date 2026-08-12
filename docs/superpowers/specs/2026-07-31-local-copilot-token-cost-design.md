# Local Copilot Token Cost Reduction

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Scope:** `apps/sim/local-copilot/` — cut LLM input-token spend for short turns and long tool loops without a third-party proxy.

## Problem

Local Copilot bill is driven by tokens resent on every model round (parent ≤20 rounds, plus specialist passes). Existing mitigations (6-turn history, session memory, 120k message budget, workflow compact @ 24k, Anthropic `cache_control`, intent tool partitioning) are not enough.

Measured / structural hotspots:

| Rank | Consumer | Typical scale | Gap |
|------|----------|---------------|-----|
| 1 | Tool schemas (~86 defs) | ~15–40k tokens / round | Outside `fitPromptToTokenBudget` |
| 2 | Static `SYSTEM_PROMPT` | ~5k / round | Cacheable when Anthropic hits |
| 3 | Dynamic `Current context` JSON | ~5–30k+ | Includes ~300 `availableBlocks`; never dropped by budget trimmer |
| 4 | In-turn tool-result trail | Variable, compounds | Only `edit_workflow` / `create_workflow` / `function_execute` specially shaped |
| 5 | History rehydration | Medium–large | `mothership-history.ts` rebuilds raw `{ success, output }` — skips `formatToolResultForLlm` |

Multiplicative: each parent round resends system + tools + growing tool trail.

## Goals

- Reduce $ spend on **both** short sessions and long multi-tool sessions.
- Prefer **zero-cost** compaction (no extra LLM calls) before any summarizer.
- Preserve Anthropic prompt-cache hit rates (stable prefix; compress only the live suffix).
- Keep quality: model can re-call tools after fingerprints; block discovery already has `get_blocks_metadata`.
- Observable: existing usage logs show lower `inputTokens` and healthy `cacheReadTokens`.

## Non-goals

- Adopting Headroom / Kompact / FoldBack / leanctx as a runtime dependency.
- Rewriting the static `SYSTEM_PROMPT`.
- DAG lossless memory (lossless-hermes style).
- Changing billing / `usage_log` schema.
- Hard-capping tool-definition tokens out of the request (estimate + log only in v1).

## Prior art (patterns to port, not packages to add)

- [contextkit](https://github.com/drandrewlaw/contextkit) — micro-compact → auto-compact → circuit breaker (TypeScript).
- [codeshell compaction](https://github.com/cjhyy/codeshell) — truncate oversized results → microcompact fingerprints → LLM summary → window compact.
- FoldBack / Headroom — “live zone only” compression to protect provider cache (idea only).

v1 ports **microcompact + insertion-time result budgets + structural context/catalog cuts**. LLM auto-compact is deferred (session memory already covers aged turns).

## Architecture

```
Per user turn
├── Structural (once)
│   ├── Slim context JSON (no full availableBlocks list)
│   ├── Stricter full-catalog fallback
│   └── History: formatToolResultForLlm on reload + optional microcompact
├── Per tool result (insertion time)
│   ├── Tool-specific shaping (existing)
│   └── Global compact stringify + hard char cap
└── Per model round (≤20 loop)
    ├── Microcompact: fingerprint tool results older than last N rounds
    └── Log estimated tool-def tokens alongside message budget
```

No new npm dependency. New module under `apps/sim/local-copilot/lib/context/microcompact.ts`; extend existing `format-tool-result.ts`, `context-budget.ts`, `mothership-history.ts`, `orchestrator.ts`, intent/catalog filtering.

## Components

### 1. Microcompact (`lib/context/microcompact.ts`)

**When:** After each tool round is appended to `messages`, before the next provider call (and once on loaded history after formatting).

**What:** For tool-role messages older than the last `LOCAL_COPILOT_MICROCOMPACT_KEEP_RECENT_ROUNDS` (default **2**) API rounds, replace `content` with a short fingerprint, e.g.:

`[Old tool result cleared — edit_workflow success=true]`

Preserve:

- User and assistant text content
- Tool call ids / names / argument stubs on assistant messages (do not break tool_use / tool_result pairing)
- The most recent N rounds of tool results verbatim (after format + cap)

**Idempotent:** Fingerprinted content must not be re-processed into larger payloads.

### 2. Tool result budget (`format-tool-result.ts`)

- Keep existing special cases (`edit_workflow`, `create_workflow`, `function_execute`, file follow-ups).
- Default path today: `JSON.stringify(result)` with no cap → change to:
  - Compact serialization (no `null, 2` pretty-print for LLM-bound payloads unless a special case needs readability).
  - Hard cap: `LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS` (default **8000**; `function_execute` stdout keeps its existing 12k path or is aligned downward intentionally in implementation).
  - On truncate: append a clear marker so the model knows data was cut and may re-query.
- Export a helper usable from history reload: `formatToolResultForLlm(toolName, result)`.

### 3. History rehydration (`mothership-history.ts`)

`toolResultContent` must call `formatToolResultForLlm(toolCall.name, payload)` instead of dumping raw `output` (especially `workflowState` from past edits).

Then run microcompact over the reconstructed conversational messages so aged turns inside the 6-turn window do not carry full bodies for every tool row.

### 4. Slim context JSON (`context-budget.ts` / `build-context.ts`)

- Stop embedding the full `availableBlocks` array in `buildContextPromptPayload`.
- Keep `availableIntegrations` (small category list).
- Add a short note in context: block catalog is on demand via `get_blocks_metadata` (already in system prompt / tools).
- **Internal** `structuredContext.availableBlocks` may still be built for executor filtering (`executor.ts` uses it) — only the **prompt payload** drops the list. Do not break tool execution.

### 5. Full-catalog fallback (`orchestrator.ts` + intent)

Today: `useFullCatalog || primary === 'general' || tools.length === 0` forces / logs full catalog; hybrid still unions specialist entry tools.

Change:

- Prefer intent-filtered leaf tools ∪ specialist entry tools.
- Fall back to full catalog **only** when the filtered set is empty (or an explicit escape hatch if classification cannot decide and product requires it — default: do **not** auto-full-catalog solely because `primary === 'general'` if hybrid already has tools).
- Keep logging `useFullCatalog` / `toolDefinitionCount` for verification.

### 6. Observability

Extend `Arena Copilot prompt budget applied` (or adjacent log) with:

- `estimatedToolDefinitionTokens` (chars/4 or tokenizer on serialized tool schemas)
- `microcompactClearedCount` / chars freed when microcompact runs
- Existing `inputTokens` / `cacheReadTokens` remain the source of truth for $ 

### 7. Anthropic cache hygiene

Confirm (no behavioral rewrite unless broken):

- Static system prompt is the first cacheable block.
- Tool defs keep `cache_control` on the last tool.
- Dynamic `Current context` / session memory / specialist hints stay **after** the static system block so they do not invalidate the tools+static prefix more than necessary.

Specialist domain hint currently splices at index 1 (before dynamic context). That is acceptable if it is short and stable for the turn; do not move volatile large JSON ahead of tools.

## Data flow

```
load history
  → formatToolResultForLlm per tool row
  → compactChatHistory (6 turns)
  → microcompact aged tool rows
build context (availableBlocks kept in memory, omitted from prompt JSON)
resolve tools (hybrid; full catalog only if empty)
fitPromptToTokenBudget(messages)
loop:
  provider(messages, tools)
  execute tools → formatToolResultForLlm → append
  microcompact(messages)
```

## Error handling

- Truncation / microcompact never throw into the user turn — on serialize failure, fall back to a small `{ success: false, error: 'tool result omitted' }` style payload.
- Fingerprints must not break Anthropic tool_result pairing (same `tool_call_id`).
- If microcompact would leave zero recent tool detail in the current turn, skip clearing the current round.

## Testing

- Unit: `microcompact` keeps last N rounds; idempotent; preserves tool_call_id pairing.
- Unit: `formatToolResultForLlm` caps large JSON; edit_workflow still strips heavy state.
- Unit: `toolResultContent` / history rebuild uses formatter (no raw `workflowState` in history string).
- Unit: `buildContextPromptPayload` omits `availableBlocks` but still includes integrations note / categories.
- Unit: catalog fallback does not force full list when hybrid tools non-empty for `general`.
- Optional: orchestrator log fields present in billing/orchestrator tests if already mocking those logs.

## Success metrics

- Tool-heavy turns: later rounds show flat or declining input growth vs pre-change (microcompact working).
- Typical turns: lower `estimatedPromptTokens` from missing `availableBlocks`.
- Cache: `cacheReadTokens` still present on Anthropic multi-round turns.
- No increase in “empty tools / forced full catalog” rate beyond intentional empty-filter cases.
- Quality smoke: edit workflow, list integrations, multi-step file write still complete without stuck loops.

## Implementation order

1. `formatToolResultForLlm` default cap + compact stringify  
2. History path uses formatter  
3. `microcompact` + wire into orchestrator loop (+ history)  
4. Omit `availableBlocks` from prompt payload  
5. Tighten full-catalog fallback  
6. Logging / estimates  
7. Tests + brief README/overview note if docs drift

## Risks

| Risk | Mitigation |
|------|------------|
| Model re-fetches cleared tool data | Expected and cheaper than resending 10–50k tokens |
| Agent misses block types without catalog | `get_blocks_metadata` + system prompt already require it; keep `availableIntegrations` |
| General intents under-tooled | Hybrid specialists remain; empty filter still full-catalog |
| Cache bust from unstable fingerprints mid-history | Only mutate tool result bodies in the live conversation suffix; never rewrite static system or tool defs mid-turn |

## Open decisions (resolved)

- **Pain:** both short and long sessions → sequenced package above.  
- **Deps:** no new library in v1.  
- **LLM auto-compact:** deferred; session memory covers aged turns.
