import { db } from '@sim/db'
import { copilotChats, copilotMessages } from '@sim/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  type PersistedContentBlock,
  type PersistedMessage,
  stripToolResultOutput,
} from '@/lib/copilot/chat/persisted-message'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { LOCAL_COPILOT_MAX_HISTORY_MESSAGES } from '@/local-copilot/lib/context/context-budget'
import type { SessionMemoryTurn } from '@/local-copilot/lib/context/session-memory'
import type { ChatMessage, GeminiHistoryPart } from '@/local-copilot/lib/providers/types'
import { stripLeakedToolMarkers } from '@/local-copilot/lib/synthesize-assistant-summary'
import { formatToolResultForLlm } from '@/local-copilot/lib/tools/format-tool-result'

const MAX_HISTORY_MESSAGES = LOCAL_COPILOT_MAX_HISTORY_MESSAGES

/** Max chars per persisted row when building session-memory summarizer turns. */
const SESSION_MEMORY_TURN_TEXT_MAX = 4_000

/**
 * Converts persisted mothership/copilot chat rows into provider chat messages.
 */
export function mothershipMessagesToChatHistory(
  messages: PersistedMessage[],
  options?: { excludeMessageId?: string }
): ChatMessage[] {
  const out: ChatMessage[] = []

  for (const message of messages) {
    if (options?.excludeMessageId && message.id === options.excludeMessageId) continue

    if (message.role === 'user') {
      const text = message.content?.trim()
      if (text) out.push({ role: 'user', content: text })
      continue
    }

    out.push(...assistantMessageToChatHistory(message))
  }

  return out.slice(-MAX_HISTORY_MESSAGES)
}

/**
 * Builds compact turn records (with persisted message ids) for session-memory refresh.
 */
export function mothershipMessagesToSessionMemoryTurns(
  messages: PersistedMessage[],
  options?: { excludeMessageId?: string }
): SessionMemoryTurn[] {
  const turns: SessionMemoryTurn[] = []

  for (const message of messages) {
    if (options?.excludeMessageId && message.id === options.excludeMessageId) continue

    if (message.role === 'user') {
      const text = message.content?.trim()
      if (!text) continue
      turns.push({
        messageId: message.id,
        role: 'user',
        text: text.slice(0, SESSION_MEMORY_TURN_TEXT_MAX),
      })
      continue
    }

    const assistantText = assistantMessageToSessionMemoryText(message)
    if (!assistantText) continue
    turns.push({
      messageId: message.id,
      role: 'assistant',
      text: assistantText.slice(0, SESSION_MEMORY_TURN_TEXT_MAX),
    })
  }

  return turns
}

function assistantMessageToSessionMemoryText(message: PersistedMessage): string {
  const prose = stripLeakedToolMarkers(message.content ?? '').trim()
  const toolNames = (message.contentBlocks ?? [])
    .filter(isToolHistoryBlock)
    .map((block) => block.toolCall?.name)
    .filter((name): name is string => Boolean(name))

  const uniqueTools = [...new Set(toolNames)]
  const toolLine = uniqueTools.length > 0 ? `Tools: ${uniqueTools.slice(0, 12).join(', ')}` : ''

  if (prose && toolLine) return `${prose}\n${toolLine}`
  if (prose) return prose
  return toolLine
}

function isAssistantProseBlock(block: PersistedContentBlock): boolean {
  return (
    block.type === MothershipStreamV1EventType.text &&
    block.channel !== MothershipStreamV1TextChannel.thinking &&
    block.lane !== 'subagent' &&
    Boolean(block.content?.trim())
  )
}

function isMainThinkingBlock(block: PersistedContentBlock): boolean {
  if (block.lane === 'subagent') return false
  if (block.type === 'thinking') return Boolean(block.content?.trim())
  return (
    block.type === MothershipStreamV1EventType.text &&
    block.channel === MothershipStreamV1TextChannel.thinking &&
    Boolean(block.content?.trim())
  )
}

function isToolHistoryBlock(block: PersistedContentBlock): boolean {
  return (
    block.type === MothershipStreamV1EventType.tool &&
    Boolean(block.toolCall?.id && block.toolCall.name)
  )
}

function toolResultContent(block: PersistedContentBlock): string {
  const toolCall = block.toolCall
  if (!toolCall) return '{}'

  const result = toolCall.result
  if (result && typeof result === 'object') {
    const record = result as {
      success?: boolean
      output?: unknown
      error?: unknown
    }
    // Prefer the live tool output shape so formatToolResultForLlm can strip workflowState etc.
    const payload =
      record.output !== undefined
        ? record.output && typeof record.output === 'object'
          ? {
              ...(record.output as Record<string, unknown>),
              ...(typeof record.success === 'boolean' ? { success: record.success } : {}),
              ...(record.error ? { error: record.error } : {}),
            }
          : {
              success: record.success,
              output: record.output,
              ...(record.error ? { error: record.error } : {}),
            }
        : {
            ...(typeof record.success === 'boolean' ? { success: record.success } : {}),
            ...(record.error ? { error: record.error } : {}),
          }
    return formatToolResultForLlm(toolCall.name, payload)
  }

  return formatToolResultForLlm(toolCall.name, {
    success: toolCall.state === 'success',
    ...(toolCall.error ? { error: toolCall.error } : {}),
  })
}

/**
 * True when a persisted tool batch can be replayed as wire `tool_use` /
 * `functionCall` parts. Today we do not persist Anthropic thinking signatures or
 * Gemini thought signatures on reload, so replaying raw tool calls on the next
 * user turn breaks provider thinking (400s or silent empty thoughts).
 */
function canReplayToolBatchWithThinking(toolBatch: PersistedContentBlock[]): boolean {
  return toolBatch.every((block) => {
    const signature = block.toolCall?.thoughtSignature
    return typeof signature === 'string' && signature.length > 0
  })
}

function optionalThoughtSignature(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Rebuilds Gemini model-turn parts from persisted blocks so follow-up user
 * turns keep thought signatures (required for CoT on Gemini 3 / Vertex).
 */
function buildGeminiModelPartsFromSegment(params: {
  thinkingBlocks: PersistedContentBlock[]
  proseBlocks: PersistedContentBlock[]
  proseText: string
  toolBatch: PersistedContentBlock[]
}): GeminiHistoryPart[] | null {
  const parts: GeminiHistoryPart[] = []

  for (const block of params.thinkingBlocks) {
    const text = block.content?.trim()
    if (!text) continue
    const thoughtSignature = optionalThoughtSignature(block.thoughtSignature)
    parts.push({
      text,
      thought: true,
      ...(thoughtSignature ? { thoughtSignature } : {}),
    })
  }

  const prose = stripLeakedToolMarkers(params.proseText).trim()
  if (prose) {
    // Prefer the last prose block's signature (Gemini 3 puts it on the final part).
    let thoughtSignature: string | undefined
    for (let i = params.proseBlocks.length - 1; i >= 0; i--) {
      thoughtSignature = optionalThoughtSignature(params.proseBlocks[i]?.thoughtSignature)
      if (thoughtSignature) break
    }
    parts.push({
      text: prose,
      ...(thoughtSignature ? { thoughtSignature } : {}),
    })
  }

  for (const block of params.toolBatch) {
    const toolCall = block.toolCall
    if (!toolCall) continue
    const thoughtSignature = optionalThoughtSignature(toolCall.thoughtSignature)
    parts.push({
      functionCall: {
        id: toolCall.id,
        name: toolCall.name,
        args: (toolCall.params ?? {}) as Record<string, unknown>,
      },
      ...(thoughtSignature ? { thoughtSignature } : {}),
    })
  }

  const hasSignature = parts.some((part) => Boolean(part.thoughtSignature))
  const hasThoughtText = parts.some((part) => 'thought' in part && part.thought && part.text.trim())

  // Never replay tool calls without signatures — Gemini 3 returns 400.
  if (params.toolBatch.length > 0) {
    const allToolsSigned = params.toolBatch.every((block) =>
      Boolean(optionalThoughtSignature(block.toolCall?.thoughtSignature))
    )
    if (!allToolsSigned) return null
  }

  // Echo thought parts even without signatures on text-only turns so Gemini
  // follow-ups keep CoT context when the empty-text signature trailer was lost.
  if (!hasSignature && !hasThoughtText) return null
  return parts.length > 0 ? parts : null
}

function formatCollapsedToolTurn(params: {
  prose: string
  toolBatch: PersistedContentBlock[]
}): string {
  const sections: string[] = []
  const prose = stripLeakedToolMarkers(params.prose).trim()
  // Prior CoT must NOT be echoed as assistant content — stuffing it into
  // history makes Claude-via-proxy skip fresh thinking on the next user turn.
  if (prose) sections.push(prose)
  for (const block of params.toolBatch) {
    const name = block.toolCall?.name ?? 'tool'
    sections.push(`Called \`${name}\`.\nResult: ${toolResultContent(block)}`)
  }
  return sections.join('\n\n')
}

/**
 * Reconstructs assistant/tool turns from persisted content blocks instead of
 * flattening tools into `[Tool name: state]` text (which the model echoed to users).
 *
 * When Gemini thought signatures are present, rebuilds `geminiModelParts` so the
 * next user turn keeps CoT. Otherwise tool batches without signatures are
 * collapsed to assistant text (prose + tool summary only — never prior CoT).
 */
export function assistantMessageToChatHistory(message: PersistedMessage): ChatMessage[] {
  const blocks = message.contentBlocks ?? []
  const out: ChatMessage[] = []

  let index = 0
  // Blocks are authoritative when present — seeding `message.content` on top of
  // prose blocks doubles the assistant turn and confuses Gemini follow-ups.
  const hasProseBlocks = blocks.some(isAssistantProseBlock)
  let seededMessageContent = Boolean(message.content?.trim() && blocks.length > 0 && !hasProseBlocks)

  while (index < blocks.length) {
    const startIndex = index
    let prose = ''
    const thinkingBlocks: PersistedContentBlock[] = []
    const proseBlocks: PersistedContentBlock[] = []
    if (seededMessageContent) {
      prose = message.content ?? ''
      seededMessageContent = false
    }

    while (index < blocks.length) {
      const block = blocks[index]
      if (isMainThinkingBlock(block)) {
        thinkingBlocks.push(block)
        index += 1
        continue
      }
      if (isAssistantProseBlock(block)) {
        prose += block.content ?? ''
        proseBlocks.push(block)
        index += 1
        continue
      }
      break
    }

    const toolBatch: PersistedContentBlock[] = []
    while (index < blocks.length && isToolHistoryBlock(blocks[index])) {
      toolBatch.push(blocks[index])
      index += 1
    }

    const geminiModelParts = buildGeminiModelPartsFromSegment({
      thinkingBlocks,
      proseBlocks,
      proseText: prose,
      toolBatch,
    })

    if (toolBatch.length > 0) {
      if (geminiModelParts || canReplayToolBatchWithThinking(toolBatch)) {
        const cleanedProse = stripLeakedToolMarkers(prose)
        out.push({
          role: 'assistant',
          content: cleanedProse,
          toolCalls: toolBatch.map((block) => ({
            id: block.toolCall!.id,
            name: block.toolCall!.name,
            arguments: JSON.stringify(block.toolCall!.params ?? {}),
            ...(block.toolCall!.thoughtSignature
              ? { thoughtSignature: block.toolCall!.thoughtSignature }
              : {}),
          })),
          ...(geminiModelParts ? { geminiModelParts } : {}),
        })

        for (const block of toolBatch) {
          out.push({
            role: 'tool',
            toolCallId: block.toolCall!.id,
            content: toolResultContent(block),
          })
        }
      } else {
        const collapsed = formatCollapsedToolTurn({ prose, toolBatch })
        if (collapsed) out.push({ role: 'assistant', content: collapsed })
      }
      continue
    }

    if (geminiModelParts) {
      const cleanedProse = stripLeakedToolMarkers(prose)
      out.push({
        role: 'assistant',
        content: cleanedProse,
        geminiModelParts,
      })
      continue
    }

    const cleanedProse = stripLeakedToolMarkers(prose)
    if (cleanedProse) {
      out.push({ role: 'assistant', content: cleanedProse })
    }

    // Blocks that are neither prose nor tool (subagent lane, malformed tool
    // blocks, leftover thinking with no answer) leave `index` untouched — skip
    // one so the loop always makes progress instead of spinning forever.
    if (index === startIndex) {
      index += 1
    }
  }

  if (out.length === 0) {
    const fallback = stripLeakedToolMarkers(message.content ?? '')
    if (fallback) out.push({ role: 'assistant', content: fallback })
  }

  return out
}

export interface MothershipChatHistoryForLocalCopilot {
  messages: ChatMessage[]
  /** Compact turns with persisted ids for session-memory refresh. */
  sessionMemoryTurns: SessionMemoryTurn[]
}

/**
 * Loads prior turns from the shared `copilot_messages` table for a mothership chat.
 */
export async function loadMothershipChatHistoryForLocalCopilot(params: {
  chatId: string
  userId: string
  excludeMessageId?: string
}): Promise<MothershipChatHistoryForLocalCopilot> {
  const [chat] = await db
    .select({ id: copilotChats.id })
    .from(copilotChats)
    .where(and(eq(copilotChats.id, params.chatId), eq(copilotChats.userId, params.userId)))
    .limit(1)

  if (!chat) {
    return { messages: [], sessionMemoryTurns: [] }
  }

  const messages = await loadRecentCopilotChatMessages(params.chatId)
  const options = { excludeMessageId: params.excludeMessageId }
  return {
    messages: mothershipMessagesToChatHistory(messages, options),
    sessionMemoryTurns: mothershipMessagesToSessionMemoryTurns(messages, options),
  }
}

/**
 * Last N transcript rows for Local. Unbounded `copilot_messages` reads
 * detoast JSONB for every historical turn and sort it in Postgres.
 */
async function loadRecentCopilotChatMessages(chatId: string): Promise<PersistedMessage[]> {
  const rows = await db
    .select({ content: copilotMessages.content })
    .from(copilotMessages)
    .where(and(eq(copilotMessages.chatId, chatId), isNull(copilotMessages.deletedAt)))
    .orderBy(desc(copilotMessages.seq), desc(copilotMessages.createdAt), desc(copilotMessages.id))
    .limit(MAX_HISTORY_MESSAGES)

  return [...rows].reverse().map((row) => stripToolResultOutput(row.content as PersistedMessage))
}
