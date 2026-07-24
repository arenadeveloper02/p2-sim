# Local Copilot Session Memory

**Date:** 2026-07-24  
**Status:** Approved  
**Scope:** Local Copilot / mothership local path only (not cloud Go agent)  
**Approach:** Rolling structured session memory + recent verbatim window; promote durable facts to `user_memory` in a follow-up

## Decisions

| Topic | Choice |
|-------|--------|
| Problem modes | Both conversational (goals/Q&A/decisions) and technical (workflow/tool state) |
| Cost posture | Balanced — summarize only when the chat is long; short chats unchanged |
| Persistence scope | Chat-scoped session memory now; durable prefs → existing `user_memory` later |
| Recent window | Keep last **6–8** turns verbatim (tunable; start at current default of 6, allow raise to 8) |
| Older dialogue | Replace naive 400-char bullet squeeze with **LLM-updated structured session memory** |
| Semantic RAG | Out of scope for v1 (no turn embeddings / pgvector table) |
| Storage | `copilot_chats.config.sessionMemory` JSONB — no new table for v1 |
| Failure policy | Soft-fail — summarizer errors never fail the user turn |

## Problem

In longer Local Copilot threads, the model loses conversational and technical context. Short chats work; long ones forget earlier goals, agreements, workflow/block/file IDs, and work already done.

Today’s pipeline already compresses history, but lossily:

| Knob | Current value | Effect |
|------|---------------|--------|
| `LOCAL_COPILOT_RECENT_TURNS_FULL` | 6 | Only last 6 turns kept verbatim |
| `LOCAL_COPILOT_MAX_HISTORY_MESSAGES` | 50 | Hard cap before compact |
| `summarizeHistoryTurns` | ~400 chars/message | Extractive squeeze — drops nuance, decisions, IDs |
| `fitPromptToTokenBudget` | 120k | May drop oldest conversational turns entirely |

Relevant code: `apps/sim/local-copilot/lib/context/context-budget.ts`, wired from `orchestrator.ts` after `loadMothershipChatHistoryForLocalCopilot`.

## Goals

1. Preserve **user goals, decisions, and open questions** across long threads.
2. Preserve **technical anchors** (workflow IDs, block names, file paths, executionIds, what was already edited/run).
3. Stay within the existing **120k prompt budget**.
4. Keep **short chats cheap** — no extra LLM call until a length threshold is hit.
5. Soft-fail: memory refresh must never block or fail the user-visible turn.
6. Leave a clean hook for **phase 2**: promote durable preferences into existing `user_memory`.

## Non-goals (v1)

- Changing the cloud Go Mothership agent’s history handling.
- Semantic retrieval / turn embeddings / new pgvector tables.
- Cross-chat retrieval (session memory is per `chatId`).
- Full-history verbatim replay or unbounded context windows.
- UI for browsing/editing session memory.
- Writing to `user_memory` in the same PR (phase 2 / follow-up).
- Perfect transcript fidelity for every past message.

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|--------|
| History compact | `local-copilot/lib/context/context-budget.ts` | `compactChatHistory`, `fitPromptToTokenBudget` |
| History load | `local-copilot/lib/mothership-history.ts` | Persisted mothership messages → `ChatMessage[]` |
| Orchestrator | `local-copilot/lib/agent/orchestrator.ts` | Compacts prior messages then fits budget |
| Lifecycle | `local-copilot/integration/mothership-lifecycle.ts` | Loads prior messages for local path |
| Cheap model | `COPILOT_ENGAGEMENT_MODEL` | Already used for titles/status — reuse for summary refresh |
| Chat row | `copilot_chats.config` jsonb | Store `sessionMemory` here |
| User prefs | `user_memory` tool + `loadUserMemoriesForContext` | Phase 2 promotion target |

## Architecture

```
User turn
  → load prior messages
  → load sessionMemory from copilot_chats.config (if any)
  → if turns > threshold OR history tokens > soft budget
       AND there are turns after coveredThroughMessageId:
         small LLM call → merge/update structured sessionMemory
         persist to copilot_chats.config.sessionMemory
         (hard timeout; on failure keep previous memory)
  → assemble prompt:
       [system] static instructions
       [system] workspace/workflow context
       [system] session memory (if present)
       [messages] last N turns verbatim
       [user] current turn
  → fitPromptToTokenBudget (never drop session-memory system message first)
  → agent runs (unchanged tool loop)
```

Short chats (≤ threshold): skip summarizer; behavior matches today aside from dropping the fake 400-char path once memory exists.

### Layer responsibilities

| Layer | Remembers |
|-------|--------|
| Recent N turns | Exact recent dialogue + tool results |
| Session memory | Goals, decisions, entities/IDs, progress, open questions |
| Workspace context | Live workflow/workspace snapshot (unchanged) |
| `userMemories` | Long-lived prefs (existing; phase 2 writes here) |

## Session memory shape

Stored under `copilot_chats.config.sessionMemory`:

```ts
{
  version: 1
  updatedAt: string // ISO
  coveredThroughMessageId: string // last incorporated message id
  goals: string[]
  decisions: string[]
  entities: {
    workflows: string[]
    blocks: string[]
    files: string[]
    runs: string[]
  }
  progress: string[]
  openQuestions: string[]
  notes: string // short narrative glue, ≤ ~500 chars
}
```

### Summarizer rules

- **Input:** previous `sessionMemory` (or empty) + turns since `coveredThroughMessageId`.
- **Output:** merged structured object (not a transcript dump).
- **Model:** `COPILOT_ENGAGEMENT_MODEL` (or equivalent cheap model), low `maxTokens`.
- **Size cap:** total rendered memory ≤ ~1–2k tokens; trim oldest `progress` / `notes` first if over.
- **Secrets:** never store API keys, passwords, tokens, or raw credential values.
- **IDs over dumps:** prefer names/IDs and outcomes; do not embed full tool JSON.

### Prompt injection

One system message:

```
Session memory (authoritative for earlier turns):
{json}
```

System prompt guidance: trust session memory for older context; if recent turns conflict, prefer recent turns.

## Persistence

| Item | Location |
|------|----------|
| Session memory | `copilot_chats.config.sessionMemory` (merge read-modify-write with existing `config`) |
| Chat deleted | Memory goes with the chat row |
| Migration | None required for v1 |

## Thresholds (tunable constants)

| Constant | Suggested default | Role |
|----------|-------------------|------|
| Recent turns full | 6 (allow 8) | Verbatim window |
| Refresh after turns | > 6 turns in history | First time summarizer can run |
| Soft history token budget | e.g. ~20–30k of history | Alternate trigger when turns are huge |
| Summarizer timeout | 1–2s | Soft-fail ceiling |
| Memory token cap | ~1–2k | Always fits under 120k prompt budget |

Refresh only when threshold is met **and** there are uncovered turns after `coveredThroughMessageId`.

## Timing

**v1: sync refresh before the agent turn**, with a hard timeout.

- Correctness: the turn that first crosses the threshold still sees updated memory.
- If timeout/error: proceed with previous memory + recent turns; log warn.

Async post-turn refresh is a possible optimization later; not required for v1.

## Error handling

| Failure | Behavior |
|---------|----------|
| Summarizer timeout / provider error | Keep previous `sessionMemory`; continue turn |
| Invalid / unparseable summarizer JSON | Discard update; keep previous; log warn |
| Missing `chatId` | Skip persist; fall back to extractive compact only |
| Over 120k after assembly | `fitPromptToTokenBudget` may trim oldest recent turns; **do not drop** the session-memory system message while other conversational rows remain |

## Phase 2 (follow-up, not v1)

After a successful memory refresh, optionally extract durable preferences (naming conventions, “always use X”, stable entities) and write via existing `user_memory` helpers with:

- `source: 'inferred'`
- confidence ≤ 0.8
- only prefs/entities — **not** chat-specific progress, open questions, or ephemeral run IDs

No automatic promotion of secrets. Explicit user “remember this” continues to use the `user_memory` tool as today.

## Testing

- Threshold gating: short chats do not call the summarizer.
- Incremental merge: only turns after `coveredThroughMessageId` are sent; cursor advances on success.
- Size cap enforced on persisted + injected memory.
- Prompt assembly includes session memory system message and does **not** use the 400-char fake summary when memory is present.
- Summarizer failure leaves prior memory intact and still runs the agent.
- `fitPromptToTokenBudget` preferential retention of the session-memory system message.
- Unit tests on `context-budget` + new `session-memory` helpers; optional lifecycle smoke.

## Implementation sketch (files)

| Area | Likely touchpoints |
|------|--------------------|
| New module | `local-copilot/lib/context/session-memory.ts` (load, maybe-refresh, format, persist) |
| Budget / compact | `local-copilot/lib/context/context-budget.ts` — prefer session memory over `summarizeHistoryTurns` |
| Orchestrator | `local-copilot/lib/agent/orchestrator.ts` — call maybe-refresh before prompt assembly |
| Lifecycle | `local-copilot/integration/mothership-lifecycle.ts` — pass `chatId` / message ids as needed |
| Chat config R/W | thin helper around `copilot_chats.config` merge |
| Summarizer | reuse provider + `COPILOT_ENGAGEMENT_MODEL` / `collect-text` pattern |
| System prompt | short instruction block about trusting session memory |

## Success criteria

1. A 20+ turn chat still answers follow-ups that depend on early goals, decisions, and prior tool/workflow work.
2. Short chats (≤ ~6 turns) incur no extra summarizer latency.
3. No user-visible failures when the summarizer is down or times out.
4. Prompt stays within the existing 120k input budget under normal workspace context sizes.
5. Phase 2 can promote durable facts to `user_memory` without redesigning session memory storage.
