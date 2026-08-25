import {
  type Message as BedrockMessage,
  BedrockRuntimeClient,
  type ContentBlock,
  type ConversationRole,
  ConverseCommand,
  ConverseStreamCommand,
  type SystemContentBlock,
  type Tool,
  type ToolConfiguration,
  type ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime'
import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type {
  ChatCompletionRequest,
  ChatMessage,
  LocalCopilotProvider,
  TokenUsage,
} from '@/local-copilot/lib/providers/types'
import type { LocalCopilotConfig, LocalCopilotToolDefinition } from '@/local-copilot/lib/types'
import {
  buildBedrockInferenceConfig,
  generateToolUseId,
  getBedrockInferenceProfileId,
} from '@/providers/bedrock/utils'

const logger = createLogger('LocalCopilotBedrockProvider')

const BEDROCK_NOT_CONFIGURED =
  'Bedrock is not configured on this server. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or configure the AWS default credential chain).'

/** Ephemeral cache checkpoint — matches Anthropic Arena Copilot TTL. */
export const BEDROCK_PROMPT_CACHE_POINT = { type: 'default' as const, ttl: '1h' as const }

export interface BedrockConversionResult {
  system: SystemContentBlock[]
  messages: BedrockMessage[]
}

/**
 * Bedrock (esp. Nova) only accepts top-level tool inputSchema fields:
 * `type`, `properties`, `required`. Extra keys like `additionalProperties`
 * cause the model to silently ignore tools.
 */
export function cleanSchemaForBedrockTool(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const type = schema.type ?? 'object'
  const cleaned: Record<string, unknown> = { type }

  if (schema.properties && typeof schema.properties === 'object') {
    cleaned.properties = schema.properties
  } else {
    cleaned.properties = {}
  }

  if (Array.isArray(schema.required) && schema.required.length > 0) {
    cleaned.required = schema.required
  }

  return cleaned
}

/**
 * Maps Local Copilot tools to Bedrock toolSpec entries.
 */
export function toBedrockTools(
  tools: LocalCopilotToolDefinition[] | undefined
): Tool[] | undefined {
  if (!tools?.length) return undefined
  // AWS SDK `Tool` is an open Smithy union (`$UnknownMember`); assert the known toolSpec variant.
  return tools.map(
    (tool): Tool =>
      ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: cleanSchemaForBedrockTool(tool.parameters),
          },
        },
      }) as unknown as Tool
  )
}

/**
 * Claude on Bedrock supports explicit `cachePoint` breakpoints (tools → system → messages).
 */
export function bedrockModelSupportsPromptCaching(model: string): boolean {
  return /anthropic\.claude|claude-(?:opus|sonnet|haiku|fable)/i.test(model)
}

function contentHasToolUse(content: ContentBlock[] | undefined): boolean {
  return Boolean(content?.some((block) => 'toolUse' in block && block.toolUse))
}

function contentHasToolResult(content: ContentBlock[] | undefined): boolean {
  return Boolean(content?.some((block) => 'toolResult' in block && block.toolResult))
}

function contentHasConversation(content: ContentBlock[] | undefined): boolean {
  return Boolean(
    content?.some(
      (block) =>
        !(('toolResult' in block && block.toolResult) || ('toolUse' in block && block.toolUse))
    )
  )
}

function toolUseBlocksOnly(content: ContentBlock[] | undefined): ContentBlock[] {
  return (content ?? []).filter((block) => 'toolUse' in block && block.toolUse)
}

function conversationBlocksOnly(content: ContentBlock[] | undefined): ContentBlock[] {
  return (content ?? []).filter(
    (block) =>
      !(('toolResult' in block && block.toolResult) || ('toolUse' in block && block.toolUse))
  )
}

/**
 * Adds Bedrock prompt-cache checkpoints for the stable prefix (tools + system)
 * and the current conversation tip so tool-loop rounds can reuse prior tokens.
 *
 * Never attach `cachePoint` to a message that already has toolUse/toolResult —
 * Bedrock treats cachePoint as a conversation block and rejects
 * "Conversation blocks and tool use/result blocks … in the same turn".
 */
export function withBedrockPromptCachePoints(params: {
  model: string
  system: SystemContentBlock[]
  messages: BedrockMessage[]
  tools?: Tool[]
}): { system: SystemContentBlock[]; messages: BedrockMessage[]; tools?: Tool[] } {
  if (!bedrockModelSupportsPromptCaching(params.model)) {
    return { system: params.system, messages: params.messages, tools: params.tools }
  }

  const cachePoint = { cachePoint: BEDROCK_PROMPT_CACHE_POINT }

  let tools = params.tools
  if (tools?.length) {
    tools = [...tools, cachePoint as Tool]
  }

  const system =
    params.system.length > 0 ? [...params.system, cachePoint as SystemContentBlock] : params.system

  const messages = params.messages.map((message, index) => {
    if (index !== params.messages.length - 1) return message
    if (contentHasToolUse(message.content) || contentHasToolResult(message.content)) {
      return message
    }
    const content = [...(message.content ?? []), cachePoint as ContentBlock]
    return { ...message, content }
  })

  return { system, messages, tools }
}

/**
 * Maps Bedrock Converse usage (including cache read/write) to Arena Copilot TokenUsage.
 */
export function parseBedrockUsage(usage?: {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
}): TokenUsage {
  const result: TokenUsage = {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
  if (typeof usage?.cacheReadInputTokens === 'number') {
    result.cacheReadTokens = usage.cacheReadInputTokens
  }
  if (typeof usage?.cacheWriteInputTokens === 'number') {
    result.cacheCreationTokens = usage.cacheWriteInputTokens
  }
  return result
}

function parseToolArguments(raw: string): NonNullable<ToolUseBlock['input']> {
  try {
    return JSON.parse(raw || '{}') as NonNullable<ToolUseBlock['input']>
  } catch {
    return {} as NonNullable<ToolUseBlock['input']>
  }
}

/**
 * Converts internal chat messages to Bedrock Converse system + messages.
 * Consecutive tool results are batched into a single user turn.
 */
export function convertMessagesToBedrock(messages: ChatMessage[]): BedrockConversionResult {
  const system: SystemContentBlock[] = []
  const bedrockMessages: BedrockMessage[] = []

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]

    if (message.role === 'system') {
      const text = getMessageContentText(message.content).trim()
      if (text) system.push({ text })
      continue
    }

    if (message.role === 'tool') {
      const content: ContentBlock[] = []
      while (index < messages.length && messages[index].role === 'tool') {
        const toolMessage = messages[index]
        content.push({
          toolResult: {
            toolUseId: toolMessage.toolCallId || generateToolUseId('tool'),
            content: [{ text: getMessageContentText(toolMessage.content) }],
          },
        })
        index += 1
      }
      index -= 1
      if (content.length > 0) {
        bedrockMessages.push({ role: 'user' as ConversationRole, content })
      }
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      // Bedrock (Nova / Llama) rejects mixing conversation text with toolUse in
      // the same assistant turn. Match the main Bedrock provider: toolUse only.
      const content: ContentBlock[] = message.toolCalls.map((call) => {
        const toolUse: ToolUseBlock = {
          toolUseId: call.id || generateToolUseId(call.name),
          name: call.name,
          input: parseToolArguments(call.arguments),
        }
        // AWS SDK ContentBlock is an open Smithy union (`$UnknownMember`); assert the known variant.
        return { toolUse } as ContentBlock
      })
      bedrockMessages.push({ role: 'assistant' as ConversationRole, content })
      continue
    }

    const role: ConversationRole = message.role === 'assistant' ? 'assistant' : 'user'
    const text = getMessageContentText(message.content)
    bedrockMessages.push({
      role,
      content: text ? [{ text }] : [{ text: '' }],
    })
  }

  return {
    system,
    messages: normalizeBedrockConversationTurns(bedrockMessages),
  }
}

/**
 * Bedrock rejects turns that mix conversation blocks (text/cachePoint) with
 * toolUse, and rejects consecutive same-role assistants that would merge into
 * that shape. Collapse/split so every assistant tool turn is toolUse-only.
 */
export function normalizeBedrockConversationTurns(messages: BedrockMessage[]): BedrockMessage[] {
  const separated = separateToolResultAndConversationTurns(messages)
  const out: BedrockMessage[] = []

  for (const message of separated) {
    if (
      message.role === 'assistant' &&
      contentHasToolUse(message.content) &&
      contentHasConversation(message.content)
    ) {
      // Keep toolUse only — narration is not required for the next toolResult turn.
      out.push({
        role: 'assistant' as ConversationRole,
        content: toolUseBlocksOnly(message.content),
      })
      continue
    }

    const prev = out[out.length - 1]
    if (
      message.role === 'assistant' &&
      prev?.role === 'assistant' &&
      contentHasToolUse(message.content)
    ) {
      // Consecutive assistants: Bedrock may merge text + toolUse into one illegal turn.
      if (contentHasToolUse(prev.content)) {
        out[out.length - 1] = {
          role: 'assistant' as ConversationRole,
          content: [...toolUseBlocksOnly(prev.content), ...toolUseBlocksOnly(message.content)],
        }
      } else {
        out[out.length - 1] = {
          role: 'assistant' as ConversationRole,
          content: toolUseBlocksOnly(message.content),
        }
      }
      continue
    }

    if (
      message.role === 'assistant' &&
      prev?.role === 'assistant' &&
      !contentHasToolUse(message.content) &&
      !contentHasToolUse(prev.content)
    ) {
      const mergedText = [
        ...conversationBlocksOnly(prev.content),
        ...conversationBlocksOnly(message.content),
      ]
      out[out.length - 1] = {
        role: 'assistant' as ConversationRole,
        content: mergedText.length > 0 ? mergedText : [{ text: '.' }],
      }
      continue
    }

    out.push(message)
  }

  return out
}

/**
 * Nova / Llama reject user turns that mix toolResult with text. History often
 * yields consecutive user messages (`toolResults` then follow-up text); Bedrock
 * treats that as one turn. Insert a synthetic assistant separator between them.
 */
export function separateToolResultAndConversationTurns(
  messages: BedrockMessage[]
): BedrockMessage[] {
  const out: BedrockMessage[] = []

  for (const message of messages) {
    const prev = out[out.length - 1]
    if (
      message.role === 'user' &&
      prev?.role === 'user' &&
      contentHasToolResult(prev.content) &&
      contentHasConversation(message.content)
    ) {
      out.push({
        role: 'assistant' as ConversationRole,
        content: [{ text: '.' }],
      })
    }

    // Defensive: split a single mixed user turn into toolResult then text.
    if (
      message.role === 'user' &&
      contentHasToolResult(message.content) &&
      contentHasConversation(message.content)
    ) {
      const toolBlocks = (message.content ?? []).filter(
        (block) => 'toolResult' in block && block.toolResult
      )
      const conversationBlocks = conversationBlocksOnly(message.content)
      out.push({ role: 'user' as ConversationRole, content: toolBlocks })
      out.push({
        role: 'assistant' as ConversationRole,
        content: [{ text: '.' }],
      })
      out.push({ role: 'user' as ConversationRole, content: conversationBlocks })
      continue
    }

    out.push(message)
  }

  return out
}

function isCredentialError(error: unknown): boolean {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name: unknown }).name)
      : ''
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    name === 'CredentialsProviderError' ||
    message.includes('could not load credentials') ||
    message.includes('unable to locate credentials') ||
    message.includes('missing credentials') ||
    message.includes('could not resolve credentials')
  )
}

function createBedrockClient(config: LocalCopilotConfig): BedrockRuntimeClient {
  const region = config.region || process.env.AWS_REGION || 'us-east-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()

  if (accessKeyId && secretAccessKey) {
    return new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  return new BedrockRuntimeClient({ region })
}

/**
 * Whether a Bedrock model can attach `toolConfig` on ConverseStream.
 * Meta Llama 3.x / 4 stream and use tools separately, but not together — AWS
 * returns "This model doesn't support tool use in streaming mode".
 */
export function bedrockSupportsStreamingWithTools(modelId: string): boolean {
  return !/meta\.llama/i.test(modelId)
}

function mapBedrockStopReason(stopReason: string | undefined): string {
  if (stopReason === 'tool_use') return 'tool_calls'
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'stop'
  return stopReason || 'stop'
}

/**
 * Creates a Local Copilot provider backed by AWS Bedrock Converse / ConverseStream.
 */
export function createBedrockProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  const region = config.region || process.env.AWS_REGION || 'us-east-1'
  const client = createBedrockClient(config)

  return {
    id: 'bedrock',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const model = request.model || config.model
      const bedrockModelId = getBedrockInferenceProfileId(model, region)
      const converted = convertMessagesToBedrock(request.messages)
      const mappedTools = toBedrockTools(request.tools)
      const { system, messages, tools } = withBedrockPromptCachePoints({
        model,
        system: converted.system,
        messages: converted.messages,
        tools: mappedTools,
      })

      const hasToolContent = messages.some((msg) =>
        msg.content?.some(
          (block) =>
            ('toolUse' in block && block.toolUse) || ('toolResult' in block && block.toolResult)
        )
      )

      if (hasToolContent && !tools?.length) {
        throw new Error(
          'Messages contain tool use/result blocks but no tools were provided. Bedrock requires toolConfig when processing messages with tool content.'
        )
      }

      const toolConfig: ToolConfiguration | undefined = tools?.length
        ? { tools, toolChoice: { auto: {} } }
        : undefined

      // Nova tool-calling is unreliable above temperature 0; Claude 5 rejects temperature.
      const inferenceConfig = buildBedrockInferenceConfig({
        model,
        temperature: request.temperature,
        maxTokens: request.maxTokens ?? 8192,
      })

      const baseInput = {
        modelId: bedrockModelId,
        messages,
        system: system.length > 0 ? system : undefined,
        inferenceConfig,
        toolConfig,
      }

      const useStream = !(toolConfig && !bedrockSupportsStreamingWithTools(model))
      const promptCaching = bedrockModelSupportsPromptCaching(model)

      try {
        if (toolConfig || promptCaching) {
          logger.info('Bedrock request', {
            model: bedrockModelId,
            toolCount: mappedTools?.length ?? 0,
            streaming: useStream,
            promptCaching,
          })
        }

        if (!useStream) {
          const response = await client.send(
            new ConverseCommand(baseInput),
            request.signal ? { abortSignal: request.signal } : undefined
          )

          let finishReason = mapBedrockStopReason(response.stopReason)
          let yieldedToolCall = false
          for (const block of response.output?.message?.content ?? []) {
            if ('text' in block && typeof block.text === 'string' && block.text) {
              yield { type: 'text', content: block.text }
            }
            if ('toolUse' in block && block.toolUse) {
              yieldedToolCall = true
              const name = block.toolUse.name ?? ''
              yield {
                type: 'tool_call',
                toolCall: {
                  id: block.toolUse.toolUseId || generateToolUseId(name || 'tool'),
                  name,
                  arguments: JSON.stringify(block.toolUse.input ?? {}),
                },
              }
              finishReason = 'tool_calls'
            }
          }

          if (toolConfig && !yieldedToolCall) {
            logger.warn('Bedrock returned no toolUse on a tool-enabled turn', {
              model: bedrockModelId,
              stopReason: response.stopReason,
              toolCount: mappedTools?.length ?? 0,
            })
          }

          const usage = parseBedrockUsage(response.usage)
          if (usage.cacheReadTokens || usage.cacheCreationTokens) {
            logger.info('Bedrock prompt cache usage', {
              model: bedrockModelId,
              cacheReadTokens: usage.cacheReadTokens ?? 0,
              cacheCreationTokens: usage.cacheCreationTokens ?? 0,
              inputTokens: usage.inputTokens,
            })
          }

          yield {
            type: 'done',
            finishReason,
            usage,
          }
          return
        }

        const response = await client.send(
          new ConverseStreamCommand(baseInput),
          request.signal ? { abortSignal: request.signal } : undefined
        )

        if (!response.stream) {
          throw new Error('No stream returned from Bedrock')
        }

        const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>()
        let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
        let finishReason = 'stop'

        for await (const event of response.stream) {
          if (request.signal?.aborted) {
            throw new Error('Request aborted')
          }

          if (event.contentBlockStart) {
            const index = event.contentBlockStart.contentBlockIndex ?? 0
            const start = event.contentBlockStart.start
            if (start && 'toolUse' in start && start.toolUse) {
              const toolUse = start.toolUse
              const name = toolUse.name ?? ''
              pendingToolCalls.set(index, {
                id: toolUse.toolUseId || generateToolUseId(name || 'tool'),
                name,
                arguments: '',
              })
            }
          }

          if (event.contentBlockDelta) {
            const index = event.contentBlockDelta.contentBlockIndex ?? 0
            const delta = event.contentBlockDelta.delta
            if (delta && 'text' in delta && typeof delta.text === 'string') {
              yield { type: 'text', content: delta.text }
            }
            if (delta && 'toolUse' in delta && delta.toolUse?.input) {
              const existing = pendingToolCalls.get(index)
              if (existing) {
                existing.arguments += delta.toolUse.input
                pendingToolCalls.set(index, existing)
              }
            }
          }

          if (event.contentBlockStop) {
            const index = event.contentBlockStop.contentBlockIndex ?? 0
            const call = pendingToolCalls.get(index)
            if (call) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: call.id,
                  name: call.name,
                  arguments: call.arguments || '{}',
                },
              }
              pendingToolCalls.delete(index)
              finishReason = 'tool_calls'
            }
          }

          if (event.metadata?.usage) {
            usage = parseBedrockUsage(event.metadata.usage)
          }

          if (event.messageStop?.stopReason) {
            finishReason = mapBedrockStopReason(event.messageStop.stopReason)
          }
        }

        if (usage.cacheReadTokens || usage.cacheCreationTokens) {
          logger.info('Bedrock prompt cache usage', {
            model: bedrockModelId,
            cacheReadTokens: usage.cacheReadTokens ?? 0,
            cacheCreationTokens: usage.cacheCreationTokens ?? 0,
            inputTokens: usage.inputTokens,
          })
        }

        yield {
          type: 'done',
          finishReason,
          usage,
        }
      } catch (error) {
        logger.error('Bedrock request failed', { error: toError(error).message })
        if (isCredentialError(error)) {
          throw new Error(BEDROCK_NOT_CONFIGURED)
        }
        throw toError(error)
      }
    },
  }
}
