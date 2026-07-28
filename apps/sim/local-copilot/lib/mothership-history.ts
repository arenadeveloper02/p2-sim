import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadCopilotChatMessages } from '@/lib/copilot/chat/lifecycle'
import type { PersistedContentBlock, PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { LOCAL_COPILOT_MAX_HISTORY_MESSAGES } from '@/local-copilot/lib/context/context-budget'
import type { SessionMemoryTurn } from '@/local-copilot/lib/context/session-memory'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import { stripLeakedToolMarkers } from '@/local-copilot/lib/synthesize-assistant-summary'

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
  const toolLine =
    uniqueTools.length > 0 ? `Tools: ${uniqueTools.slice(0, 12).join(', ')}` : ''

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
    const payload: Record<string, unknown> = { success: result.success }
    if (result.output !== undefined) payload.output = result.output
    if (result.error) payload.error = result.error
    return JSON.stringify(payload)
  }

  return JSON.stringify({
    success: toolCall.state === 'success',
    ...(toolCall.error ? { error: toolCall.error } : {}),
  })
}

/**
 * Reconstructs assistant/tool turns from persisted content blocks instead of
 * flattening tools into `[Tool name: state]` text (which the model echoed to users).
 */
export function assistantMessageToChatHistory(message: PersistedMessage): ChatMessage[] {
  const blocks = message.contentBlocks ?? []
  const out: ChatMessage[] = []

  let index = 0
  let seededMessageContent = Boolean(message.content?.trim() && blocks.length > 0)

  while (index < blocks.length) {
    const startIndex = index
    let prose = ''
    if (seededMessageContent) {
      prose = message.content ?? ''
      seededMessageContent = false
    }
    while (index < blocks.length && isAssistantProseBlock(blocks[index])) {
      prose += blocks[index].content ?? ''
      index += 1
    }

    const toolBatch: PersistedContentBlock[] = []
    while (index < blocks.length && isToolHistoryBlock(blocks[index])) {
      toolBatch.push(blocks[index])
      index += 1
    }

    if (toolBatch.length > 0) {
      const cleanedProse = stripLeakedToolMarkers(prose)
      out.push({
        role: 'assistant',
        content: cleanedProse,
        toolCalls: toolBatch.map((block) => ({
          id: block.toolCall!.id,
          name: block.toolCall!.name,
          arguments: JSON.stringify(block.toolCall!.params ?? {}),
        })),
      })

      for (const block of toolBatch) {
        out.push({
          role: 'tool',
          toolCallId: block.toolCall!.id,
          content: toolResultContent(block),
        })
      }
      continue
    }

    const cleanedProse = stripLeakedToolMarkers(prose)
    if (cleanedProse) {
      out.push({ role: 'assistant', content: cleanedProse })
    }

    // Blocks that are neither prose nor tool (thinking channel, subagent lane,
    // malformed tool blocks) leave `index` untouched — skip one so the loop
    // always makes progress instead of spinning the event loop forever.
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

  const messages = await loadCopilotChatMessages(params.chatId)
  const options = { excludeMessageId: params.excludeMessageId }
  return {
    messages: mothershipMessagesToChatHistory(messages, options),
    sessionMemoryTurns: mothershipMessagesToSessionMemoryTurns(messages, options),
  }
}
