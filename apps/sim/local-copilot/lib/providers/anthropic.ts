import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import { convertMessagesToAnthropic } from '@/local-copilot/lib/providers/anthropic-messages'
import type {
  ChatCompletionRequest,
  LocalCopilotProvider,
  TokenUsage,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'
import { supportsTemperature } from '@/providers/models'

const logger = createLogger('LocalCopilotAnthropicProvider')

const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

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

export function createAnthropicProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '')

  return {
    id: 'anthropic',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const { system, anthropicMessages } = convertMessagesToAnthropic(request.messages)
      const model = request.model || config.model
      const body = {
        model,
        max_tokens: request.maxTokens ?? 8192,
        stream: true,
        cache_control: getAnthropicAutomaticCacheControl(),
        system: system || undefined,
        messages: anthropicMessages,
        tools: toAnthropicTools(request.tools),
        ...(supportsTemperature(model) && {
          temperature: request.temperature ?? 0.2,
        }),
      }

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey ?? '',
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      })

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

            if (eventType === 'content_block_delta') {
              const delta = data.delta as Record<string, unknown> | undefined
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                yield { type: 'text', content: delta.text }
              }
              if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
                const index = data.index as number
                const existing = toolCalls.get(index) ?? { id: '', name: '', arguments: '' }
                existing.arguments += delta.partial_json
                toolCalls.set(index, existing)
              }
            }

            if (eventType === 'content_block_start') {
              const block = data.content_block as Record<string, unknown> | undefined
              if (block?.type === 'tool_use') {
                const index = data.index as number
                toolCalls.set(index, {
                  id: String(block.id ?? ''),
                  name: String(block.name ?? ''),
                  arguments: '',
                })
              }
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
                for (const call of toolCalls.values()) {
                  yield { type: 'tool_call', toolCall: call }
                }
                toolCalls.clear()
              }
              if (delta?.stop_reason === 'end_turn') {
                yield {
                  type: 'done',
                  finishReason: 'stop',
                  usage,
                }
              }
            }

            if (eventType === 'message_stop') {
              yield {
                type: 'done',
                finishReason: 'stop',
                usage,
              }
            }
          } catch {}
        }
      }
    },
  }
}
