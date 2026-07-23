# Local Copilot Real Chat Titles

**Date:** 2026-07-20  
**Status:** Approved  
**Scope:** A — Local Copilot path only  
**Approach:** Dedicated `generateLocalChatTitle` + shared `collectCompletionText`

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Local Copilot `requestChatTitle` branch only |
| Model | Light / engagement model: `COPILOT_ENGAGEMENT_MODEL` (default `gpt-4.1-nano`) |
| Main agent model | Not used for titles |
| Failure mode | Truncated first user message (`fallbackChatTitle`, 60 chars) |
| Remote / Go titles | Unchanged (`/api/generate-chat-title`) |
| 402 usage-limit title path in `post.ts` | Unchanged (still truncates) |

## Problem

When Local Copilot creates a new chat, `requestChatTitle` labels the sidebar by truncating the first user message. Long or messy prompts become ugly titles (`help me build a workflow that...`). Remote/Go already generates real titles; Local should match that quality without a Go round-trip.

## Goals

1. On new untitled Local chats, generate a short human title with **one** small-model call.
2. Reuse existing engagement model plumbing (`resolveEngagementModel` / `resolveEngagementProvider`).
3. Keep the existing fire-and-forget lifecycle: DB update + SSE `session.title` + sidebar rename.
4. Never block or fail the chat turn if title generation fails.

## Non-goals

- Changing remote/Go `/api/generate-chat-title`.
- Replacing the intentional truncation on the 402 usage-limit path in `chat/post.ts`.
- Retitling chats after the first message (only new chats with null title).
- Billing / credit accounting for the light-model title call.
- UI changes beyond the title string already streamed today.

## Design

### Trigger (unchanged)

`fireTitleGeneration` in `apps/sim/lib/copilot/request/lifecycle/start.ts` runs when:

- `chatId` is set
- chat has no title yet
- `isNewChat` is true

It calls `requestChatTitle`, then updates `copilot_chats.title`, publishes `session.title`, and emits workspace `renamed` for the sidebar.

### Local branch

When Local Copilot is enabled for the user and `copilotBackend !== 'external'`:

```ts
return generateLocalChatTitle(message)
```

instead of collapsing/truncating the message inline.

### `generateLocalChatTitle`

**Path:** `apps/sim/local-copilot/lib/agent/chat-title.ts`

| Concern | Detail |
|---------|--------|
| Model | `resolveEngagementModel()` → `COPILOT_ENGAGEMENT_MODEL` or `gpt-4.1-nano` |
| Provider | `resolveEngagementProvider(model, config)` (OpenAI when GPT-family + key; else Local provider) |
| Prompt | Short system rules: 3–6 word label, no quotes/punctuation/explanation; user message as the only content |
| Limits | `maxTokens: 32`, `temperature: 0.3`, timeout `8s` |
| Output | `sanitizeGeneratedTitle` — strip wrapping quotes, collapse whitespace, drop trailing punctuation, cap at 60 chars; reject multi-line |
| Fallback | `fallbackChatTitle` — single-line truncate to 60 |
| Errors | Never throws; timeout / provider error / bad parse → fallback; blank message → `null` |

### Shared helper

**Path:** `apps/sim/local-copilot/lib/providers/collect-text.ts`

`collectCompletionText` streams a completion and returns trimmed text. Used by engagement status and chat title generation so both share one stream→string path.

### Docs

Note in local-copilot overview that `COPILOT_ENGAGEMENT_MODEL` also powers chat titles (not only live status copy).

## Testing

Unit tests in `apps/sim/local-copilot/lib/agent/chat-title.test.ts`:

- sanitize: quotes, whitespace, multi-line reject, length cap
- fallback: collapse + truncate; blank → null
- generate: success path; provider error → fallback; unusable model output → fallback; blank message → null (no provider call)

## Out of scope follow-ups

- Real titles on the 402 usage-limit path
- Separate `COPILOT_TITLE_MODEL` env (reuse engagement model unless a real need appears)
)
