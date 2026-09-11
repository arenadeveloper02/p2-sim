import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import { fetchProviderWithRetry } from '@/local-copilot/lib/providers/provider-fetch'
import type {
  ChatCompletionRequest,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotOpenAIProvider')

function resolveBaseUrl(config: LocalCopilotConfig): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, '')
  if (config.provider === 'openai') return 'https://api.openai.com/v1'
  if (config.provider === 'azure-openai') {
    throw new Error('Azure OpenAI requires COPILOT_BASE_URL to be set.')
  }
  throw new Error('COPILOT_BASE_URL is required for openai-compatible providers.')
}

function toOpenAiTools(tools: ChatCompletionRequest['tools']) {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function createOpenAiCompatibleProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const baseUrl = resolveBaseUrl(config)

  return {
    id: config.provider,
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const url = `${baseUrl}/chat/completions`
      const body = {
        model: request.model || config.model,
        messages: request.messages.map((message) => {
          if (message.role === 'tool') {
            return {
              role: 'tool',
              tool_call_id: message.toolCallId,
              content: getMessageContentText(message.content),
            }
          }
          if (message.role === 'assistant' && message.toolCalls?.length) {
            return {
              role: 'assistant',
              content: getMessageContentText(message.content) || null,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          }
          return { role: message.role, content: getMessageContentText(message.content) }
        }),
        tools: toOpenAiTools(request.tools),
        tool_choice: request.tools?.length ? 'auto' : undefined,
        stream: true,
        stream_options: { include_usage: true },
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
        // OpenAI automatic prompt caching: stable key improves prefix reuse across turns.
        ...(config.provider === 'openai'
          ? { prompt_cache_key: `local-copilot:${request.model || config.model}` }
          : {}),
      }

      const response = await fetchProviderWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey ?? ''}`,
          },
          body: JSON.stringify(body),
          signal: request.signal,
        },
        'LLM request failed'
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('LLM request failed', { status: response.status, errorText })
        throw new Error(getErrorMessage(errorText, `LLM request failed (${response.status})`))
      }

      if (!response.body) {
        throw new Error('LLM response body is empty')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') {
            yield {
              type: 'done',
              finishReason: 'stop',
              usage: {
                inputTokens,
                outputTokens,
                ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
              },
            }
            continue
          }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  tool_calls?: Array<{
                    index: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
                finish_reason?: string
              }>
              usage?: {
                prompt_tokens?: number
                completion_tokens?: number
                /** OpenAI automatic prompt cache hits. */
                prompt_tokens_details?: { cached_tokens?: number | null } | null
                /** DeepSeek legacy cache hit field. */
                prompt_cache_hit_tokens?: number | null
              }
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? inputTokens
              outputTokens = parsed.usage.completion_tokens ?? outputTokens
              const cached =
                parsed.usage.prompt_tokens_details?.cached_tokens ??
                parsed.usage.prompt_cache_hit_tokens ??
                0
              if (typeof cached === 'number' && cached > 0) {
                cacheReadTokens = cached
              }
            }

            const choice = parsed.choices?.[0]
            if (!choice) continue

            if (choice.delta?.content) {
              yield { type: 'text', content: choice.delta.content }
            }

            for (const toolDelta of choice.delta?.tool_calls ?? []) {
              const existing = toolCalls.get(toolDelta.index) ?? {
                id: toolDelta.id ?? '',
                name: toolDelta.function?.name ?? '',
                arguments: '',
              }
              if (toolDelta.id) existing.id = toolDelta.id
              if (toolDelta.function?.name) existing.name = toolDelta.function.name
              if (toolDelta.function?.arguments) {
                existing.arguments += toolDelta.function.arguments
              }
              toolCalls.set(toolDelta.index, existing)
            }

            if (choice.finish_reason === 'tool_calls') {
              for (const call of toolCalls.values()) {
                yield {
                  type: 'tool_call',
                  toolCall: call,
                }
              }
              toolCalls.clear()
            }

            if (choice.finish_reason === 'stop') {
              yield {
                type: 'done',
                finishReason: 'stop',
                usage: {
                  inputTokens,
                  outputTokens,
                  ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
                },
              }
            }
          } catch {}
        }
      }
    },
  }
}
