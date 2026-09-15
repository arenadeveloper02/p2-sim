/**
 * Accumulates provider thinking / reasoning-summary deltas for live-status
 * gating (suppress idle fallbacks while thoughts stream). Full CoT is shown in
 * Thinking chrome via `thinking_delta`, not as the trailing live-status label.
 */
export class ThinkingLiveStatusAccumulator {
  private buffer = ''
  private publishing = false

  get isPublishing(): boolean {
    return this.publishing
  }

  /** Accumulated thinking for this model round — publish as `status.message`. */
  get text(): string {
    return this.buffer
  }

  /**
   * Appends a thinking delta and marks thinking as the active live-status source.
   */
  pushDelta(delta: string): void {
    if (!delta) return
    this.buffer += delta
    if (this.buffer.trim()) this.publishing = true
  }

  /** Stops preferring thinking over idle fallback / tool status. */
  stopPublishing(): void {
    this.publishing = false
  }

  reset(): void {
    this.buffer = ''
    this.publishing = false
  }
}

/**
 * Applies a model stream chunk to thinking live-status state.
 * Keeps thinking as the live-status label through assistant prose so idle
 * fallbacks cannot overwrite it; only tool calls release the line for tool
 * heartbeats / next-round wait copy.
 */
export function applyModelChunkToThinkingStatus(
  acc: ThinkingLiveStatusAccumulator,
  chunk: { type: string; content?: string }
): void {
  if (chunk.type === 'thinking' && chunk.content) {
    acc.pushDelta(chunk.content)
    return
  }
  if (chunk.type === 'tool_call') {
    acc.stopPublishing()
  }
}
