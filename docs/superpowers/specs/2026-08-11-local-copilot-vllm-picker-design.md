# Local Copilot vLLM Picker Design

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Scope:** Add a single vLLM option to the Local Copilot model picker; route it through the existing OpenAI-compatible provider using env-configured base URL and model.

## Problem

Local Copilot already supports `COPILOT_PROVIDER=openai-compatible` + `COPILOT_BASE_URL` for vLLM, but the chat model picker only lists Claude / Gemini / Bedrock. Selecting any picker model overrides the env provider, so users cannot choose vLLM from the UI while keeping cloud options available.

## Goals

- Add a **vLLM** group with **one** catalog entry in the Local Copilot picker.
- Selecting that entry routes chat to the deployment’s vLLM server.
- Reuse the existing OpenAI-compatible client — no new provider transport.
- Keep Claude / Gemini / Bedrock entries unchanged.

## Non-goals

- Multi-model vLLM catalog (30B vs 80B rows, etc.).
- Admin UI or per-user URL configuration.
- Fetching models from `GET /v1/models`.
- Changing the Local Copilot prompt soft cap (120k) or context-budget logic.
- Adding Qwen/Llama entries to the global pricing catalog solely for this feature.
- Making vLLM the only Local backend.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| UI shape | New provider group `vllm` with one leaf | Matches existing Claude/Gemini/Bedrock picker pattern |
| Catalog id | `vllm` | Stable, short, not tied to a specific HF model name |
| Provider id | `openai-compatible` (existing) | vLLM exposes OpenAI-compatible `/v1/chat/completions` |
| Server URL | Env `COPILOT_BASE_URL` only | One server per deployment |
| Model id | Env `COPILOT_MODEL` (`model: null` on catalog entry) | Same pattern as Claude → `COPILOT_MODEL` |
| API key | Optional (`OPENAI_API_KEY` / empty bearer) | Many vLLM setups need no auth |
| Specialist model | Same as main unless `COPILOT_SPECIALIST_MODEL` set | No Anthropic-style Haiku default for openai-compatible |

## Catalog shape

```ts
// provider group
{ id: 'vllm', label: 'vLLM' }

// leaf entry
{
  id: 'vllm',
  providerGroup: 'vllm',
  label: 'vLLM',
  provider: 'openai-compatible',
  model: null, // resolved from COPILOT_MODEL
}
```

## Config resolution

When `buildLocalCopilotConfigForCatalog('vllm')` runs:

1. `provider` = `openai-compatible`
2. `model` = `process.env.COPILOT_MODEL` (trimmed); if missing, fail with a clear error at assert/config time rather than calling vLLM with an empty model
3. `baseUrl` = `process.env.COPILOT_BASE_URL` (always for this catalog path — do **not** require env `COPILOT_PROVIDER` to already be `openai-compatible`)
4. `specialistModel` = `COPILOT_SPECIALIST_MODEL` if set, else same as `model`
5. `apiKey` = existing openai-compatible key resolution (may be undefined)

`assertLocalCopilotEnabled` for openai-compatible already skips API-key requirement; extend or add a targeted check so selecting vLLM without `COPILOT_BASE_URL` / `COPILOT_MODEL` fails with an actionable message.

## Env example

```bash
COPILOT_BASE_URL=http://localhost:8000/v1
COPILOT_MODEL=Qwen3-Next-80B-A3B-Instruct
# optional:
# OPENAI_API_KEY=unused
# COPILOT_SPECIALIST_MODEL=...
```

`COPILOT_MODEL` must match the model id vLLM serves (as returned by `/v1/models` or the `--served-model-name` flag).

## UI

- `LOCAL_COPILOT_PROVIDER_GROUPS` includes `{ id: 'vllm', label: 'vLLM' }`.
- Existing `LocalCopilotModelPicker` in home user-input renders the new group automatically via `getLocalCopilotCatalogEntriesForGroup`.
- No new picker components.

## Runtime path

Unchanged after config build:

`catalogId=vllm` → `buildLocalCopilotConfigForCatalog` → `createLocalCopilotProvider` → `createOpenAiCompatibleProvider` → `POST {COPILOT_BASE_URL}/chat/completions`.

Tool calling continues to use the OpenAI `tools` / `tool_calls` wire format already implemented in `openai-compatible.ts`.

### Note: separate from agent-block `vllm` provider

The app already has a workflow-agent provider id `vllm` (dynamic models via `/api/providers/vllm/models`). This design does **not** reuse that provider for Local Copilot. Local Copilot stays on `openai-compatible` + `COPILOT_BASE_URL` / `COPILOT_MODEL` so Arena Copilot routing remains independent of agent-block provider settings.

## Error handling

| Condition | Behavior |
|---|---|
| Missing `COPILOT_BASE_URL` when vLLM selected | Clear error before the LLM call |
| Missing `COPILOT_MODEL` when vLLM selected | Clear error before the LLM call |
| vLLM unreachable / non-2xx | Existing `fetchProviderWithRetry` + error surfacing |

## Testing

- Unit: catalog includes `vllm` group + entry; `isLocalCopilotCatalogId('vllm')` true.
- Unit: `buildLocalCopilotConfigForCatalog('vllm')` returns `provider: 'openai-compatible'`, `baseUrl` from env, `model` from `COPILOT_MODEL`, even when `COPILOT_PROVIDER=anthropic`.
- Unit: assert/config rejects missing base URL or model for the vLLM path.
- No e2e against a live vLLM required for merge.

## Rollout

- Feature is inert until env is set and the user picks **vLLM** in the picker.
- Default catalog id remains `claude`.
