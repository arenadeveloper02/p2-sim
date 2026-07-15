# Local Copilot Server-Driven Status Messages

**Date:** 2026-07-15  
**Status:** Draft — awaiting user review  
**Approach:** B — tool-progress callbacks + orchestrator fallback heartbeats

## Problem

During long Local (Arena Copilot) runs — especially multi-step document work like a 12-slide PPTX via `edit_content` — the chat shows a static assistant reply and a fixed **“Thinking…”** line. The stop button is active, but nothing user-visible updates for long stretches, so the product feels stuck.

SSE `: keepalive` only keeps the connection alive; it is not UI-visible.

## Goals

1. While a Local turn is in-flight, show a **server-authored** live status under the assistant message that updates as work progresses.
2. Prefer **concrete tool progress** when a tool can report it (e.g. “Compiling Deck.pptx…”, “Writing slide content…”).
3. **Fallback** to timed, tool-aware heartbeats when a tool has no progress callbacks, or while waiting on the model with no tokens yet.
4. Reuse the mothership chat UI path (Local already bridges into it); do not require a new Cloud wire schema in v1.

## Non-goals (v1)

- Changing the generated mothership stream contract (`MothershipStreamV1EventType` enum / OpenAPI) for Cloud agents.
- Inventing per-slide counters inside tools that do not already know slide indices.
- Rotating client-only copy as the primary source of truth (client may only display the latest server status).
- Updating the legacy standalone `/api/local-copilot/chat` panel unless it shares the same stream event handler with trivial cost.

## Current state (relevant)

| Piece | Path | Notes |
|-------|------|--------|
| Local stream events | `apps/sim/local-copilot/lib/types.ts` → `LocalCopilotStreamEvent` | `text_delta`, `tool_call_*`, `done`, etc. — **no `status`** |
| Orchestrator | `apps/sim/local-copilot/lib/agent/orchestrator.ts` | Await tools with no mid-await yields |
| Bridge | `apps/sim/local-copilot/integration/mothership-lifecycle.ts` | Maps local → mothership `text` / `tool` / `error` / `complete` |
| Trailing indicator | `PendingTagIndicator` in `special-tags.tsx` | Hardcoded `"Thinking…"` |
| Thinking channel | Turn model + `message-content.tsx` | Persisted/traced; **main agent thinking not shown as body copy** |

## Design

### 1. Local stream event

Add to `LocalCopilotStreamEvent`:

```ts
{
  type: 'status'
  message: string
  toolCallId?: string
  toolName?: string
}
```

- `message` is short UI copy (≤ ~80 chars preferred), already humanized — not a raw tool id unless no better label exists.
- Optional `toolCallId` / `toolName` let the UI correlate with an open tool row later; v1 only needs them for logging / future use.

### 2. Orchestrator status emission

In `runLocalCopilotAgent`:

**Model-wait phase** (after requesting completion, until first `text` or `tool_call` chunk):

- After an idle threshold (recommend **4s**), start emitting status every **8s**:
  - First: `"Planning next step…"`
  - Later rotations: `"Still thinking…"`, `"Figuring out the next action…"` (small fixed set; no LLM-generated fluff).

**Tool phase** (around `executeLocalCopilotTool`):

1. On start: yield `tool_call_start` (existing), then immediate status from args when possible, e.g.:
   - `edit_content` / file tools → `"Writing {fileName}…"` / `"Applying content to {fileName}…"`
   - integrations → `"Running {displayTitle}…"`
   - default → `"Running {humanizedToolName}…"`
2. Pass `onProgress?: (message: string) => void` (or async-safe queue) into tool execution context.
3. Any `onProgress(message)` → yield `{ type: 'status', message, toolCallId, toolName }` immediately.
4. While the tool promise is pending **and** no progress has fired for **8s**, emit a heartbeat that renews the last tool-aware message or a mild variant: `"Still working on {fileName}…"`.
5. Clear intervals on tool settle, abort, or `done`/`error`.

Use `sleep` from `@sim/utils/helpers` (or a cancellable loop tied to `abortSignal`) — never ad-hoc `new Promise(setTimeout)`.

### 3. Tool progress callbacks (opt-in)

Extend `ToolExecutionContext` (executor) with:

```ts
onProgress?: (message: string) => void
```

**v1 opt-in targets** (highest stuck-feeling impact):

| Tool / path | Progress messages (examples) |
|-------------|------------------------------|
| Mothership-delegated `edit_content` | `"Preparing {file}…"`, `"Compiling document…"`, `"Saving {file}…"` at known phase boundaries in the delegated handler / compile path when reachable from Local |
| `workspace_file` create/update | `"Creating {file}…"`, `"Updating {file}…"` |
| Other tools | No callback — orchestrator heartbeats only |

If a phase boundary is deep inside Cloud-only code and awkward to thread in v1, skip deep hooks and rely on heartbeats + start label; do not block the feature on full PPTX slide accounting.

**Progress from inside tools must be fire-and-forget** relative to tool correctness — never throw on missing `onProgress`.

### 4. Bridge to mothership UI (no schema regen)

Do **not** add a new `MothershipStreamV1EventType` in v1.

Map local `status` in `dispatchLocalCopilotEvent` to mothership **`text` with `channel: thinking`**, where each status is emitted as a **replacement-oriented** update:

- Preferred implementation: emit thinking text that is the **full current status string** (not growing delta soup). If the turn model only appends text, either:
  - (a) close the prior thinking span and open a new one with the new status, or
  - (b) stash `liveStatus` on the client when bridging Local (see §5).

Recommendation: **(b) ephemeral live status on the stream consumer for Local**, keep thinking channel unused for this feature if append-only makes replacement awkward. Concretely:

1. Bridge yields a small Local-only side channel the lifecycle already controls — e.g. write mothership `text` / thinking **or** attach via existing SSE custom comment / reuse `span` annotations only if already patterned.
2. Simplest robust path that fits today: extend mothership-lifecycle + `use-chat` Local handling so when Local is active, status events set `assistantMessage.liveStatus = message` (or turn-model field `agentStatus`) without persisting into the final transcript.

**Persistence:** status must **not** appear as assistant prose in saved history. It is ephemeral for the in-flight turn only; clear on `complete` / error / abort.

### 5. Frontend

1. Extend `PendingTagIndicator` to accept `label?: string` (default `"Thinking…"`).
2. In `message-content.tsx` (trailing thinking / streaming empty states), pass `label={liveStatus ?? 'Thinking…'}` when `isStreaming`.
3. Wire `liveStatus` from the active turn in `use-chat` / turn-model reduction when Local status events arrive (or when thinking-replacement strategy is chosen — single source of truth).
4. When a tool row is executing, trailing indicator can still show server status (prefer status line under the message group, not duplicating inside every tool row in v1).
5. Forward `arguments` on Local → mothership `tool` `call` events (today args are often dropped) so tool titles can show file paths — complementary UX, not a substitute for status.

### 6. Copy guidelines

- Present continuous tense or ellipsis: `"Writing pitch-deck.pptx…"`.
- No exclamation spam; no fake percentages unless a tool reports real counts.
- Prefer filename over VFS path when both exist.
- Never leak secrets, credential ids, or full file bodies into status.

## Testing

- Unit: orchestrator yields `status` on tool start + heartbeat timing (fake timers).
- Unit: tool with `onProgress` yields those messages before `tool_call_result`.
- Unit: bridge maps/forwards status without writing it into persisted assistant content.
- UI: `PendingTagIndicator` renders custom label.
- Manual: Local mode PPTX-style long `edit_content` — status changes at least once while compile/save runs; stop clears indicator.

## Rollout

1. Types + orchestrator heartbeats + UI label wiring (immediate stuck-feeling fix).
2. `onProgress` for file / `edit_content` phases.
3. Optional follow-up: Cloud protocol `status` event if Cloud needs the same UX later.

## Open decisions (defaults if unanswered)

| Topic | Default |
|-------|---------|
| Heartbeat interval | 8s after 4s idle |
| Bridge transport | Ephemeral `liveStatus` on Local turn (do not persist) |
| Slide N/M | Only if tool already has index; else filename/phase copy |
| Legacy local chat panel | Skip unless shared types make it free |
