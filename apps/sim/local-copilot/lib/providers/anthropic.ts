import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { supportsTemperature } from '@/providers/models'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatMessage,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotAnthropicProvider')

const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicTools(tools: ChatCompletionRequest['tools']) {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Record<string, unknown>,
  }))
}

function convertMessages(messages: ChatMessage[]): {
  system: string
  anthropicMessages: AnthropicMessage[]
} {
  const systemParts: string[] = []
  const anthropicMessages: AnthropicMessage[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content)
      continue
    }

    if (message.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId ?? '',
            content: message.content,
          },
        ],
      })
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const content: AnthropicContentBlock[] = []
      if (message.content.trim()) {
        content.push({ type: 'text', text: message.content })
      }
      for (const call of message.toolCalls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(call.arguments || '{}') as Record<string, unknown>
        } catch {
          input = {}
        }
        content.push({ type: 'tool_use', id: call.id, name: call.name, input })
      }
      anthropicMessages.push({ role: 'assistant', content })
      continue
    }

    anthropicMessages.push({ role: message.role as 'user' | 'assistant', content: message.content })
  }

  return { system: systemParts.join('\n\n'), anthropicMessages }
}

export function createAnthropicProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '')

  return {
    id: 'anthropic',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const { system, anthropicMessages } = convertMessages(request.messages)
      const model = request.model || config.model
      const body = {
        model,
        max_tokens: request.maxTokens ?? 8192,
        stream: true,
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
            'Anthropic API authentication failed. Set ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY_1) in deployment secrets — COPILOT_API_KEY is for Sim Cloud copilot only.'
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
              if (delta?.stop_reason === 'tool_use') {
                for (const call of toolCalls.values()) {
                  yield { type: 'tool_call', toolCall: call }
                }
                toolCalls.clear()
              }
              if (delta?.stop_reason === 'end_turn') {
                yield { type: 'done', finishReason: 'stop' }
              }
            }

            if (eventType === 'message_stop') {
              yield { type: 'done', finishReason: 'stop' }
            }
          } catch {
            continue
          }
        }
      }
    },
  }
}
