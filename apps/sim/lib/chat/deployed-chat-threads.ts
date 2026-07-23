import { db } from '@sim/db'
import { deployedChat } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'

const logger = createLogger('DeployedChatThreads')

export interface DeployedChatThreadRow {
  chatId: string
  title: string | null
  workflowId: string | null
  createdAt: string
  updatedAt: string
  pinnedAt: string | null
}

function isMissingColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('archived_at') ||
    message.includes('pinned_at') ||
    (message.includes('column') && message.includes('does not exist'))
  )
}

/**
 * Lists deployed chat threads for a user, with a legacy fallback when migration 0248 has not been applied.
 */
export async function listDeployedChatThreadsForUser(params: {
  identifier: string
  deploymentWorkflowId: string
  executingUserId: string
}): Promise<DeployedChatThreadRow[]> {
  const { identifier, deploymentWorkflowId, executingUserId } = params

  const workflowScope = or(
    eq(deployedChat.workflowId, identifier),
    eq(deployedChat.workflowId, deploymentWorkflowId)
  )

  try {
    const records = await db
      .select({
        chatId: deployedChat.chatId,
        title: deployedChat.title,
        workflowId: deployedChat.workflowId,
        createdAt: deployedChat.createdAt,
        updatedAt: deployedChat.updatedAt,
        pinnedAt: deployedChat.pinnedAt,
      })
      .from(deployedChat)
      .where(
        and(
          workflowScope,
          or(
            eq(deployedChat.executingUserId, executingUserId),
            isNull(deployedChat.executingUserId)
          ),
          isNull(deployedChat.archivedAt)
        )
      )
      .orderBy(
        sql`CASE WHEN ${deployedChat.pinnedAt} IS NULL THEN 1 ELSE 0 END`,
        desc(deployedChat.pinnedAt),
        desc(deployedChat.updatedAt)
      )

    return records.map(mapThreadRow)
  } catch (error) {
    if (!isMissingColumnError(error)) throw error

    logger.warn('deployed_chat metadata columns missing; using legacy thread list query')

    const records = await db
      .select({
        chatId: deployedChat.chatId,
        title: deployedChat.title,
        workflowId: deployedChat.workflowId,
        createdAt: deployedChat.createdAt,
        updatedAt: deployedChat.updatedAt,
      })
      .from(deployedChat)
      .where(
        and(
          workflowScope,
          or(
            eq(deployedChat.executingUserId, executingUserId),
            isNull(deployedChat.executingUserId)
          )
        )
      )
      .orderBy(desc(deployedChat.updatedAt))

    return records.map((record) => ({
      ...mapThreadRow(record),
      pinnedAt: null,
    }))
  }
}

function mapThreadRow(record: {
  chatId: string | null
  title: string | null
  workflowId: string | null
  createdAt: Date
  updatedAt: Date
  pinnedAt?: Date | null
}): DeployedChatThreadRow {
  return {
    chatId: record.chatId ?? '',
    title: record.title,
    workflowId: record.workflowId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pinnedAt: record.pinnedAt?.toISOString() ?? null,
  }
}
