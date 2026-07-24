import { db } from '@sim/db'
import { copilotChats, copilotMessages, copilotRuns } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import { parseUpdateCostBillingMessageId } from '@/lib/billing/core/usage-attribution-backfill'

export interface MothershipChatAttribution {
  chatId: string
  runId?: string
  workspaceId?: string
  /** Which lookup produced the chat id. */
  resolvedVia: 'message' | 'stream' | 'both'
}

export interface ResolveMothershipChatAttributionParams {
  /** Mothership/copilot message or stream id (without the update-cost prefix). */
  messageId: string
  /** Billed user — ownership gate for chat/run rows. */
  userId: string
  /** Optional workspace gate when the request already carries one. */
  workspaceId?: string
}

/**
 * Resolves chat/run attribution from a mothership message or stream id.
 *
 * Looks up `copilot_messages.message_id` and `copilot_runs.stream_id` in
 * parallel. When both resolve, they must agree on `chatId` — disagreement is
 * treated as ambiguous (returns null) rather than coalescing.
 */
export async function resolveMothershipChatAttributionFromMessageId(
  params: ResolveMothershipChatAttributionParams
): Promise<MothershipChatAttribution | null> {
  const messageId = params.messageId.trim()
  if (!messageId) return null

  const ownershipFilters = (workspaceIdColumn: typeof copilotChats.workspaceId) => {
    const clauses = [eq(copilotChats.userId, params.userId)]
    if (params.workspaceId) {
      clauses.push(eq(workspaceIdColumn, params.workspaceId))
    }
    return and(...clauses)
  }

  const [messageRows, runRows] = await Promise.all([
    db
      .select({
        chatId: copilotMessages.chatId,
        workspaceId: copilotChats.workspaceId,
      })
      .from(copilotMessages)
      .innerJoin(copilotChats, eq(copilotChats.id, copilotMessages.chatId))
      .where(
        and(eq(copilotMessages.messageId, messageId), ownershipFilters(copilotChats.workspaceId))
      )
      .limit(1),
    db
      .select({
        chatId: copilotRuns.chatId,
        runId: copilotRuns.id,
        workspaceId: copilotRuns.workspaceId,
      })
      .from(copilotRuns)
      .innerJoin(copilotChats, eq(copilotChats.id, copilotRuns.chatId))
      .where(
        and(
          eq(copilotRuns.streamId, messageId),
          eq(copilotRuns.userId, params.userId),
          ...(params.workspaceId ? [eq(copilotRuns.workspaceId, params.workspaceId)] : [])
        )
      )
      .limit(1),
  ])

  const fromMessage = messageRows[0]
  const fromRun = runRows[0]

  if (fromMessage && fromRun) {
    if (fromMessage.chatId !== fromRun.chatId) {
      return null
    }
    return {
      chatId: fromMessage.chatId,
      runId: fromRun.runId,
      workspaceId: fromRun.workspaceId ?? fromMessage.workspaceId ?? undefined,
      resolvedVia: 'both',
    }
  }

  if (fromMessage) {
    return {
      chatId: fromMessage.chatId,
      workspaceId: fromMessage.workspaceId ?? undefined,
      resolvedVia: 'message',
    }
  }

  if (fromRun) {
    return {
      chatId: fromRun.chatId,
      runId: fromRun.runId,
      workspaceId: fromRun.workspaceId ?? undefined,
      resolvedVia: 'stream',
    }
  }

  return null
}

/**
 * Resolves chat/run attribution from an update-cost ledger event key
 * (`update-cost:{messageId}-billing`).
 */
export async function resolveMothershipChatAttributionFromEventKey(params: {
  eventKey: string
  userId: string
  workspaceId?: string
}): Promise<MothershipChatAttribution | null> {
  const messageId = parseUpdateCostBillingMessageId(params.eventKey)
  if (!messageId) return null
  return resolveMothershipChatAttributionFromMessageId({
    messageId,
    userId: params.userId,
    workspaceId: params.workspaceId,
  })
}
