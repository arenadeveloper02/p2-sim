import {
  type Content,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  GoogleGenAI,
  type Part,
  type ThinkingConfig,
} from '@google/genai'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import {
  listLocalCopilotGeminiApiKeys,
  resolveLocalCopilotGeminiApiKey,
} from '@/local-copilot/lib/providers/gemini-keys'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatMessage,
  ChatMessageContentPart,
  GeminiHistoryPart,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig, LocalCopilotToolDefinition } from '@/local-copilot/lib/types'
import {
  cleanSchemaForGemini,
  ensureStructResponse,
  mapToThinkingBudget,
  mapToThinkingLevel,
} from '@/providers/google/utils'
import { isGemini3Model } from '@/providers/utils'

const logger = createLogger('LocalCopilotGeminiProvider')

const GEMINI_NOT_CONFIGURED =
  'Gemini is not configured on this server. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_3 (or GEMINI_API_KEY / GOOGLE_API_KEY).'

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

function optionalThoughtSignature(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** True when a Gemini/Vertex part is model reasoning (not answer prose). */
function isGeminiThoughtPart(part: { thought?: unknown }): boolean {
  return part.thought === true || part.thought === 'true'
}

/**
 * Maps a stored history part back onto the GenAI `Part` shape for round-trip.
 */
export function geminiHistoryPartToPart(part: GeminiHistoryPart): Part {
  if ('functionCall' in part) {
    return {
      functionCall: {
        id: part.functionCall.id,
        name: part.functionCall.name,
        args: part.functionCall.args,
      },
      ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
    }
  }
  return {
    text: part.text,
    ...(part.thought ? { thought: true } : {}),
    ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
  }
}

/**
 * Appends streamed Gemini parts into an assembled history buffer (merging
 * contiguous thought/text deltas) and returns Local Copilot stream chunks.
 * Generated tool-call ids are written into the history parts so tool results
 * and model-turn echo stay aligned.
 *
 * Gemini 3 often sends the final `thoughtSignature` on an **empty-text** part
 * while streaming — those must not be dropped or follow-up turns lose CoT.
 */
export function appendGeminiStreamParts(
  historyParts: GeminiHistoryPart[],
  incoming: GeminiCandidatePart[],
  generateCallId: () => string
): ChatCompletionChunk[] {
  const chunks: ChatCompletionChunk[] = []

  for (const part of incoming) {
    if (part.functionCall?.name) {
      const thoughtSignature = optionalThoughtSignature(part.thoughtSignature)
      const id = part.functionCall.id || generateCallId()
      historyParts.push({
        functionCall: {
          id,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        },
        ...(thoughtSignature ? { thoughtSignature } : {}),
      })
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
          ...(thoughtSignature ? { thoughtSignature } : {}),
        },
      })
      continue
    }

    const text = typeof part.text === 'string' ? part.text : ''
    const thoughtSignature = optionalThoughtSignature(part.thoughtSignature)
    const isThought = isGeminiThoughtPart(part)

    // Signature-only / empty-text trailer — attach to the open text/thought part.
    if (!text) {
      if (!thoughtSignature) continue
      const last = historyParts.at(-1)
      if (last && 'text' in last && Boolean(last.thought) === isThought) {
        last.thoughtSignature = thoughtSignature
      } else {
        historyParts.push({
          text: '',
          ...(isThought ? { thought: true } : {}),
          thoughtSignature,
        })
      }
      chunks.push({
        type: isThought ? 'thinking' : 'text',
        content: '',
        thoughtSignature,
      })
      continue
    }

    const last = historyParts.at(-1)
    // Do not merge across signature boundaries (Gemini rejects / drops continuity).
    const canMerge =
      last &&
      'text' in last &&
      Boolean(last.thought) === isThought &&
      !('functionCall' in last) &&
      !last.thoughtSignature &&
      !thoughtSignature

    if (canMerge) {
      last.text += text
    } else {
      historyParts.push({
        text,
        ...(isThought ? { thought: true } : {}),
        ...(thoughtSignature ? { thoughtSignature } : {}),
      })
    }

    chunks.push({
      type: isThought ? 'thinking' : 'text',
      content: text,
      ...(thoughtSignature ? { thoughtSignature } : {}),
    })
  }

  return chunks
}

/**
 * Maps Gemini candidate parts onto Local Copilot stream chunks.
 * Function calls are kept even when the API flags the part as thought — Gemini 3.x
 * often attaches `thought: true` (and a thought signature) to tool-call parts.
 * Thought text is emitted as `thinking` for the thinking channel (top-of-message
 * chrome + persistence), not as assistant prose.
 */
export function chunksFromGeminiParts(
  parts: GeminiCandidatePart[],
  generateCallId: () => string
): ChatCompletionChunk[] {
  return appendGeminiStreamParts([], parts, generateCallId)
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
 * When `geminiModelParts` is present on an assistant message, those parts
 * are echoed verbatim (including thought text and signatures) so later rounds
 * and follow-up user turns keep reasoning continuity.
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

    if (message.role === 'assistant' && message.geminiModelParts?.length) {
      for (const call of message.toolCalls ?? []) {
        toolNameById.set(call.id, call.name)
      }
      contents.push({
        role: 'model',
        parts: message.geminiModelParts.map(geminiHistoryPartToPart),
      })
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        toolNameById.set(call.id, call.name)
      }

      const parts: Part[] = []
      const assistantText = getMessageContentText(message.content).trim()
      if (assistantText) {
        parts.push({ text: assistantText })
      }
      for (const call of message.toolCalls) {
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
 * Shared Gemini / Vertex streaming path for Local Copilot.
 * Caller owns client construction (API key vs Vertex project + ADC).
 */
export async function* streamGoogleGenAiChatCompletion(params: {
  ai: GoogleGenAI
  config: LocalCopilotConfig
  request: ChatCompletionRequest
  /** Log label, e.g. `Gemini` or `Vertex`. */
  logLabel: string
  /** Strip optional `vertex/` prefix from the model id before the API call. */
  stripVertexPrefix?: boolean
}): AsyncGenerator<ChatCompletionChunk, void, undefined> {
  const { ai, config, request, logLabel, stripVertexPrefix = false } = params
  const rawModel = request.model || config.model
  const model = stripVertexPrefix ? rawModel.replace(/^vertex\//, '') : rawModel
  const { systemInstruction, contents } = convertMessagesToGemini(request.messages)
  const functionDeclarations = toGeminiFunctionDeclarations(request.tools)
  const hasTools = Boolean(functionDeclarations?.length)
  const thinkingLevel = config.thinkingLevel?.trim().toLowerCase()

  const historyThoughtParts = contents.reduce((sum, content) => {
    if (content.role !== 'model') return sum
    return (
      sum +
      (content.parts?.filter((part) => part.thought === true && Boolean(part.text)).length ?? 0)
    )
  }, 0)
  const historySignatureParts = contents.reduce((sum, content) => {
    if (content.role !== 'model') return sum
    return sum + (content.parts?.filter((part) => Boolean(part.thoughtSignature)).length ?? 0)
  }, 0)
  if (historyThoughtParts > 0 || historySignatureParts > 0) {
    logger.info(`${logLabel} history model parts for CoT continuity`, {
      model,
      historyThoughtParts,
      historySignatureParts,
      contentTurns: contents.length,
    })
  }

  const thinkingConfig: ThinkingConfig | undefined = (() => {
    if (!thinkingLevel || thinkingLevel === 'none') return undefined
    if (isGemini3Model(model)) {
      return {
        includeThoughts: true,
        thinkingLevel: mapToThinkingLevel(thinkingLevel),
      }
    }
    return {
      includeThoughts: true,
      thinkingBudget: mapToThinkingBudget(model, thinkingLevel),
    }
  })()

  const generateConfig = {
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
    ...(thinkingConfig ? { thinkingConfig } : {}),
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
    if (thinkingConfig) {
      logger.info(`${logLabel} thinking enabled`, {
        model,
        thinkingLevel,
        includeThoughts: true,
      })
    }

    if (hasTools) {
      logger.info(`${logLabel} tool-enabled request`, {
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
    let cacheReadTokens = 0
    let thoughtsTokenCount = 0
    let yieldedToolCall = false
    let yieldedThinkingChars = 0
    let apiFinishReason: string | undefined
    let partCount = 0
    const historyParts: GeminiHistoryPart[] = []

    for await (const chunk of stream) {
      if (request.signal?.aborted) {
        throw new Error('Request aborted')
      }

      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
        // Gemini 2.5+ implicit context cache hits (subset of promptTokenCount).
        cacheReadTokens = chunk.usageMetadata.cachedContentTokenCount ?? cacheReadTokens
        thoughtsTokenCount = chunk.usageMetadata.thoughtsTokenCount ?? thoughtsTokenCount
      }

      const candidate = chunk.candidates?.[0]
      if (candidate?.finishReason) {
        apiFinishReason = String(candidate.finishReason)
      }

      const parts = candidate?.content?.parts ?? []
      partCount += parts.length

      for (const emitted of appendGeminiStreamParts(historyParts, parts, generateShortId)) {
        if (emitted.type === 'tool_call') yieldedToolCall = true
        if (emitted.type === 'thinking' && emitted.content) {
          yieldedThinkingChars += emitted.content.length
        }
        yield emitted
      }
    }

    if (historyParts.length > 0) {
      const thoughtParts = historyParts.filter((part) => 'text' in part && part.thought)
      const signatureParts = historyParts.filter((part) => Boolean(part.thoughtSignature))
      logger.info(`${logLabel} model parts assembled`, {
        model,
        partCount: historyParts.length,
        thoughtParts: thoughtParts.length,
        thoughtChars: thoughtParts.reduce(
          (sum, part) => sum + ('text' in part ? part.text.length : 0),
          0
        ),
        yieldedThinkingChars,
        thoughtsTokenCount,
        signatureParts: signatureParts.length,
      })
      yield { type: 'gemini_model_parts', geminiModelParts: historyParts }
    }

    if (thinkingConfig && thoughtsTokenCount > 0 && yieldedThinkingChars === 0) {
      logger.warn(
        `${logLabel} thinking requested but no thought text streamed (API billed thoughts without includeThoughts text)`,
        {
          model,
          thinkingLevel,
          thoughtsTokenCount,
          partCount,
        }
      )
    }

    if (apiFinishReason === 'MALFORMED_FUNCTION_CALL') {
      logger.warn(`${logLabel} returned MALFORMED_FUNCTION_CALL`, {
        model,
        toolCount: functionDeclarations?.length ?? 0,
      })
    }

    if (hasTools && !yieldedToolCall) {
      logger.warn(`${logLabel} returned no function calls on a tool-enabled turn`, {
        model,
        finishReason: apiFinishReason,
        partCount,
        toolCount: functionDeclarations!.length,
      })
    }

    if (cacheReadTokens > 0) {
      logger.info(`${logLabel} prompt cache usage`, {
        model,
        cacheReadTokens,
        inputTokens,
      })
    }

    yield {
      type: 'done',
      finishReason: yieldedToolCall ? 'tool_calls' : (apiFinishReason ?? 'stop'),
      usage: {
        inputTokens,
        outputTokens,
        ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
      },
    }
  } catch (error) {
    logger.error(`${logLabel} request failed`, { error: toError(error).message })
    throw toError(error)
  }
}

/**
 * Creates a Local Copilot provider backed by the Google GenAI SDK (API key).
 *
 * Each stream request resolves a fresh API key from `GEMINI_API_KEY_1..3`
 * (round-robin) so parent rounds and specialists distribute across keys.
 */
export function createGeminiProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  if (!config.apiKey && listLocalCopilotGeminiApiKeys().length === 0) {
    throw new Error(GEMINI_NOT_CONFIGURED)
  }

  return {
    id: 'gemini',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const apiKey = resolveLocalCopilotGeminiApiKey()
      if (!apiKey) {
        throw new Error(GEMINI_NOT_CONFIGURED)
      }
      const ai = new GoogleGenAI({ apiKey })
      yield* streamGoogleGenAiChatCompletion({
        ai,
        config,
        request,
        logLabel: 'Gemini',
      })
    },
  }
}
