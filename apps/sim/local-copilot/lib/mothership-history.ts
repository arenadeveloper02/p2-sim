import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadCopilotChatMessages } from '@/lib/copilot/chat/lifecycle'
import type { PersistedContentBlock, PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
} from '@/lib/copilot/generated/mothership-stream-v1'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import { LOCAL_COPILOT_MAX_HISTORY_MESSAGES } from '@/local-copilot/lib/context/context-budget'
import { stripLeakedToolMarkers } from '@/local-copilot/lib/synthesize-assistant-summary'

const MAX_HISTORY_MESSAGES = LOCAL_COPILOT_MAX_HISTORY_MESSAGES

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
    (block.type === MothershipStreamV1EventType.tool || block.type === 'tool_call') &&
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
  }

  if (out.length === 0) {
    const fallback = stripLeakedToolMarkers(message.content ?? '')
    if (fallback) out.push({ role: 'assistant', content: fallback })
  }

  return out
}

/**
 * Loads prior turns from the shared `copilot_messages` table for a mothership chat.
 */
export async function loadMothershipChatHistoryForLocalCopilot(params: {
  chatId: string
  userId: string
  excludeMessageId?: string
}): Promise<ChatMessage[]> {
  const [chat] = await db
    .select({ id: copilotChats.id })
    .from(copilotChats)
    .where(and(eq(copilotChats.id, params.chatId), eq(copilotChats.userId, params.userId)))
    .limit(1)

  if (!chat) return []

  const messages = await loadCopilotChatMessages(params.chatId)
  return mothershipMessagesToChatHistory(messages, { excludeMessageId: params.excludeMessageId })
}
