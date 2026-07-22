# Local Copilot Anthropic Prompt Caching

**Date:** 2026-07-20  
**Status:** Approved  
**Scope:** B — Anthropic Local provider + cache usage visibility  
**Approach:** 1 — Explicit breakpoints on static prefix + keep automatic caching

## Decisions

| Topic | Choice |
|-------|--------|
| Provider scope | Anthropic Local only (`COPILOT_PROVIDER=anthropic`) |
| Strategy | Explicit `cache_control` on last tool + static system block; keep top-level automatic caching |
| TTL | Reuse `getAnthropicAutomaticCacheControl()` (`ephemeral`, `1h`) |
| Dynamic context | Separate system blocks **after** the static cached block (no marker) |
| Visibility | Parse + log `cache_read_input_tokens` / `cache_creation_input_tokens` |
| Billing rates for cache read/write | Out of scope for v1 (`recordModelUsage` unchanged) |
| OpenAI / other providers | Out of scope |
| UI cache stats | Out of scope |
| 120k budget math | Unchanged (caching is a provider cost/latency lever) |

## Problem

Local rebuilds a large prompt every model round (~system rules + tool definitions + workflow/workspace context + history). Tool definitions alone are a large, stable slice; with the expanded delegated toolset that slice grows further and is the main token argument against a bigger catalog.

The Anthropic Local provider already sets top-level automatic `cache_control`, but `convertMessagesToAnthropic` joins **all** system messages into one string:

- static `SYSTEM_PROMPT`
- per-turn `Current context`
- optional workspace snapshot
- optional compressed history summary

Automatic caching places the breakpoint on the last cacheable block. When the system blob changes every turn, the stable tools + rules prefix never gets a durable write/read. Anthropic’s docs call out this exact trap: breakpoint on a varying suffix → cache writes every request, few reads.

## Goals

1. Cache the **stable prefix** across Local Anthropic rounds/turns: tool definitions + static system rules.
2. Keep dynamic context and conversation **after** that prefix so they do not bust the tools/rules cache.
3. Keep top-level automatic caching so growing conversation can still advance the cache within Anthropic’s lookback rules.
4. Surface cache hit/miss via usage fields in logs so we can verify the lever works.

## Non-goals

- Prompt caching for OpenAI-compatible / Bedrock / Gemini Local providers.
- Accurate cache-priced billing in `recordModelUsage` (no cache-rate path today).
- Client UI for cache stats.
- Changing `LOCAL_COPILOT_PROMPT_TOKEN_BUDGET` or context-budget heuristics.
- Caching engagement-status / chat-title small-model calls (separate, tiny prompts).

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|--------|
| Top-level automatic cache | `local-copilot/lib/providers/anthropic.ts` | Already sets `cache_control: getAnthropicAutomaticCacheControl()` |
| Message convert | `local-copilot/lib/providers/anthropic-messages.ts` | Joins all `system` roles into one string |
| Tool mapping | `toAnthropicTools` in `anthropic.ts` | No per-tool `cache_control` |
| Prompt assembly | `local-copilot/lib/agent/orchestrator.ts` | Multiple system messages: rules, context, optional workspace |
| Usage | `TokenUsage` + round log | Only `inputTokens` / `outputTokens`; ignores Anthropic cache fields |
| Shared helper | `lib/anthropic/prompt-cache.ts` | `getAnthropicAutomaticCacheControl()` → `{ type: 'ephemeral', ttl: '1h' }` |

## Design

### Cache hierarchy

Anthropic caches in order: `tools` → `system` → `messages`.

Place explicit breakpoints on the **last block of each stable section**:

1. **Last tool** in `tools[]` — caches the full tool catalog.
2. **Static system text block** — caches tools + static rules.

Dynamic system blocks and messages come after and are eligible for automatic caching as the conversation grows.

### 1. Tools

In `toAnthropicTools` (or equivalent):

```ts
tools.map((tool, index, all) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.parameters,
  ...(index === all.length - 1
    ? { cache_control: getAnthropicAutomaticCacheControl() }
    : {}),
}))
```

Empty tools array → no tool breakpoint (static system breakpoint still applies).

### 2. System as content blocks

Change Anthropic conversion to return system as an array of text blocks when targeting the Anthropic provider:

| Block | Content | `cache_control` |
|-------|---------|-----------------|
| Static | Arena Copilot `SYSTEM_PROMPT` (turn-invariant rules only) | Yes (`1h` ephemeral) |
| Dynamic | `Current context:…`, workspace snapshot, compressed history summary, any other per-turn system text | No |

**Ordering rule:** static block first, then dynamic blocks in existing relative order.

**Identification:** treat the orchestrator’s first system message (the fixed `SYSTEM_PROMPT`) as static; every subsequent system message as dynamic. Do not put timestamps or other per-request noise into the static block.

OpenAI-compatible providers keep today’s joined string behavior (no Anthropic block shape).

### 3. Keep automatic caching

Retain top-level:

```ts
cache_control: getAnthropicAutomaticCacheControl()
```

Combined with explicit breakpoints:

- Explicit breakpoints pin tools + static system.
- Automatic advances through conversation when eligible (uses one of the 4 breakpoint slots).

If Anthropic returns 400 because slots conflict, prefer keeping the two explicit breakpoints and drop top-level automatic — document that fallback in implementation notes; do not silently lose the static prefix cache.

### 4. Usage visibility

Parse from Anthropic streaming `message_start` (and later usage events if present):

- `cache_read_input_tokens`
- `cache_creation_input_tokens`
- `input_tokens` (Anthropic: tokens **after** the last breakpoint)
- `output_tokens`

Extend `TokenUsage`:

```ts
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}
```

On each model round, log:

```ts
logger.info('Arena Copilot model round finished', {
  // ...existing fields
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
})
```

A healthy multi-round turn looks like: large `cacheReadTokens`, small fresh `inputTokens`, occasional `cacheCreationTokens` on first write or after tool-def/system-prompt change.

**Billing note:** `recordModelUsage` continues to receive today’s `inputTokens` / `outputTokens` only. Once caching works, Anthropic’s `input_tokens` alone is not total processed (`total ≈ cache_read + cache_creation + input`). Fixing Local billing for cache rates is a follow-up.

### 5. Docs

Update local-copilot overview/README briefly:

- Anthropic Local uses prompt caching on tools + static system.
- `COPILOT_PROVIDER=anthropic` is required for this lever.
- Point at round logs for `cacheReadTokens` / `cacheCreationTokens` verification.

## Testing

| Case | Expectation |
|------|-------------|
| Converter: static + dynamic system | Anthropic `system` is an array; only static block has `cache_control` |
| Converter: system-only static | Single cached system block |
| Tools mapping | Only last tool has `cache_control` |
| Empty tools | Request still has cached static system; no tool breakpoint |
| Usage parse | Maps Anthropic cache fields onto `TokenUsage` |
| OpenAI-compatible path | Unchanged joined system string; no Anthropic `cache_control` on tools |

## Success criteria

1. Second Anthropic model round in the same turn (after tool results) shows non-zero `cacheReadTokens` when tools + static system are unchanged.
2. Changing only dynamic context does **not** force a full tools/system cache rewrite (tools + static system still read).
3. Changing tool definitions or the static system prompt correctly invalidates and rewrites that prefix (`cacheCreationTokens` > 0 on the next call).

## Out of scope follow-ups

- Cache-aware Local billing (`calculateCost` with cache read/write rates)
- Explicit breakpoints deeper in multi-turn history if automatic lookback proves insufficient (>20 blocks)
- Provider-agnostic cache abstractions for OpenAI

## Operator notes

- When `COPILOT_PROVIDER=anthropic`, Local Copilot sends Anthropic `cache_control` on the last tool definition and the static system prompt block (plus top-level automatic caching).
- Verify cache hits via `Arena Copilot model round finished` logs: look for `cacheReadTokens` / `cacheCreationTokens`.
