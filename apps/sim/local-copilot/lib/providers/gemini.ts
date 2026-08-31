import {
  type Content,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  GoogleGenAI,
  type Part,
} from '@google/genai'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatMessage,
  ChatMessageContentPart,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig, LocalCopilotToolDefinition } from '@/local-copilot/lib/types'
import { cleanSchemaForGemini, ensureStructResponse } from '@/providers/google/utils'

const logger = createLogger('LocalCopilotGeminiProvider')

const GEMINI_NOT_CONFIGURED =
  'Gemini is not configured on this server. Set GEMINI_API_KEY (or GOOGLE_API_KEY).'

export interface GeminiConversionResult {
  systemInstruction?: string
  contents: Content[]
}

/**
 * Maps Local Copilot tools to Gemini functionDeclarations.
 * Uses `parametersJsonSchema` (standard JSON Schema) instead of the legacy
 * Gemini `parameters` Schema — lowercase types like `object`/`string` work,
 * and tool calling is far more reliable on Gemini 2.5 / 3.x.
 */
export function toGeminiFunctionDeclarations(
  tools: LocalCopilotToolDefinition[] | undefined
): FunctionDeclaration[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: cleanSchemaForGemini(tool.parameters),
  }))
}

function toGeminiUserParts(content: string | ChatMessageContentPart[]): Part[] {
  if (typeof content === 'string') {
    return content ? [{ text: content }] : []
  }

  const parts: Part[] = []
  for (const part of content) {
    if (part.type === 'text') {
      if (part.text) parts.push({ text: part.text })
      continue
    }
    parts.push({
      inlineData: {
        mimeType: part.source.media_type,
        data: part.source.data,
      },
    })
  }
  return parts
}

export interface GeminiCandidatePart {
  thought?: boolean
  text?: string
  thoughtSignature?: string
  functionCall?: {
    id?: string
    name?: string
    args?: Record<string, unknown>
  }
}

/**
 * Maps Gemini candidate parts onto Local Copilot stream chunks.
 * Function calls are kept even when the API flags the part as thought — Gemini 3.x
 * often attaches `thought: true` (and a thought signature) to tool-call parts.
 * Thought text is not user-facing.
 */
export function chunksFromGeminiParts(
  parts: GeminiCandidatePart[],
  generateCallId: () => string
): ChatCompletionChunk[] {
  const chunks: ChatCompletionChunk[] = []

  for (const part of parts) {
    if (part.functionCall?.name) {
      const thoughtSignature =
        typeof part.thoughtSignature === 'string' && part.thoughtSignature.length > 0
          ? part.thoughtSignature
          : undefined
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: part.functionCall.id || generateCallId(),
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
          ...(thoughtSignature ? { thoughtSignature } : {}),
        },
      })
    }

    if (part.text && part.thought !== true) {
      chunks.push({ type: 'text', content: part.text })
    }
  }

  return chunks
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseToolResponse(content: string | ChatMessageContentPart[]): Record<string, unknown> {
  const text = getMessageContentText(content)
  try {
    return ensureStructResponse(JSON.parse(text || '{}'))
  } catch {
    return ensureStructResponse(text)
  }
}

/**
 * Converts internal chat messages to Gemini `contents` + `systemInstruction`.
 * Tool results are batched into a single user turn with functionResponse parts.
 */
export function convertMessagesToGemini(messages: ChatMessage[]): GeminiConversionResult {
  const systemParts: string[] = []
  const contents: Content[] = []
  const toolNameById = new Map<string, string>()

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]

    if (message.role === 'system') {
      const text = getMessageContentText(message.content).trim()
      if (text) systemParts.push(text)
      continue
    }

    if (message.role === 'tool') {
      const responseParts: Part[] = []
      while (index < messages.length && messages[index].role === 'tool') {
        const toolMessage = messages[index]
        const toolCallId = toolMessage.toolCallId ?? ''
        const name = toolNameById.get(toolCallId) ?? 'unknown'
        responseParts.push({
          functionResponse: {
            id: toolCallId || undefined,
            name,
            response: parseToolResponse(toolMessage.content),
          },
        })
        index += 1
      }
      index -= 1
      if (responseParts.length > 0) {
        contents.push({ role: 'user', parts: responseParts })
      }
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const parts: Part[] = []
      const assistantText = getMessageContentText(message.content).trim()
      if (assistantText) {
        parts.push({ text: assistantText })
      }
      for (const call of message.toolCalls) {
        toolNameById.set(call.id, call.name)
        const part: Part = {
          functionCall: {
            id: call.id,
            name: call.name,
            args: parseToolArguments(call.arguments),
          },
        }
        // Gemini 3+ requires the opaque thought signature from the original
        // functionCall part to be echoed on subsequent turns.
        if (call.thoughtSignature) {
          part.thoughtSignature = call.thoughtSignature
        }
        parts.push(part)
      }
      contents.push({ role: 'model', parts })
      continue
    }

    if (message.role === 'user') {
      const parts = toGeminiUserParts(message.content)
      if (parts.length > 0) {
        contents.push({ role: 'user', parts })
      }
      continue
    }

    const text = getMessageContentText(message.content)
    contents.push({ role: 'model', parts: text ? [{ text }] : [] })
  }

  return {
    systemInstruction: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    contents,
  }
}

/**
 * Creates a Local Copilot provider backed by the Google GenAI SDK.
 */
export function createGeminiProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  if (!config.apiKey) {
    throw new Error(GEMINI_NOT_CONFIGURED)
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey })

  return {
    id: 'gemini',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const model = request.model || config.model
      const { systemInstruction, contents } = convertMessagesToGemini(request.messages)
      const functionDeclarations = toGeminiFunctionDeclarations(request.tools)
      const hasTools = Boolean(functionDeclarations?.length)

      const generateConfig = {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
        ...(hasTools
          ? {
              tools: [{ functionDeclarations }],
              toolConfig: {
                functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
              },
            }
          : {}),
        abortSignal: request.signal,
      }

      try {
        if (hasTools) {
          logger.info('Gemini tool-enabled request', {
            model,
            toolCount: functionDeclarations!.length,
            toolNames: functionDeclarations!.map((tool) => tool.name),
          })
        }

        // Always stream — Local Copilot agent rounds attach tools on nearly
        // every turn, so a non-streaming tool path would appear as "no
        // streaming" in chat. generateContentStream supports functionCall
        // parts alongside text deltas.
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: generateConfig,
        })

        let inputTokens = 0
        let outputTokens = 0
        let yieldedToolCall = false
        let apiFinishReason: string | undefined
        let partCount = 0

        for await (const chunk of stream) {
          if (request.signal?.aborted) {
            throw new Error('Request aborted')
          }

          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
            outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
          }

          const candidate = chunk.candidates?.[0]
          if (candidate?.finishReason) {
            apiFinishReason = String(candidate.finishReason)
          }

          const parts = candidate?.content?.parts ?? []
          partCount += parts.length

          for (const emitted of chunksFromGeminiParts(parts, generateShortId)) {
            if (emitted.type === 'tool_call') yieldedToolCall = true
            yield emitted
          }
        }

        if (apiFinishReason === 'MALFORMED_FUNCTION_CALL') {
          logger.warn('Gemini returned MALFORMED_FUNCTION_CALL', {
            model,
            toolCount: functionDeclarations?.length ?? 0,
          })
        }

        if (hasTools && !yieldedToolCall) {
          logger.warn('Gemini returned no function calls on a tool-enabled turn', {
            model,
            finishReason: apiFinishReason,
            partCount,
            toolCount: functionDeclarations!.length,
          })
        }

        yield {
          type: 'done',
          finishReason: yieldedToolCall ? 'tool_calls' : (apiFinishReason ?? 'stop'),
          usage: { inputTokens, outputTokens },
        }
      } catch (error) {
        logger.error('Gemini request failed', { error: toError(error).message })
        throw toError(error)
      }
    },
  }
}
