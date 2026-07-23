# Local Copilot Anthropic Prompt Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Local Copilot’s Anthropic path actually hit prompt cache on tools + static system rules every model round, and log `cacheReadTokens` / `cacheCreationTokens` so we can verify it.

**Architecture:** Split Anthropic `system` into static (cached) + dynamic (uncached) text blocks; put `cache_control` on the last tool; keep top-level automatic caching. Parse Anthropic cache usage from the stream and log it on each orchestrator round. OpenAI-compatible providers stay unchanged.

**Tech Stack:** TypeScript, Anthropic Messages API (`cache_control`), Vitest via `bunx vitest`, existing `@/lib/anthropic/prompt-cache` helper.

**Spec:** `docs/superpowers/specs/2026-07-20-local-copilot-prompt-caching-design.md`

## Global Constraints

- Anthropic Local provider only (`COPILOT_PROVIDER=anthropic`).
- Explicit breakpoints: last tool + first (static) system text block; TTL via `getAnthropicAutomaticCacheControl()` (`ephemeral`, `1h`).
- Keep top-level automatic `cache_control`; if Anthropic 400s on breakpoint slots, drop automatic and keep the two explicit breakpoints.
- Do not change `recordModelUsage` billing math in v1.
- Do not change `LOCAL_COPILOT_PROMPT_TOKEN_BUDGET` or context-budget heuristics.
- OpenAI-compatible path must keep joined system string behavior.
- `bun` / `bunx` only; `@vitest-environment node` for these tests.
- Use absolute `@/` imports; no `any`.

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/sim/local-copilot/lib/providers/anthropic-messages.ts` | Convert chat messages → Anthropic messages + **system block array** with cache on first system text |
| `apps/sim/local-copilot/lib/providers/anthropic-messages.test.ts` | Converter + system-block cache tests |
| `apps/sim/local-copilot/lib/providers/anthropic.ts` | Tool mapping with last-tool `cache_control`; send system blocks; parse cache usage from stream |
| `apps/sim/local-copilot/lib/providers/anthropic.test.ts` | Tool mapping + usage parse tests |
| `apps/sim/local-copilot/lib/providers/types.ts` | Extend `TokenUsage` with optional cache fields |
| `apps/sim/local-copilot/lib/agent/orchestrator.ts` | Log `cacheReadTokens` / `cacheCreationTokens` on model round finish |
| `apps/sim/local-copilot/overview.md` | Short note that Anthropic Local caches tools + static system |
| `apps/sim/local-copilot/README.md` | Same note under providers / troubleshooting |

---

### Task 1: System blocks with static cache breakpoint

**Files:**
- Modify: `apps/sim/local-copilot/lib/providers/anthropic-messages.ts`
- Create: `apps/sim/local-copilot/lib/providers/anthropic-messages.test.ts`
- Modify: `apps/sim/local-copilot/lib/providers/anthropic.ts` (consume new return shape — minimal wire-up so types compile; full tool/usage work is later tasks)

**Interfaces:**
- Consumes: `getAnthropicAutomaticCacheControl` from `@/lib/anthropic/prompt-cache`
- Produces:
  - `AnthropicSystemBlock = { type: 'text'; text: string; cache_control?: ReturnType<typeof getAnthropicAutomaticCacheControl> }`
  - `convertMessagesToAnthropic(messages): { system: AnthropicSystemBlock[] | undefined; anthropicMessages: AnthropicMessage[] }`
  - First non-empty system message → one block with `cache_control`; later system messages → blocks without it; empty system → `undefined`

- [ ] **Step 1: Write the failing test**

Create `apps/sim/local-copilot/lib/providers/anthropic-messages.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import { convertMessagesToAnthropic } from '@/local-copilot/lib/providers/anthropic-messages'

describe('convertMessagesToAnthropic system caching', () => {
  it('puts cache_control only on the first system block', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: 'STATIC RULES' },
      { role: 'system', content: 'Current context:\n{"workflow":1}' },
      { role: 'system', content: 'Workspace snapshot:\nws' },
      { role: 'user', content: 'hello' },
    ])

    expect(system).toEqual([
      {
        type: 'text',
        text: 'STATIC RULES',
        cache_control: getAnthropicAutomaticCacheControl(),
      },
      { type: 'text', text: 'Current context:\n{"workflow":1}' },
      { type: 'text', text: 'Workspace snapshot:\nws' },
    ])
  })

  it('returns a single cached system block when only static system exists', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: 'STATIC RULES' },
      { role: 'user', content: 'hi' },
    ])
    expect(system).toEqual([
      {
        type: 'text',
        text: 'STATIC RULES',
        cache_control: getAnthropicAutomaticCacheControl(),
      },
    ])
  })

  it('returns undefined system when there are no system messages', () => {
    const { system } = convertMessagesToAnthropic([{ role: 'user', content: 'hi' }])
    expect(system).toBeUndefined()
  })

  it('skips blank system messages when building blocks', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: '   ' },
      { role: 'system', content: 'STATIC RULES' },
      { role: 'system', content: 'Current context:\nx' },
      { role: 'user', content: 'hi' },
    ])
    expect(system?.[0]).toEqual({
      type: 'text',
      text: 'STATIC RULES',
      cache_control: getAnthropicAutomaticCacheControl(),
    })
    expect(system?.[1]).toEqual({ type: 'text', text: 'Current context:\nx' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/sim && bunx vitest run local-copilot/lib/providers/anthropic-messages.test.ts
```

Expected: FAIL (return type still `system: string`, or assertions fail).

- [ ] **Step 3: Implement system block conversion**

In `apps/sim/local-copilot/lib/providers/anthropic-messages.ts`:

1. Import `getAnthropicAutomaticCacheControl` from `@/lib/anthropic/prompt-cache`.
2. Add and export:

```typescript
export type AnthropicSystemBlock = {
  type: 'text'
  text: string
  cache_control?: ReturnType<typeof getAnthropicAutomaticCacheControl>
}
```

3. Change `convertMessagesToAnthropic` to collect non-empty system texts in order, then build:

```typescript
const system: AnthropicSystemBlock[] | undefined =
  systemParts.length === 0
    ? undefined
    : systemParts.map((text, index) =>
        index === 0
          ? { type: 'text' as const, text, cache_control: getAnthropicAutomaticCacheControl() }
          : { type: 'text' as const, text }
      )

return { system, anthropicMessages }
```

Where `systemParts` pushes `getMessageContentText(message.content).trim()` only when non-empty.

4. Update `apps/sim/local-copilot/lib/providers/anthropic.ts` body to pass `system: system || undefined` (array is valid Anthropic JSON). Remove any assumption that `system` is a string.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/sim && bunx vitest run local-copilot/lib/providers/anthropic-messages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/providers/anthropic-messages.ts \
  apps/sim/local-copilot/lib/providers/anthropic-messages.test.ts \
  apps/sim/local-copilot/lib/providers/anthropic.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): cache Anthropic static system prompt blocks

EOF
)"
```

---

### Task 2: Last-tool `cache_control` + usage parsing

**Files:**
- Modify: `apps/sim/local-copilot/lib/providers/types.ts`
- Modify: `apps/sim/local-copilot/lib/providers/anthropic.ts`
- Create: `apps/sim/local-copilot/lib/providers/anthropic.test.ts`

**Interfaces:**
- Consumes: `getAnthropicAutomaticCacheControl`, `LocalCopilotToolDefinition`, stream usage JSON
- Produces:
  - `TokenUsage` with optional `cacheReadTokens?: number` and `cacheCreationTokens?: number`
  - Exported `toAnthropicTools(tools): Array<{ name; description; input_schema; cache_control? }>`
  - Exported `parseAnthropicUsage(usage): TokenUsage` mapping Anthropic fields

- [ ] **Step 1: Write the failing test**

Create `apps/sim/local-copilot/lib/providers/anthropic.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import {
  parseAnthropicUsage,
  toAnthropicTools,
} from '@/local-copilot/lib/providers/anthropic'

describe('toAnthropicTools', () => {
  it('adds cache_control only on the last tool', () => {
    const tools = toAnthropicTools([
      { name: 'a', description: 'A', parameters: { type: 'object' } },
      { name: 'b', description: 'B', parameters: { type: 'object' } },
    ])
    expect(tools?.[0]).not.toHaveProperty('cache_control')
    expect(tools?.[1]).toMatchObject({
      name: 'b',
      cache_control: getAnthropicAutomaticCacheControl(),
    })
  })

  it('returns undefined for empty tools', () => {
    expect(toAnthropicTools([])).toBeUndefined()
    expect(toAnthropicTools(undefined)).toBeUndefined()
  })
})

describe('parseAnthropicUsage', () => {
  it('maps cache read/write fields', () => {
    expect(
      parseAnthropicUsage({
        input_tokens: 50,
        output_tokens: 12,
        cache_read_input_tokens: 100000,
        cache_creation_input_tokens: 0,
      })
    ).toEqual({
      inputTokens: 50,
      outputTokens: 12,
      cacheReadTokens: 100000,
      cacheCreationTokens: 0,
    })
  })

  it('omits cache fields when absent', () => {
    expect(parseAnthropicUsage({ input_tokens: 10, output_tokens: 2 })).toEqual({
      inputTokens: 10,
      outputTokens: 2,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/sim && bunx vitest run local-copilot/lib/providers/anthropic.test.ts
```

Expected: FAIL (exports missing / tools lack `cache_control`).

- [ ] **Step 3: Implement tool caching + usage helpers**

1. In `apps/sim/local-copilot/lib/providers/types.ts`, extend:

```typescript
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}
```

2. In `apps/sim/local-copilot/lib/providers/anthropic.ts`, replace private `toAnthropicTools` with exported:

```typescript
export function toAnthropicTools(tools: ChatCompletionRequest['tools']) {
  if (!tools?.length) return undefined
  return tools.map((tool, index, all) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Record<string, unknown>,
    ...(index === all.length - 1
      ? { cache_control: getAnthropicAutomaticCacheControl() }
      : {}),
  }))
}
```

3. Add exported:

```typescript
export function parseAnthropicUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): TokenUsage {
  const result: TokenUsage = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  }
  if (typeof usage.cache_read_input_tokens === 'number') {
    result.cacheReadTokens = usage.cache_read_input_tokens
  }
  if (typeof usage.cache_creation_input_tokens === 'number') {
    result.cacheCreationTokens = usage.cache_creation_input_tokens
  }
  return result
}
```

4. In the stream loop, track usage via `parseAnthropicUsage`:
   - On `message_start`, read `data.message.usage` (input + cache fields).
   - On `message_delta`, merge `data.usage` (output tokens; keep prior cache fields if delta omits them).
   - Yield `usage` on `done` from the accumulated `TokenUsage`.

Keep top-level `cache_control: getAnthropicAutomaticCacheControl()` on the request body.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/sim && bunx vitest run local-copilot/lib/providers/anthropic.test.ts local-copilot/lib/providers/anthropic-messages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/providers/types.ts \
  apps/sim/local-copilot/lib/providers/anthropic.ts \
  apps/sim/local-copilot/lib/providers/anthropic.test.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): cache Anthropic tool defs and surface cache usage

EOF
)"
```

---

### Task 3: Orchestrator logging + docs

**Files:**
- Modify: `apps/sim/local-copilot/lib/agent/orchestrator.ts` (model-round finish log ~lines 429–437)
- Modify: `apps/sim/local-copilot/overview.md`
- Modify: `apps/sim/local-copilot/README.md`

**Interfaces:**
- Consumes: `chunk.usage.cacheReadTokens` / `cacheCreationTokens` from Task 2
- Produces: log fields on `Arena Copilot model round finished`; docs note for operators

- [ ] **Step 1: Extend round usage capture + log**

In `orchestrator.ts`, where `roundInputTokens` / `roundOutputTokens` are set from `chunk.usage`, also capture:

```typescript
let roundCacheReadTokens: number | undefined
let roundCacheCreationTokens: number | undefined
// ...
if (chunk.type === 'done' && chunk.usage) {
  roundInputTokens = chunk.usage.inputTokens
  roundOutputTokens = chunk.usage.outputTokens
  roundCacheReadTokens = chunk.usage.cacheReadTokens
  roundCacheCreationTokens = chunk.usage.cacheCreationTokens
}
```

Add to the existing `logger.info('Arena Copilot model round finished', { ... })`:

```typescript
cacheReadTokens: roundCacheReadTokens,
cacheCreationTokens: roundCacheCreationTokens,
```

Do **not** change the `recordModelUsage({ inputTokens, outputTokens, ... })` call.

- [ ] **Step 2: Update docs**

In `apps/sim/local-copilot/overview.md` (LLM providers / context section), add a short note:

- When `COPILOT_PROVIDER=anthropic`, Local sends Anthropic `cache_control` on the last tool definition and the static system prompt block (plus top-level automatic caching).
- Verify hits via `Arena Copilot model round finished` logs: look for `cacheReadTokens` / `cacheCreationTokens`.

In `apps/sim/local-copilot/README.md` Configuration or Troubleshooting, add the same two bullets.

- [ ] **Step 3: Run provider tests again**

Run:

```bash
cd apps/sim && bunx vitest run local-copilot/lib/providers/anthropic.test.ts local-copilot/lib/providers/anthropic-messages.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/sim/local-copilot/lib/agent/orchestrator.ts \
  apps/sim/local-copilot/overview.md \
  apps/sim/local-copilot/README.md
git commit -m "$(cat <<'EOF'
feat(local-copilot): log Anthropic prompt cache hits on model rounds

EOF
)"
```

---

### Task 4: Manual verification checklist (no code)

**Files:** none

- [ ] **Step 1: Run a Local Anthropic chat turn that uses at least one tool**

With `COPILOT_PROVIDER=anthropic` and a real key, send a prompt that forces a tool call so there are ≥2 model rounds in one turn.

- [ ] **Step 2: Confirm logs**

In server logs for `Arena Copilot model round finished`:

- Round 1 (cold): expect `cacheCreationTokens` > 0 (or first write) and/or subsequent round `cacheReadTokens` > 0.
- Round 2 (after tool results, same tools + static system): expect `cacheReadTokens` ≫ `inputTokens`.

If Anthropic returns HTTP 400 mentioning cache breakpoints / slots, remove only the **top-level** `cache_control` from the request body in `anthropic.ts`, keep the two explicit breakpoints, re-test, and note the fallback in the PR description.

- [ ] **Step 3: No commit required** unless Step 2 forced the automatic-cache fallback code change — then commit that as:

```bash
git add apps/sim/local-copilot/lib/providers/anthropic.ts
git commit -m "$(cat <<'EOF'
fix(local-copilot): drop top-level Anthropic cache_control if breakpoint slots conflict

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Explicit `cache_control` on last tool | Task 2 |
| Static vs dynamic system blocks; cache on static only | Task 1 |
| Keep top-level automatic caching (+ 400 fallback) | Task 2 + Task 4 |
| Parse + log cache read/creation tokens | Task 2 + Task 3 |
| `recordModelUsage` unchanged | Task 3 |
| OpenAI path unchanged | Task 1 (Anthropic converter only) |
| Docs note | Task 3 |
| Unit tests for converter / tools / usage | Tasks 1–2 |
| Success: second round cache read | Task 4 manual |

## Placeholder scan

No TBD/TODO steps; all code and commands are concrete.

## Type consistency

- `AnthropicSystemBlock` / `convertMessagesToAnthropic` return shape used by `anthropic.ts`
- `TokenUsage.cacheReadTokens` / `cacheCreationTokens` set by `parseAnthropicUsage`, logged by orchestrator
- `toAnthropicTools` / `parseAnthropicUsage` exported for tests and used by the provider stream
)
