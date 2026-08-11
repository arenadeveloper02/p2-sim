# Local Copilot Model Picker Design

**Date:** 2026-08-03  
**Status:** Approved for planning  
**Scope:** In-chat model selection for Local Copilot (Claude / Gemini / Bedrock), end-to-end routing via server env credentials, persisted per conversation.

## Problem

Local vs Cloud is already switchable in the chat input toolbar. When Local is selected, the model/provider is deployment-wide env config only (`COPILOT_PROVIDER` / `COPILOT_MODEL`). Users cannot choose Claude, Gemini, or Bedrock models per conversation.

## Goals

- When Local is selected, show a model picker in chat: Claude, Gemini, Bedrock.
- Gemini and Bedrock expose submenus for concrete models.
- Selection is per conversation, survives reload, and can change mid-conversation (applies to the next message).
- Requests actually route to the chosen provider using server env credentials.
- Cloud mode is unchanged (picker hidden; local catalog ignored).

## Non-goals

- Per-user / BYOK API keys in settings
- Cloud Mothership model picker
- Mutating process-wide `COPILOT_PROVIDER` / `COPILOT_MODEL` from the UI
- New billing product surfaces beyond existing token reporting fields

## Decisions

| Topic | Decision |
|-------|----------|
| Scope | Full end-to-end (UI + routing) |
| Credentials | Server env only |
| Gemini UX | Group with two sub-options: 2.5 Pro and 3.1 Pro |
| Picker UX | Top-level chips Claude / Gemini / Bedrock; submenu for Gemini & Bedrock |
| Persistence | Per conversation; survives reload |
| Mid-chat change | Allowed; applies to next message |
| Architecture | Allowlisted catalog IDs stored on `copilot_chats.model` |

## Model catalog

Stable catalog IDs (what the client stores and sends). Server maps ID → provider + concrete model.

| Catalog ID | UI | Provider | Concrete model |
|------------|-----|----------|----------------|
| `claude` | Claude (immediate select) | `anthropic` | `COPILOT_MODEL` (existing default, e.g. `claude-sonnet-4-6` / deployment value) |
| `gemini-2.5-pro` | Gemini → Gemini 2.5 Pro | `gemini` | `gemini-2.5-pro` |
| `gemini-3.1-pro` | Gemini → Gemini 3.1 Pro | `gemini` | `gemini-3.1-pro` |
| `bedrock-llama-3.3-70b` | Bedrock → Llama 3.3 70B Instruct | `bedrock` | Bedrock Llama 3.3 70B Instruct model ID |
| `bedrock-llama-4` | Bedrock → Meta Llama 4 | `bedrock` | Bedrock Meta Llama 4 model ID |
| `bedrock-mistral-large-2` | Bedrock → Mistral Large 2 | `bedrock` | Bedrock Mistral Large 2 model ID |

Exact Bedrock model ID strings are resolved at implementation against current AWS Bedrock docs / account-enabled models and kept in one server-side catalog module.

Default for new local chats: `claude`.

Unknown / missing chat model: treat as `claude` when loading UI; reject unknown IDs on request validation (do not silently remap on send).

## UI

- Location: chat input toolbar, next to the existing Local / Cloud `ChipSwitch` (`user-input.tsx` / chat surface props).
- Visibility: only when effective backend is Local (`copilotBackend === 'local'`), including `localOnly` users.
- Top-level chips: Claude · Gemini · Bedrock.
- Claude selects immediately.
- Gemini / Bedrock open a submenu; choosing a leaf model sets the catalog ID.
- Active state: selected provider chip highlighted; submenu shows check on the active leaf model. Chip may show the leaf label when a submenu model is selected (implementation detail; prefer clarity over chrome clutter).
- Switching Local → Cloud hides the picker. Switching back restores that chat’s saved catalog ID.

## Persistence & data flow

Reuse existing `copilot_chats.model`. For Local picker chats, store the **catalog ID**. Cloud chats may continue to store provider model strings on the same column; when Local is active and `chat.model` is not a known catalog ID, the UI defaults to `claude` without rewriting the row until the user explicitly picks a local model.

1. Open / create chat → client reads `chat.model`; if missing or not in the local catalog when on Local, UI defaults to `claude`.
2. User changes model → optimistic UI update + persist via existing chat update path (`model` field).
3. Send message on Local → request includes the catalog ID; server validates against allowlist.
4. Mid-conversation change → persist immediately; next turn uses the new provider/model; prior messages unchanged.
5. New chat before row exists → keep selection in client state; write catalog ID when the chat row is created on first send.
6. Cloud backend → ignore local catalog ID; no picker.

## Backend / provider routing

### Per-request config override

Do **not** mutate process-wide env. Resolve catalog ID → `{ provider, model, apiKey/baseUrl from env }` and build a **per-request** local-copilot config for the agent/provider factory.

Today `getLocalCopilotProvider()` caches from global config. Implementation must support per-request provider instances (or a factory keyed by resolved config) so concurrent chats on different models do not clobber each other.

### Provider implementations

| Provider | Auth (env) | Notes |
|----------|------------|--------|
| Anthropic (`claude`) | `ANTHROPIC_API_KEY` (+ existing rotation keys) | Existing Messages API path |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Dedicated Gemini client with streaming + tool calling. Today `gemini` is only an accepted ID via OpenAI-compatible shim — this work adds real Gemini support for catalog routes |
| Bedrock | `AWS_REGION` + `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or role credentials) | Dedicated Bedrock Runtime client (e.g. Converse/ConverseStream) with tool calling |

### Specialists / subagents

- Claude: keep cheaper specialist (`COPILOT_SPECIALIST_MODEL` / Haiku default).
- Gemini / Bedrock: specialist uses the **same** selected model (matches current non-Anthropic behavior).

### Validation

- Local requests: client always sends the catalog ID. If omitted (older clients), server defaults to `claude`.
- Unknown catalog ID: 400 validation error (no silent remap).
- Cloud requests: local catalog field ignored if present.

## Error handling

- Missing provider credentials: UI still allows selection; **next send** fails with a clear user-facing error (e.g. “Gemini is not configured on this server”). No silent fallback to Claude.
- Provider API failures: surface through existing local-copilot error / SSE path; do not swap models mid-turn.
- Invalid catalog ID on write/send: validation error.

## Testing

- Unit: catalog resolution (ID → provider/model; reject unknown).
- Unit / route: local path accepts allowlisted IDs; cloud path ignores.
- Persistence: update chat `model` + reload restores selection.
- Provider: mocked HTTP/SDK smoke tests for Gemini and Bedrock stream/tool shapes (no live provider calls in CI).

## Key touchpoints (implementation map)

| Area | Likely files |
|------|----------------|
| Catalog | New module under `apps/sim/local-copilot/lib/` (e.g. `model-catalog.ts`) |
| UI | `user-input.tsx`, chat surface context, home / panel wiring |
| Client send | `use-chat.ts` (or equivalent) — include catalog ID when local |
| Contracts | mothership/local-copilot chat contracts + chat update contracts |
| Persistence | existing chat update APIs writing `copilot_chats.model` |
| Routing | local lifecycle / orchestrator — per-request config from catalog |
| Providers | `providers/registry.ts` + new `gemini` / `bedrock` providers |

## Success criteria

- Local users can pick Claude, either Gemini model, or any of the three Bedrock models from chat.
- Choice persists per conversation across reload.
- Mid-chat changes affect only subsequent turns.
- Each selection actually invokes the corresponding provider with server env credentials.
- Cloud UX unchanged.
