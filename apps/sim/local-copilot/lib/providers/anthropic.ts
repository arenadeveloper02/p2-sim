import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import { convertMessagesToAnthropic } from '@/local-copilot/lib/providers/anthropic-messages'
import { fetchProviderWithRetry } from '@/local-copilot/lib/providers/provider-fetch'
import type {
  AnthropicThinkingHistoryBlock,
  ChatCompletionChunk,
  ChatCompletionRequest,
  LocalCopilotProvider,
  TokenUsage,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'
import { buildThinkingConfig } from '@/providers/anthropic/core'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/models'

const logger = createLogger('LocalCopilotAnthropicProvider')

const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
/**
 * Enables thinking between tool-result rounds for manual `type: "enabled"` models.
 * Adaptive thinking interleaves automatically; the Claude API ignores this header there.
 */
export const ANTHROPIC_INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14'
/** Anthropic requires budget_tokens >= 1024 and strictly less than max_tokens. */
const ANTHROPIC_MIN_BUDGET_TOKENS = 1024
const ANTHROPIC_THINKING_OUTPUT_HEADROOM = 4096

export function toAnthropicTools(tools: ChatCompletionRequest['tools']) {
  if (!tools?.length) return undefined
  return tools.map((tool, index, all) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Record<string, unknown>,
    ...(index === all.length - 1 ? { cache_control: getAnthropicAutomaticCacheControl() } : {}),
  }))
}

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

/**
 * Builds the Messages API thinking payload for Local Copilot.
 * Uses `agentEvents: true` so summary-stream models opt into `display: 'summarized'`.
 */
export function resolveLocalAnthropicThinkingRequest(
  model: string,
  thinkingLevel: string | undefined
): {
  thinking: Record<string, unknown>
  outputConfig?: Record<string, unknown>
  maxTokensFloor?: number
} | null {
  if (!thinkingLevel || thinkingLevel === 'none') return null
  const config = buildThinkingConfig(model, thinkingLevel, true)
  if (!config) return null

  let maxTokensFloor: number | undefined
  if (config.thinking.type === 'enabled' && 'budget_tokens' in config.thinking) {
    const modelMax = getMaxOutputTokensForModel(model)
    let budgetTokens = config.thinking.budget_tokens
    if (budgetTokens + ANTHROPIC_THINKING_OUTPUT_HEADROOM > modelMax) {
      budgetTokens = Math.max(
        ANTHROPIC_MIN_BUDGET_TOKENS,
        modelMax - ANTHROPIC_THINKING_OUTPUT_HEADROOM
      )
      config.thinking.budget_tokens = budgetTokens
    }
    maxTokensFloor = Math.min(budgetTokens + ANTHROPIC_THINKING_OUTPUT_HEADROOM, modelMax)
  }

  return {
    thinking: config.thinking as unknown as Record<string, unknown>,
    ...(config.outputConfig
      ? { outputConfig: config.outputConfig as unknown as Record<string, unknown> }
      : {}),
    ...(maxTokensFloor !== undefined ? { maxTokensFloor } : {}),
  }
}

export function createAnthropicProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '')

  return {
    id: 'anthropic',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const { system, anthropicMessages } = convertMessagesToAnthropic(request.messages)
      const model = request.model || config.model
      let maxTokens = request.maxTokens ?? 8192
      const thinkingRequest = resolveLocalAnthropicThinkingRequest(
        model,
        request.thinkingLevel ?? config.thinkingLevel
      )

      if (thinkingRequest?.maxTokensFloor && maxTokens < thinkingRequest.maxTokensFloor) {
        maxTokens = thinkingRequest.maxTokensFloor
      }

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        stream: true,
        cache_control: getAnthropicAutomaticCacheControl(),
        system: system || undefined,
        messages: anthropicMessages,
        tools: toAnthropicTools(request.tools),
        ...(request.tools?.length ? { tool_choice: { type: 'auto' } } : {}),
      }

      if (thinkingRequest) {
        body.thinking = thinkingRequest.thinking
        if (thinkingRequest.outputConfig) {
          body.output_config = thinkingRequest.outputConfig
        }
        // Per Anthropic docs: thinking is incompatible with temperature.
      } else if (supportsTemperature(model)) {
        body.temperature = request.temperature ?? 0.2
      }

      if (thinkingRequest) {
        logger.info('Arena Copilot Anthropic thinking enabled', {
          model,
          thinkingLevel: request.thinkingLevel ?? config.thinkingLevel,
          thinkingType: thinkingRequest.thinking.type,
          maxTokens,
        })
      }

      if (request.tools?.length) {
        logger.info('Arena Copilot Anthropic tool-enabled request', {
          model,
          toolCount: request.tools.length,
          toolNames: request.tools.map((tool) => tool.name),
        })
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': ANTHROPIC_API_VERSION,
      }
      // Without interleaved thinking, Claude only emits a thinking block before the
      // first tool batch — subsequent tool-loop rounds stay silent. Adaptive models
      // interleave by default; the header is required for manual budget thinking.
      if (thinkingRequest) {
        headers['anthropic-beta'] = ANTHROPIC_INTERLEAVED_THINKING_BETA
      }

      const response = await fetchProviderWithRetry(
        `${baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: request.signal,
        },
        'Anthropic request failed'
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Anthropic request failed', { status: response.status, errorText })
        if (response.status === 401) {
          throw new Error(
            'Anthropic API authentication failed. Set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_1 through _3 in deployment secrets — COPILOT_API_KEY is for Sim Cloud copilot only.'
          )
        }
        throw new Error(getErrorMessage(errorText, `Anthropic request failed (${response.status})`))
      }

      if (!response.body) {
        throw new Error('Anthropic response body is empty')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      let yieldedToolCall = false
      let emittedDone = false

      let openThinkingText = ''
      let openThinkingSignature = ''
      let openBlockKind: 'thinking' | 'redacted_thinking' | null = null
      let openRedactedData = ''

      const flushOpenThinkingBlock = (): ChatCompletionChunk[] => {
        if (openBlockKind === 'thinking') {
          // Signatures are required for tool-loop round-trip. Unsigned blocks
          // must not be echoed — Anthropic rejects modified/incomplete thinking.
          if (openThinkingSignature) {
            const block: AnthropicThinkingHistoryBlock = {
              type: 'thinking',
              thinking: openThinkingText,
              signature: openThinkingSignature,
            }
            openThinkingText = ''
            openThinkingSignature = ''
            openBlockKind = null
            return [{ type: 'thinking_block', thinkingBlock: block }]
          }
          if (openThinkingText) {
            logger.warn(
              'Anthropic thinking finished without a signature; skipping history round-trip',
              { thinkingChars: openThinkingText.length }
            )
          }
        } else if (openBlockKind === 'redacted_thinking' && openRedactedData) {
          const block: AnthropicThinkingHistoryBlock = {
            type: 'redacted_thinking',
            data: openRedactedData,
          }
          openRedactedData = ''
          openBlockKind = null
          return [{ type: 'thinking_block', thinkingBlock: block }]
        }
        openBlockKind = null
        openThinkingText = ''
        openThinkingSignature = ''
        openRedactedData = ''
        return []
      }

      const flushPendingToolCalls = (): ChatCompletionChunk[] => {
        if (toolCalls.size === 0) return []
        const chunks: ChatCompletionChunk[] = []
        for (const call of toolCalls.values()) {
          chunks.push({ type: 'tool_call', toolCall: call })
          yieldedToolCall = true
        }
        toolCalls.clear()
        return chunks
      }

      const emitDone = (finishReason: string): ChatCompletionChunk => {
        emittedDone = true
        return {
          type: 'done',
          finishReason,
          usage,
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.split('\n')
          let eventType = ''
          let dataLine = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
              dataLine = line.slice(5).trim()
            }
          }

          if (!dataLine) continue

          try {
            const data = JSON.parse(dataLine) as Record<string, unknown>

            if (eventType === 'message_start') {
              const message = data.message as
                | {
                    usage?: {
                      input_tokens?: number
                      output_tokens?: number
                      cache_read_input_tokens?: number
                      cache_creation_input_tokens?: number
                    }
                  }
                | undefined
              if (message?.usage) {
                usage = parseAnthropicUsage(message.usage)
              }
            }

            if (eventType === 'content_block_start') {
              const block = data.content_block as Record<string, unknown> | undefined
              if (block?.type === 'thinking') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                openBlockKind = 'thinking'
                openThinkingText = typeof block.thinking === 'string' ? block.thinking : ''
                openThinkingSignature = typeof block.signature === 'string' ? block.signature : ''
              } else if (block?.type === 'redacted_thinking') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                openBlockKind = 'redacted_thinking'
                openRedactedData = typeof block.data === 'string' ? block.data : ''
              } else if (block?.type === 'tool_use') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                const index = data.index as number
                toolCalls.set(index, {
                  id: String(block.id ?? ''),
                  name: String(block.name ?? ''),
                  arguments: '',
                })
              } else if (block?.type === 'text') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
              }
            }

            if (eventType === 'content_block_delta') {
              const delta = data.delta as Record<string, unknown> | undefined
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                yield { type: 'text', content: delta.text }
              }
              if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                openThinkingText += delta.thinking
                yield { type: 'thinking', content: delta.thinking }
              }
              if (delta?.type === 'signature_delta' && typeof delta.signature === 'string') {
                openThinkingSignature += delta.signature
              }
              if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
                const index = data.index as number
                const existing = toolCalls.get(index) ?? { id: '', name: '', arguments: '' }
                existing.arguments += delta.partial_json
                toolCalls.set(index, existing)
              }
            }

            if (eventType === 'content_block_stop') {
              for (const chunk of flushOpenThinkingBlock()) yield chunk
            }

            if (eventType === 'message_delta') {
              const delta = data.delta as { stop_reason?: string } | undefined
              const deltaUsage = data.usage as
                | {
                    output_tokens?: number
                    cache_read_input_tokens?: number
                    cache_creation_input_tokens?: number
                  }
                | undefined
              if (deltaUsage) {
                if (typeof deltaUsage.output_tokens === 'number') {
                  usage.outputTokens = deltaUsage.output_tokens
                }
                if (typeof deltaUsage.cache_read_input_tokens === 'number') {
                  usage.cacheReadTokens = deltaUsage.cache_read_input_tokens
                }
                if (typeof deltaUsage.cache_creation_input_tokens === 'number') {
                  usage.cacheCreationTokens = deltaUsage.cache_creation_input_tokens
                }
              }
              if (delta?.stop_reason === 'tool_use') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                for (const chunk of flushPendingToolCalls()) yield chunk
              }
              if (delta?.stop_reason === 'end_turn' || delta?.stop_reason === 'stop_sequence') {
                for (const chunk of flushOpenThinkingBlock()) yield chunk
                for (const chunk of flushPendingToolCalls()) yield chunk
                if (!emittedDone) {
                  yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
                }
              }
            }

            if (eventType === 'message_stop') {
              for (const chunk of flushOpenThinkingBlock()) yield chunk
              for (const chunk of flushPendingToolCalls()) yield chunk
              if (!emittedDone) {
                yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
              }
            }
          } catch {}
        }
      }

      // Stream ended without message_stop — still flush any buffered tool_use.
      for (const chunk of flushOpenThinkingBlock()) yield chunk
      for (const chunk of flushPendingToolCalls()) yield chunk
      if (!emittedDone) {
        yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
      }
    },
  }
}
