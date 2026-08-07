/**
 * Shared merge helper for `copilot_chats.config` jsonb keys.
 */
import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'

const logger = createLogger('LocalCopilotChatConfig')

export type CopilotChatConfig = Record<string, unknown>

/**
 * Loads the chat config object for a user-owned chat.
 */
export async function loadCopilotChatConfig(
  chatId: string,
  userId: string
): Promise<CopilotChatConfig | null> {
  const [chat] = await db
    .select({ config: copilotChats.config })
    .from(copilotChats)
    .where(and(eq(copilotChats.id, chatId), eq(copilotChats.userId, userId)))
    .limit(1)

  if (!chat) return null
  if (chat.config && typeof chat.config === 'object' && !Array.isArray(chat.config)) {
    return { ...(chat.config as CopilotChatConfig) }
  }
  return {}
}

/**
 * Merges keys into `copilot_chats.config` without clobbering unrelated fields.
 */
export async function mergeCopilotChatConfig(
  chatId: string,
  userId: string,
  patch: CopilotChatConfig
): Promise<boolean> {
  const existing = await loadCopilotChatConfig(chatId, userId)
  if (existing === null) {
    logger.warn('Skipping chat config merge; chat not found', { chatId })
    return false
  }

  await db
    .update(copilotChats)
    .set({ config: { ...existing, ...patch }, updatedAt: new Date() })
    .where(and(eq(copilotChats.id, chatId), eq(copilotChats.userId, userId)))

  return true
}
