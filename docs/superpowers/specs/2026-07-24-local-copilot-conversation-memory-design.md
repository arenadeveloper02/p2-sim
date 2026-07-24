# Local Copilot Conversation Memory

**Date:** 2026-07-24  
**Status:** Approved  
**Scope:** Local Copilot / mothership local path only (not cloud Go agent)  
**Approach:** Hybrid — rolling structured summary + semantic recall of older turns + recent verbatim window

## Decisions

| Topic | Choice |
|-------|--------|
| Problem modes | Both: forgotten decisions/Q&A **and** lost earlier tool/workflow state |
| Cost posture | Balanced — occasional cheap LLM summary + reuse existing embedding infra |
| Recent window | Keep last **K** turns verbatim (raise from today’s 6; default target **12**) |
| Older dialogue | Replace naive 400-char bullet squeeze with **LLM rolling structured summary** |
| Targeted recall | **Semantic top-K** (3–5) older turns from the same chat, matching the current user message |
| Budget priority | Never drop the summary system message; trim semantic recalls first, then oldest recent turns |
| Persistence | Summary on chat; turn embeddings in a new pgvector table |
| Failure policy | Soft-fail — summary/embedding errors never fail the user turn |

## Problem

In longer Local Copilot threads, conversational context is lost. Users see the model forget earlier questions and answers, decisions/constraints, and earlier tool/workflow facts (IDs, what was already edited).

Today’s pipeline already compresses history, but lossily:

| Knob | Current value | Effect |
|------|---------------|--------|
| `LOCAL_COPILOT_RECENT_TURNS_FULL` | 6 | Only last 6 turns kept verbatim |
| `LOCAL_COPILOT_MAX_HISTORY_MESSAGES` | 50 | Hard cap before compact |
| `summarizeHistoryTurns` | ~400 chars/message | Extractive squeeze — drops nuance, decisions, Q&A detail |
| `fitPromptToTokenBudget` | 120k | May drop oldest conversational turns entirely |

Relevant code: `apps/sim/local-copilot/lib/context/context-budget.ts`, wired from `orchestrator.ts` after `loadMothershipChatHistoryForLocalCopilot`.

## Goals

1. Preserve **user questions and assistant answers** across long threads, not only tool outcomes.
2. Preserve **decisions, constraints, open threads, and artifact IDs** in a durable rolling memory.
3. When the user refers back to an older topic, **semantically retrieve** the matching earlier turn(s) into the prompt.
4. Stay within the existing **120k prompt budget** without failing the turn when memory subsystems error.
5. Reuse existing embedding helpers (`generateSearchEmbedding`) and pgvector patterns (docs/KB).

## Non-goals

- Changing the cloud Go Mothership agent’s history handling.
- Cross-chat or cross-workspace retrieval (same `chatId` only).
- Full-history verbatim replay or unbounded context windows.
- Replacing `user_memory` preferences (orthogonal; long-lived user prefs stay there).
- UI for browsing/editing the rolling summary.
- Perfect transcript fidelity for every past message.

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|--------|
| History compact | `local-copilot/lib/context/context-budget.ts` | `compactChatHistory`, `fitPromptToTokenBudget` |
| History load | `local-copilot/lib/mothership-history.ts` | Persisted mothership messages → `ChatMessage[]` |
| Orchestrator | `local-copilot/lib/agent/orchestrator.ts` | Compacts prior messages then fits budget |
| Engagement model | `COPILOT_ENGAGEMENT_MODEL` | Cheap model already used for titles/status — reuse for summary refresh |
| Embeddings | `lib/knowledge/embeddings` + `docsEmbeddings` | `generateSearchEmbedding`; pgvector cosine search pattern |
| Chat row | `copilot_chats` | Has `config` jsonb — suitable for summary storage |

## Architecture

```
Turn N arrives
  → load prior messages
  → load conversationSummary (chat config)
  → semantic search top-K older turns for current user message
       (same chatId; exclude recent-K turn ids)
  → assemble prompt:
       [system] static instructions
       [system] workspace/workflow context
       [system] conversation memory (rolling summary)
       [system] relevant earlier turns (semantic top-K)
       [messages] last K turns verbatim
       [user] current message
  → fitPromptToTokenBudget
       priority: keep summary → trim recalls → trim oldest recent turns
  → agent runs (unchanged tool loop)
  → after turn (async, non-blocking):
       · upsert turn embedding (user Q + assistant A, tools stripped/shortened)
       · if turns aged out of K (or every N turns): refresh rolling summary
```

### Layer responsibilities

| Layer | Remembers |
|-------|-----------|
| Recent K turns | Exact recent dialogue |
| Rolling summary | Goals, decisions/constraints, Q&A highlights, open threads, artifacts |
| Semantic top-K | Older Q&A that matches *this* user message |

### Rolling summary shape

Structured text (or JSON rendered to text) with fixed sections:

- **User goals / intent**
- **Decisions & constraints** (channel, naming, “don’t do X”)
- **Q&A highlights** (important questions + answers)
- **Open threads**
- **Artifacts** (workflow IDs, block names, file paths, executionIds)

Refresh input = previous summary + turns that just aged out of the recent window. Use `COPILOT_ENGAGEMENT_MODEL` (or equivalent cheap model). Cap summary size (e.g. ~2–3k tokens).

### Semantic recall rules

- Index each completed **turn** as one chunk: user question + assistant answer; tool call noise stripped or heavily shortened.
- Query embedding from the **current user message**.
- Retrieve top **3–5** turns from `copilot_chat_turn_embeddings` where `chatId` matches.
- Exclude turns already present in the recent-K window.
- Cap recalled text (~1–2k tokens total).
- If no rows / embed key missing / search fails → omit the semantic system block.

## Persistence

### Conversation summary

Store on the chat row, e.g. `copilot_chats.config.conversationMemory`:

```ts
{
  summaryText: string
  updatedAt: string // ISO
  coveredThroughTurnId?: string // last turn incorporated
  version: 1
}
```

Deleted with the chat (no orphan state).

### Turn embeddings

New table `copilot_chat_turn_embeddings`:

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `chat_id` | uuid FK → `copilot_chats` ON DELETE CASCADE | |
| `turn_id` | text | Stable id for the turn (e.g. user message id) |
| `content` | text | Indexed text (Q+A) |
| `embedding` | vector(1536) | Same dims as KB/docs (`text-embedding-3-small`) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique `(chat_id, turn_id)`. HNSW cosine index on `embedding`, matching docs/KB pattern.

Migration must follow expand/contract zero-downtime rules (`db-migrate` skill at implementation time).

## Write path (async after turn)

| Event | Action |
|-------|--------|
| Assistant turn completes | Upsert embedding for that turn (do not block SSE completion) |
| Turns age out of recent-K **or** every N turns (default 4) | Refresh rolling summary; persist to chat config |
| Chat deleted | Cascade wipe embeddings; summary goes with chat row |

## Read path (each Local Copilot request)

1. Load `conversationMemory` from chat config.
2. Semantic search top-K for current user message; filter out recent-K turn ids.
3. Build history via updated `compactChatHistory` (summary + recalls + recent-K). Replace today’s `summarizeHistoryTurns` 400-char path for aged turns when a summary exists; keep extractive fallback only if summary missing.
4. `fitPromptToTokenBudget` with drop priority: semantic recalls → oldest recent turns; **never** drop the summary system message.
5. Raise `LOCAL_COPILOT_RECENT_TURNS_FULL` default to **12** (tunable constant).

## Error handling

- Summary refresh failure → log; keep previous summary; continue turn.
- Embedding upsert/search failure → log; omit semantic block; continue.
- No OpenAI (or configured) embed credentials → semantic path disabled for the deployment; summary + recent-K still work.
- Over budget → drop recalls first, then oldest recent turns; keep summary.

## Testing

- `compactChatHistory` injects summary system message and does not duplicate semantically recalled turns already in recent-K.
- `fitPromptToTokenBudget` never drops the summary system message when trimming.
- Semantic retrieve is scoped to `chatId` and excludes the recent window.
- Summary refresh merges aged turns into the structured sections without unbounded growth (cap enforced).
- Soft-fail paths: empty embeddings, missing summary, search error — agent still receives recent-K + current message.
- Unit tests around `context-budget` and new memory helpers; integration smoke on mothership local lifecycle load path optional.

## Implementation sketch (files)

| Area | Likely touchpoints |
|------|--------------------|
| Budget / compact | `local-copilot/lib/context/context-budget.ts` |
| Orchestrator assembly | `local-copilot/lib/agent/orchestrator.ts` |
| History load | `local-copilot/lib/mothership-history.ts` + lifecycle |
| New memory module | e.g. `local-copilot/lib/context/conversation-memory.ts` (summary refresh + assemble) |
| Embeddings store | e.g. `local-copilot/lib/context/turn-embeddings.ts` |
| Schema / migration | `packages/db/schema.ts` + new migration |
| Reuse | `generateSearchEmbedding` from `@/lib/knowledge/embeddings` |

## Success criteria

1. A 20+ turn chat still answers follow-ups that depend on early Q&A and stated constraints.
2. Referring to an older topic (e.g. “the Slack approach we picked”) surfaces that turn via semantic recall or summary.
3. No user-visible failures when memory subsystems are down.
4. Prompt stays within the existing 120k input budget under normal workspace context sizes.
