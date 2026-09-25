import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import { createOpenAiCompatibleThinkingBlocksAccumulator } from '@/local-copilot/lib/providers/openai-compatible-thinking-blocks'
import { fetchProviderWithRetry } from '@/local-copilot/lib/providers/provider-fetch'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'
import { buildThinkingConfig } from '@/providers/anthropic/core'

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

/**
 * Builds Claude thinking fields for OpenAI-compatible proxies (LiteLLM,
 * Anthropic OpenAI SDK bridge, etc.). Returns null for non-Claude models.
 */
export function resolveOpenAiCompatibleThinkingBody(
  model: string,
  thinkingLevel: string | undefined
): { thinking: Record<string, unknown>; outputConfig?: Record<string, unknown> } | null {
  if (!thinkingLevel || thinkingLevel === 'none') return null
  const config = buildThinkingConfig(model, thinkingLevel, true)
  if (!config) return null
  return {
    thinking: config.thinking as unknown as Record<string, unknown>,
    ...(config.outputConfig
      ? { outputConfig: config.outputConfig as unknown as Record<string, unknown> }
      : {}),
  }
}

export function createOpenAiCompatibleProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const baseUrl = resolveBaseUrl(config)

  return {
    id: config.provider,
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const url = `${baseUrl}/chat/completions`
      const model = request.model || config.model
      const thinkingBody = resolveOpenAiCompatibleThinkingBody(
        model,
        request.thinkingLevel ?? config.thinkingLevel
      )

      const body: Record<string, unknown> = {
        model,
        messages: request.messages.map((message) => {
          if (message.role === 'tool') {
            return {
              role: 'tool',
              tool_call_id: message.toolCallId,
              content: getMessageContentText(message.content),
            }
          }
          if (message.role === 'assistant' && message.toolCalls?.length) {
            const reasoning = message.reasoningContent?.trim()
            const thinkingBlocks = message.anthropicThinkingBlocks
            return {
              role: 'assistant',
              content: getMessageContentText(message.content) || null,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
              // DeepSeek / Claude-via-proxy need the prior reasoning echoed or
              // subsequent tool-loop rounds omit thinking (or 400).
              ...(reasoning
                ? { reasoning_content: reasoning, reasoning }
                : {}),
              // Claude-via-LiteLLM requires signed `thinking_blocks` on tool
              // turns; without them proxies drop `thinking` for later rounds.
              ...(thinkingBlocks?.length ? { thinking_blocks: thinkingBlocks } : {}),
            }
          }
          return { role: message.role, content: getMessageContentText(message.content) }
        }),
        tools: toOpenAiTools(request.tools),
        tool_choice: request.tools?.length ? 'auto' : undefined,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: request.maxTokens ?? 4096,
        // OpenAI automatic prompt caching: stable key improves prefix reuse across turns.
        ...(config.provider === 'openai'
          ? { prompt_cache_key: `local-copilot:${model}` }
          : {}),
      }

      if (thinkingBody) {
        body.thinking = thinkingBody.thinking
        if (thinkingBody.outputConfig) {
          body.output_config = thinkingBody.outputConfig
        }
        // Claude thinking is incompatible with temperature on the native API;
        // proxies usually mirror that constraint.
        logger.info('Arena Copilot OpenAI-compatible thinking enabled', {
          model,
          thinkingLevel: request.thinkingLevel ?? config.thinkingLevel,
          thinkingType: thinkingBody.thinking.type,
        })
      } else {
        body.temperature = request.temperature ?? 0.2
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
      const thinkingBlocks = createOpenAiCompatibleThinkingBlocksAccumulator()
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let sawSignedThinkingBlocks = false
      let loggedMissingThinkingBlocks = false
      let yieldedToolCall = false
      let emittedDone = false

      const usagePayload = () => ({
        inputTokens,
        outputTokens,
        ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
      })

      const flushPendingToolCalls = (): ChatCompletionChunk[] => {
        if (toolCalls.size === 0) return []
        if (thinkingBody && !sawSignedThinkingBlocks && !loggedMissingThinkingBlocks) {
          loggedMissingThinkingBlocks = true
          logger.warn(
            'Claude-via-proxy tool turn missing signed thinking_blocks; later rounds may drop thinking',
            { model }
          )
        }
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
          usage: usagePayload(),
        }
      }

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
            for (const chunk of flushPendingToolCalls()) yield chunk
            if (!emittedDone) {
              yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
            }
            continue
          }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  /** OpenAI-compatible / DeepSeek-style reasoning summary deltas. */
                  reasoning_content?: string
                  reasoning?: string
                  thinking_blocks?: Array<{
                    type?: string
                    thinking?: string | null
                    signature?: string | null
                    signature_delta?: string | null
                    data?: string | null
                  }>
                  tool_calls?: Array<{
                    index: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
                message?: {
                  thinking_blocks?: Array<{
                    type?: string
                    thinking?: string | null
                    signature?: string | null
                    signature_delta?: string | null
                    data?: string | null
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

            const reasoningDelta = choice.delta?.reasoning_content ?? choice.delta?.reasoning
            if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
              yield { type: 'thinking', content: reasoningDelta }
            }

            thinkingBlocks.push(choice.delta?.thinking_blocks)
            thinkingBlocks.push(choice.message?.thinking_blocks)
            const pendingThinking = thinkingBlocks.drainPendingThinking()
            if (pendingThinking) {
              yield { type: 'thinking', content: pendingThinking }
            }
            for (const block of thinkingBlocks.drainCompleted()) {
              sawSignedThinkingBlocks = true
              yield { type: 'thinking_block', thinkingBlock: block }
            }

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
              for (const chunk of flushPendingToolCalls()) yield chunk
              if (!emittedDone) {
                yield emitDone('tool_calls')
              }
            }

            if (choice.finish_reason === 'stop') {
              // Proxies sometimes buffer tool_calls then end with `stop` / [DONE].
              for (const chunk of flushPendingToolCalls()) yield chunk
              if (!emittedDone) {
                yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
              }
            }
          } catch {}
        }
      }

      for (const chunk of flushPendingToolCalls()) yield chunk
      if (!emittedDone) {
        yield emitDone(yieldedToolCall ? 'tool_calls' : 'stop')
      }
    },
  }
}
