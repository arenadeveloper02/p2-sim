import type { AnthropicThinkingHistoryBlock } from '@/local-copilot/lib/providers/types'

/** Raw thinking-block fragment as streamed by LiteLLM / Claude OpenAI bridges. */
export interface OpenAiCompatibleThinkingBlockDelta {
  type?: string
  thinking?: string | null
  signature?: string | null
  /** Legacy LiteLLM field before `signature` was standardized. */
  signature_delta?: string | null
  data?: string | null
}

/**
 * Assembles replayable Anthropic `thinking_blocks` from OpenAI-compatible stream
 * deltas. Unsigned fragments are buffered until a signature arrives; signed
 * snapshots replace buffered text (newer LiteLLM re-sends the full body with
 * the signature).
 *
 * Without these signed blocks on assistant+tool_calls history, Claude proxies
 * drop `thinking` on later tool-loop rounds (`modify_params`) or 400.
 */
export function createOpenAiCompatibleThinkingBlocksAccumulator() {
  let pendingThinking = ''
  let emittedPendingLength = 0
  const completed: AnthropicThinkingHistoryBlock[] = []

  const pushBlock = (block: OpenAiCompatibleThinkingBlockDelta) => {
    if (block.type === 'redacted_thinking') {
      if (typeof block.data === 'string' && block.data.length > 0) {
        completed.push({ type: 'redacted_thinking', data: block.data })
      }
      return
    }

    const thinking = typeof block.thinking === 'string' ? block.thinking : ''
    const signature =
      (typeof block.signature === 'string' && block.signature) ||
      (typeof block.signature_delta === 'string' && block.signature_delta) ||
      ''

    if (thinking) {
      if (signature) {
        // Signature chunk often carries the full accumulated thinking text.
        pendingThinking =
          thinking.length >= pendingThinking.length || thinking.startsWith(pendingThinking)
            ? thinking
            : `${pendingThinking}${thinking}`
      } else {
        pendingThinking += thinking
      }
    }

    if (!signature) return

    const body = pendingThinking || thinking
    if (!body) return

    completed.push({ type: 'thinking', thinking: body, signature })
    pendingThinking = ''
    emittedPendingLength = 0
  }

  return {
    push(blocks: OpenAiCompatibleThinkingBlockDelta[] | undefined | null) {
      if (!blocks?.length) return
      for (const block of blocks) pushBlock(block)
    },
    /**
     * Live CoT text that arrived in `thinking_blocks` before a signature.
     * Claude proxies often omit `reasoning_content` and only stream blocks.
     */
    drainPendingThinking(): string {
      if (pendingThinking.length <= emittedPendingLength) return ''
      const delta = pendingThinking.slice(emittedPendingLength)
      emittedPendingLength = pendingThinking.length
      return delta
    },
    /**
     * Yields newly completed signed blocks since the last drain (for streaming
     * `thinking_block` chunks into the orchestrator).
     */
    drainCompleted(): AnthropicThinkingHistoryBlock[] {
      if (completed.length === 0) return []
      const drained = completed.splice(0, completed.length)
      return drained
    },
    snapshot(): AnthropicThinkingHistoryBlock[] {
      return [...completed]
    },
  }
}
