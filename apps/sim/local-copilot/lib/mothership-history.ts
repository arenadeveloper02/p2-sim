import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { loadCopilotChatMessages } from '@/lib/copilot/chat/lifecycle'
import type { PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import { LOCAL_COPILOT_MAX_HISTORY_MESSAGES } from '@/local-copilot/lib/context/context-budget'

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

    const text = persistedMessageToChatText(message)
    if (!text) continue

    out.push({ role: message.role, content: text })
  }

  return out.slice(-MAX_HISTORY_MESSAGES)
}

function persistedMessageToChatText(message: PersistedMessage): string | undefined {
  const parts: string[] = []
  const trimmedContent = message.content?.trim()
  if (trimmedContent) parts.push(trimmedContent)

  if (message.role === 'assistant' && message.contentBlocks?.length) {
    for (const block of message.contentBlocks) {
      if (block.type === MothershipStreamV1EventType.text) {
        if (
          block.channel === MothershipStreamV1TextChannel.thinking ||
          block.lane === 'subagent'
        ) {
          continue
        }
        const text = block.content?.trim()
        if (text && !trimmedContent?.includes(text)) {
          parts.push(text)
        }
      }

      if (block.type === MothershipStreamV1EventType.tool && block.toolCall?.name) {
        const state = block.toolCall.state ?? 'completed'
        parts.push(`[Tool ${block.toolCall.name}: ${state}]`)
      }
    }
  }

  const combined = parts.join('\n').trim()
  return combined || undefined
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
