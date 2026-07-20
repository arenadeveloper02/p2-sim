# Local Copilot Server-Driven Status Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a Local Copilot turn is in flight, replace the static chat “Thinking…” label with server-authored live status (tool start labels + heartbeats + optional tool `onProgress`), without persisting that copy into the transcript or changing the Cloud mothership OpenAPI schema.

**Architecture:** Orchestrator yields a new Local stream event `{ type: 'status', message }`. The mothership lifecycle bridges it into a **synthetic** SSE envelope (same pattern as `file_preview_*`), which the client validates outside the Go wire contract and stores as ephemeral `ChatMessage.liveStatus`. `PendingTagIndicator` displays that label. Complete/error/abort clears it.

**Tech Stack:** TypeScript, Local Copilot orchestrator (`AsyncGenerator`), mothership stream session contract + `StreamWriter`, Vitest (`bunx vitest`), React mothership chat UI.

**Spec:** `docs/superpowers/specs/2026-07-15-local-copilot-server-status-design.md`

## Global Constraints

- Local Copilot only; Cloud OpenAPI / `MothershipStreamV1EventType` enum must not be regenerated for this feature.
- Status is ephemeral UI — never assistant prose in saved history.
- Chat trailing indicator only (not preview panel).
- Heartbeats: first after **4s** idle, then every **8s**.
- Use `sleep` from `@sim/utils/helpers` (never ad-hoc `setTimeout` promises).
- Copy ≤ ~80 chars; continuous tense / ellipsis; no fake percentages; no secrets.
- `bun` / `bunx` only.

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/sim/local-copilot/lib/types.ts` | Add `status` to `LocalCopilotStreamEvent` |
| `apps/sim/local-copilot/lib/agent/status-messages.ts` | Pure helpers: model-wait copies, tool-start label, heartbeat variant |
| `apps/sim/local-copilot/lib/agent/status-heartbeat.ts` | Cancellable idle/heartbeat loops tied to `AbortSignal` |
| `apps/sim/local-copilot/lib/agent/orchestrator.ts` | Emit status during model-wait + tool phase |
| `apps/sim/local-copilot/lib/tools/executor.ts` | Optional `onProgress` on `ToolExecutionContext` |
| `apps/sim/lib/copilot/request/session/contract.ts` | Synthetic local-status envelope + parser |
| `apps/sim/local-copilot/integration/mothership-lifecycle.ts` | Map Local `status` → synthetic `run` stream event via `onEvent` |
| `apps/sim/app/workspace/[workspaceId]/home/types.ts` | `liveStatus?: string` on `ChatMessage` |
| `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/stream-context.ts` | Hold `liveStatus` on loop state; flush onto assistant message |
| `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/dispatch-stream-event.ts` | Route synthetic status before turn-model fold |
| `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/handle-local-status-event.ts` | Set / update `liveStatus` |
| `apps/sim/lib/copilot/chat/effective-transcript.ts` | Skip synthetic status when rebuilding content blocks |
| `apps/sim/.../special-tags/special-tags.tsx` | `PendingTagIndicator` `label` prop |
| `apps/sim/.../message-content.tsx` + `mothership-chat.tsx` | Pass `liveStatus` into indicator; show while tools run if label present |

---

### Task 1: Status message helpers (pure)

**Files:**
- Create: `apps/sim/local-copilot/lib/agent/status-messages.ts`
- Test: `apps/sim/local-copilot/lib/agent/status-messages.test.ts`

**Interfaces:**
- Produces:
  - `MODEL_WAIT_STATUS_MESSAGES: readonly string[]`
  - `buildToolStartStatus(toolName: string, args: Record<string, unknown>): string`
  - `buildToolHeartbeatStatus(lastMessage: string, toolName: string, args: Record<string, unknown>): string`
  - `truncateStatusMessage(message: string, maxLen?: number): string` (default 80)

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  MODEL_WAIT_STATUS_MESSAGES,
  buildToolHeartbeatStatus,
  buildToolStartStatus,
  truncateStatusMessage,
} from '@/local-copilot/lib/agent/status-messages'

describe('status-messages', () => {
  it('has model-wait copy', () => {
    expect(MODEL_WAIT_STATUS_MESSAGES[0]).toBe('Planning next step…')
    expect(MODEL_WAIT_STATUS_MESSAGES.length).toBeGreaterThan(1)
  })

  it('labels file tools with filename', () => {
    expect(buildToolStartStatus('edit_content', { fileName: 'Deck.pptx' })).toContain('Deck.pptx')
    expect(buildToolStartStatus('workspace_file', { name: 'notes.md' })).toMatch(/Creating|Writing|Updating/)
  })

  it('labels workflow and app tools', () => {
    expect(buildToolStartStatus('run_workflow', { workflowName: 'Onboard' })).toMatch(/workflow/i)
    expect(buildToolStartStatus('development_generate_app', {})).toMatch(/app/i)
  })

  it('falls back to humanized tool name', () => {
    expect(buildToolStartStatus('some_unknown_tool', {})).toMatch(/Running/)
  })

  it('heartbeat softens the last message', () => {
    const start = buildToolStartStatus('edit_content', { fileName: 'Deck.pptx' })
    expect(buildToolHeartbeatStatus(start, 'edit_content', { fileName: 'Deck.pptx' })).toMatch(
      /Still|working/i
    )
  })

  it('truncates long messages', () => {
    expect(truncateStatusMessage('a'.repeat(100)).length).toBeLessThanOrEqual(80)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/sim && bunx vitest run local-copilot/lib/agent/status-messages.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement helpers**

```typescript
import { truncate } from '@sim/utils/string'

export const MODEL_WAIT_STATUS_MESSAGES = [
  'Planning next step…',
  'Still thinking…',
  'Figuring out the next action…',
] as const

function fileNameFromArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ['fileName', 'filename', 'name', 'path']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const base = value.trim().split('/').pop()
      if (base) return base
    }
  }
  return undefined
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/[_-]+/g, ' ').trim() || 'tool'
}

export function truncateStatusMessage(message: string, maxLen = 80): string {
  return truncate(message, maxLen)
}

export function buildToolStartStatus(toolName: string, args: Record<string, unknown>): string {
  const file = fileNameFromArgs(args)
  if (toolName === 'edit_content' || toolName === 'workspace_file') {
    return truncateStatusMessage(file ? `Writing ${file}…` : 'Writing file…')
  }
  if (toolName === 'run_workflow' || toolName === 'run_workflow_until_block') {
    const name =
      typeof args.workflowName === 'string' && args.workflowName.trim()
        ? args.workflowName.trim()
        : undefined
    return truncateStatusMessage(name ? `Running workflow “${name}”…` : 'Running workflow…')
  }
  if (toolName === 'development_generate_app') {
    return truncateStatusMessage('Generating app…')
  }
  if (toolName === 'development_edit_app') {
    return truncateStatusMessage('Editing app…')
  }
  return truncateStatusMessage(`Running ${humanizeToolName(toolName)}…`)
}

export function buildToolHeartbeatStatus(
  lastMessage: string,
  toolName: string,
  args: Record<string, unknown>
): string {
  const file = fileNameFromArgs(args)
  if (file) return truncateStatusMessage(`Still working on ${file}…`)
  if (lastMessage.trim()) return truncateStatusMessage(lastMessage.replace(/…$/, '') + ' — still working…')
  return truncateStatusMessage(`Still running ${humanizeToolName(toolName)}…`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/sim && bunx vitest run local-copilot/lib/agent/status-messages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/agent/status-messages.ts apps/sim/local-copilot/lib/agent/status-messages.test.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): add live status message helpers

EOF
)"
```

---

### Task 2: Local stream `status` event type

**Files:**
- Modify: `apps/sim/local-copilot/lib/types.ts` (`LocalCopilotStreamEvent`)
- Test: extend `status-messages.test.ts` OR add `apps/sim/local-copilot/lib/types.status.test.ts` that only typechecks via a tiny assignability assert (optional). Prefer a compile-time usage in Task 3 tests.

**Interfaces:**
- Produces:

```typescript
| {
    type: 'status'
    message: string
    toolCallId?: string
    toolName?: string
  }
```

- [ ] **Step 1: Add the union member**

In `LocalCopilotStreamEvent`, add:

```typescript
| {
    type: 'status'
    message: string
    toolCallId?: string
    toolName?: string
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/sim/local-copilot/lib/types.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): add status stream event type

EOF
)"
```

---

### Task 3: Cancellable status heartbeat loop

**Files:**
- Create: `apps/sim/local-copilot/lib/agent/status-heartbeat.ts`
- Test: `apps/sim/local-copilot/lib/agent/status-heartbeat.test.ts`

**Interfaces:**
- Consumes: `sleep` from `@sim/utils/helpers`
- Produces:

```typescript
export async function* emitIdleStatusHeartbeats(options: {
  abortSignal?: AbortSignal
  idleMs?: number // default 4000
  intervalMs?: number // default 8000
  messages: readonly string[]
}): AsyncGenerator<{ type: 'status'; message: string }, void, undefined>
```

Behavior: wait `idleMs`, then yield `messages[0]`, then every `intervalMs` yield next message (wrap). Stop when aborted or generator is closed by consumer `break`/`return`.

- [ ] **Step 1: Write failing test with fake timers**

```typescript
/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { emitIdleStatusHeartbeats } from '@/local-copilot/lib/agent/status-heartbeat'

describe('emitIdleStatusHeartbeats', () => {
  it('emits after idle then on interval', async () => {
    vi.useFakeTimers()
    const messages = ['A', 'B'] as const
    const gen = emitIdleStatusHeartbeats({ messages, idleMs: 4000, intervalMs: 8000 })
    const first = gen.next()
    await vi.advanceTimersByTimeAsync(3999)
    // still pending — race with Promise.race timeout of 0
    let settled = false
    void first.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect((await first).value).toEqual({ type: 'status', message: 'A' })

    const second = gen.next()
    await vi.advanceTimersByTimeAsync(8000)
    expect((await second).value).toEqual({ type: 'status', message: 'B' })

    await gen.return?.(undefined)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/sim && bunx vitest run local-copilot/lib/agent/status-heartbeat.test.ts`

- [ ] **Step 3: Implement using `sleep` + abort checks**

Use `sleep` from `@sim/utils/helpers`. Between sleeps, if `abortSignal?.aborted`, return. On consumer cancel, exit cleanly.

- [ ] **Step 4: Pass tests**

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/agent/status-heartbeat.ts apps/sim/local-copilot/lib/agent/status-heartbeat.test.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): add cancellable status heartbeat generator

EOF
)"
```

---

### Task 4: Orchestrator emits status (model-wait + tool phase)

**Files:**
- Modify: `apps/sim/local-copilot/lib/agent/orchestrator.ts` (model stream loop ~357+, tool loop ~438+)
- Modify: `apps/sim/local-copilot/lib/tools/executor.ts` — add `onProgress?: (message: string) => void` to `ToolExecutionContext`
- Test: `apps/sim/local-copilot/lib/agent/orchestrator.status.test.ts` (unit-test the tool-phase emission via a small extracted helper if full orchestrator mocking is heavy)

**Preferred extract (keep orchestrator thin):**

Create `apps/sim/local-copilot/lib/agent/run-tool-with-status.ts`:

```typescript
export async function* runToolWithStatus(params: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  abortSignal?: AbortSignal
  execute: (onProgress: (message: string) => void) => Promise<ToolExecutionResult>
}): AsyncGenerator<LocalCopilotStreamEvent, ToolExecutionResult, undefined>
```

Behavior:
1. Yield `tool_call_start` (caller may already have yielded it — **do not double**). Prefer: this helper only yields `status` + returns result; orchestrator keeps existing `tool_call_start` yield.
2. Yield immediate `{ type: 'status', message: buildToolStartStatus(...), toolCallId, toolName }`
3. Start tool promise; race with heartbeat every 8s (no 4s idle on tool phase — first status already sent). Heartbeat uses `buildToolHeartbeatStatus` when no `onProgress` for 8s.
4. Queue `onProgress` messages onto a channel the generator drains (or yield via a shared `pendingStatuses: string[]` polled with short `sleep(50)` while promise pending).
5. On settle: stop heartbeats; return result.

- [ ] **Step 1: Write failing tests for `runToolWithStatus`**

Cover: start status yielded; `onProgress` message yielded before result; abort stops heartbeats.

- [ ] **Step 2: Implement `runToolWithStatus` + wire orchestrator**

In orchestrator tool loop, replace bare `executeLocalCopilotTool(...)` with consumption of `runToolWithStatus`, forwarding yields.

For **model-wait**: wrap `provider.chatCompletionStream` consumption so that until first `text` or `tool_call` chunk, also race `emitIdleStatusHeartbeats` with `MODEL_WAIT_STATUS_MESSAGES`. On first content chunk, cancel the idle generator.

- [ ] **Step 3: Pass unit tests**

Run: `cd apps/sim && bunx vitest run local-copilot/lib/agent/run-tool-with-status.test.ts local-copilot/lib/agent/status-heartbeat.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/sim/local-copilot/lib/agent/orchestrator.ts apps/sim/local-copilot/lib/agent/run-tool-with-status.ts apps/sim/local-copilot/lib/agent/run-tool-with-status.test.ts apps/sim/local-copilot/lib/tools/executor.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): emit status events from orchestrator tool and model waits

EOF
)"
```

---

### Task 5: Synthetic local-status stream envelope (session contract)

**Files:**
- Modify: `apps/sim/lib/copilot/request/session/contract.ts`
- Modify: `apps/sim/lib/copilot/request/session/index.ts` (re-exports if needed)
- Test: `apps/sim/lib/copilot/request/session/contract.test.ts`

**Interfaces:**
- Produces:

```typescript
export const LOCAL_STATUS_PHASE = 'agent_live_status' as const

export interface SyntheticLocalStatusPayload {
  statusPhase: typeof LOCAL_STATUS_PHASE
  message: string
  toolCallId?: string
  toolName?: string
}

export interface SyntheticLocalStatusEventEnvelope {
  payload: SyntheticLocalStatusPayload
  scope?: MothershipStreamV1StreamScope
  seq: number
  stream: MothershipStreamV1StreamRef
  trace?: MothershipStreamV1Trace
  ts: string
  type: 'run'
  v: 1
}
```

- Extend `PersistedStreamEventEnvelope` / `SessionStreamEvent` to include this synthetic.
- `parsePersistedStreamEventEnvelope`: accept via `isSyntheticLocalStatusEventEnvelope` (parallel to file preview).
- Contract/Go envelopes must **not** treat `statusPhase` as a valid mothership run kind.

- [ ] **Step 1: Write failing parser tests**

```typescript
it('accepts synthetic local status envelopes', () => {
  const parsed = parsePersistedStreamEventEnvelope({
    v: 1,
    type: 'run',
    seq: 3,
    ts: '2026-07-15T00:00:00.000Z',
    stream: { streamId: 's1', cursor: '3' },
    payload: { statusPhase: 'agent_live_status', message: 'Writing Deck.pptx…' },
  })
  expect(parsed.ok).toBe(true)
})

it('rejects run envelopes with neither contract kind nor statusPhase', () => {
  expect(
    parsePersistedStreamEventEnvelope({
      v: 1,
      type: 'run',
      seq: 3,
      ts: '2026-07-15T00:00:00.000Z',
      stream: { streamId: 's1', cursor: '3' },
      payload: { message: 'nope' },
    }).ok
  ).toBe(false)
})
```

- [ ] **Step 2: Implement types + validators**

- [ ] **Step 3: Pass `contract.test.ts`**

- [ ] **Step 4: Commit**

```bash
git add apps/sim/lib/copilot/request/session/contract.ts apps/sim/lib/copilot/request/session/contract.test.ts apps/sim/lib/copilot/request/session/index.ts
git commit -m "$(cat <<'EOF'
feat(copilot): accept synthetic local status stream envelopes

EOF
)"
```

---

### Task 6: Bridge Local `status` → synthetic SSE (no content blocks)

**Files:**
- Modify: `apps/sim/local-copilot/integration/mothership-lifecycle.ts` (`dispatchLocalCopilotEvent`)
- Modify: `apps/sim/lib/copilot/chat/effective-transcript.ts` — skip envelopes with `statusPhase === 'agent_live_status'`
- Test: `apps/sim/local-copilot/integration/mothership-lifecycle.status.test.ts` (mock `options.onEvent`)

**Interfaces:**
- On `event.type === 'status'`, call `options.onEvent?.({ type: 'run', payload: { statusPhase: 'agent_live_status', message: event.message, toolCallId?, toolName? } })` and **return without** calling `sseHandlers` text/tool handlers (so no `contentBlocks` mutation).

Important: mothership-lifecycle’s `dispatchStreamEvent` currently always looks up `sseHandlers[event.type]`. Synthetic status must go through `options.onEvent` only (same as `publisher.publish`), **not** through `handleRunEvent` server content-block path — so either:
1. Call `options.onEvent` directly for status (recommended), or
2. Register a no-op / status-aware handler that only publishes.

Also forward `arguments` on Local → mothership `tool` `call` if still missing (`event.args` already cached in `toolArgsByCallId` — pass into tool call payload if the mothership tool handler accepts `input`/`arguments`; only if a one-liner already exists elsewhere — otherwise leave as follow-up; do not block this task).

- [ ] **Step 1: Failing test — status event invokes onEvent with synthetic payload and does not push contentBlocks**

- [ ] **Step 2: Implement bridge branch**

- [ ] **Step 3: Skip in `effective-transcript` rebuild**

```typescript
if (parsed.type === 'run' && 'statusPhase' in parsed.payload) {
  continue
}
```

- [ ] **Step 4: Pass tests + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(local-copilot): bridge status events to synthetic mothership SSE

EOF
)"
```

---

### Task 7: Client `liveStatus` plumbing

**Files:**
- Modify: `apps/sim/app/workspace/[workspaceId]/home/types.ts` — `liveStatus?: string` on `ChatMessage`
- Create: `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/handle-local-status-event.ts`
- Modify: `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/stream-context.ts` — `liveStatus` on `StreamLoopState`; include in flush into assistant message; clear on complete/error
- Modify: `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/dispatch-stream-event.ts` — before `reduceEvent`, if synthetic local status, handle + return (do **not** fold into turn model)
- Modify: `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/handle-complete-event.ts` (and error path) — `state.liveStatus = undefined` then flush
- Test: `apps/sim/app/workspace/[workspaceId]/home/hooks/stream/handle-local-status-event.test.ts`

**Interfaces:**
- Produces: `handleLocalStatusEvent(ctx, envelope)` sets `ctx.state.liveStatus = payload.message` and `ctx.ops.flush()`
- Flush serialization must copy `liveStatus` onto the optimistic / streaming assistant `ChatMessage` and clear it when turn is terminal

- [ ] **Step 1: Failing unit test for handler + flush field**

- [ ] **Step 2: Implement**

Guard in `dispatch-stream-event.ts`:

```typescript
if (
  parsed.type === 'run' &&
  parsed.payload &&
  typeof parsed.payload === 'object' &&
  'statusPhase' in parsed.payload &&
  (parsed.payload as { statusPhase?: string }).statusPhase === 'agent_live_status'
) {
  handleLocalStatusEvent(ctx, parsed)
  return
}
```

- [ ] **Step 3: Pass tests + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(home): wire ephemeral liveStatus from local status SSE events

EOF
)"
```

---

### Task 8: Chat UI — PendingTagIndicator label + show during tools

**Files:**
- Modify: `apps/sim/.../special-tags/special-tags.tsx` — `PendingTagIndicator({ label = 'Thinking…' })`
- Modify: `apps/sim/.../message-content/message-content.tsx` — accept `liveStatus?: string`; pass to indicator; when `liveStatus` is set and `isStreaming`, show trailing indicator even if `hasRunningWork`
- Modify: `apps/sim/.../mothership-chat/mothership-chat.tsx` — empty streaming state uses `<PendingTagIndicator label={message.liveStatus} />`; pass `liveStatus` into `MessageContent`
- Test: lightweight render test if the suite already uses React Testing Library; otherwise unit-test the boolean helper:

```typescript
export function shouldShowTrailingLiveStatus(opts: {
  isStreaming: boolean
  liveStatus?: string
  hasTrailingContent: boolean
  hasRunningWork: boolean
}): boolean {
  if (!opts.isStreaming) return false
  if (opts.liveStatus) return true
  return !opts.hasTrailingContent && !opts.hasRunningWork
}
```

- [ ] **Step 1: Failing tests for helper + PendingTagIndicator label**

- [ ] **Step 2: Implement UI wiring**

- [ ] **Step 3: Pass tests + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(home): show server liveStatus on chat thinking indicator

EOF
)"
```

---

### Task 9 (rollout #2): Opt-in `onProgress` for file tools

**Files:**
- Modify: delegated `edit_content` / workspace file compile path reachable from Local (`apps/sim/local-copilot/lib/tools/mothership-delegated-tools.ts` and any compile helper it calls)
- Call `ctx.onProgress?.('Compiling document…')` / `Saving…` at known phase boundaries only when cheap
- Test: unit test that progress callback fires (mock compile)

If threading is awkward in Cloud-only code, skip deep hooks and keep heartbeats — do not block merge.

- [ ] **Step 1: Add progress calls where phase boundaries already exist**
- [ ] **Step 2: Unit test + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(local-copilot): report file compile progress via onProgress

EOF
)"
```

---

### Task 10: Spec status + manual verification checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-local-copilot-server-status-design.md` — set **Status:** Implemented (or leave Approved until manual QA)

- [ ] **Step 1: Manual QA (Local mode)**
  - Long model wait → label changes from Thinking… to “Planning next step…” within ~4s
  - `run_workflow` → “Running workflow…” while tool executes
  - `development_generate_app` → “Generating app…”
  - `edit_content` PPTX → filename status + heartbeat / progress
  - Stop → indicator clears; transcript has no status prose
  - Cloud backend → still “Thinking…” (no synthetic status)

- [ ] **Step 2: Commit doc status if updated**

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Local `status` stream event | 2 |
| Model-wait heartbeats 4s / 8s | 3, 4 |
| Tool start status + tool heartbeats | 1, 4 |
| `onProgress` opt-in | 4 (context), 9 (call sites) |
| Bridge without mothership schema regen | 5, 6 |
| Ephemeral `liveStatus`, no transcript prose | 6, 7 |
| `PendingTagIndicator` label | 8 |
| Workflow / app start labels | 1 |
| Chat-only surface | 8 (no preview changes) |

## Placeholder scan

No TBD steps. Commit steps included per skill. Exact commands and code provided.

## Type consistency

- Local event: `type: 'status'`
- Wire synthetic: `type: 'run'` + `statusPhase: 'agent_live_status'`
- UI field: `ChatMessage.liveStatus: string | undefined`
