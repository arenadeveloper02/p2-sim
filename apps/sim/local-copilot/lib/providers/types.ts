import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatMessageContentPart[]
  toolCallId?: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
    /**
     * Gemini 3+ opaque signature that must be echoed on subsequent turns
     * when replaying this function call.
     */
    thoughtSignature?: string
  }>
  /**
   * Anthropic extended-thinking blocks that must be echoed unmodified on the
   * next tool-loop turn (including signatures / redacted payloads).
   * Also used for Claude-via-OpenAI-compatible proxies as `thinking_blocks`,
   * and for Bedrock Claude as Converse `reasoningContent` round-trip.
   */
  anthropicThinkingBlocks?: AnthropicThinkingHistoryBlock[]
  /**
   * Gemini model-turn parts (thought text + function calls + signatures) that
   * must be echoed verbatim on the next tool-loop turn so subsequent rounds
   * keep thinking continuity.
   */
  geminiModelParts?: GeminiHistoryPart[]
  /**
   * OpenAI-compatible / DeepSeek-style reasoning summary that must be echoed on
   * assistant+tools history (as `reasoning_content`) or later turns drop thinking.
   * Claude proxies additionally need `anthropicThinkingBlocks` / `thinking_blocks`.
   */
  reasoningContent?: string
}

/** Anthropic thinking blocks required for tool-use history round-trip. */
export type AnthropicThinkingHistoryBlock =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }

/**
 * Serializable Gemini `Content.parts` for tool-loop history.
 * Prefer echoing these verbatim over reconstructing from toolCalls alone.
 */
export type GeminiHistoryPart =
  | {
      text: string
      thought?: boolean
      thoughtSignature?: string
    }
  | {
      functionCall: {
        id?: string
        name: string
        args: Record<string, unknown>
      }
      thoughtSignature?: string
    }

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  tools?: LocalCopilotToolDefinition[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export interface ChatCompletionChunk {
  /**
   * `thinking` — provider thought / reasoning-summary deltas. Streamed into the
   * thinking channel, shown at the top of the message, and persisted.
   * `thinking_block` — completed Anthropic thinking/redacted block for history
   * round-trip (signatures).
   * `gemini_model_parts` — assembled Gemini model-turn parts for history
   * round-trip (thought text + function calls + signatures).
   */
  type: 'text' | 'thinking' | 'thinking_block' | 'gemini_model_parts' | 'tool_call' | 'done'
  content?: string
  /**
   * Gemini 3+ opaque thought signature for this part. Must be persisted and
   * echoed on the next user turn or follow-up thoughts are dropped.
   */
  thoughtSignature?: string
  thinkingBlock?: AnthropicThinkingHistoryBlock
  geminiModelParts?: GeminiHistoryPart[]
  toolCall?: {
    id: string
    name: string
    arguments: string
    /** Gemini 3+ thought signature to echo on the next model turn. */
    thoughtSignature?: string
  }
  finishReason?: string
  usage?: TokenUsage
}

export interface LocalCopilotProvider {
  id: string
  chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, undefined>
}
