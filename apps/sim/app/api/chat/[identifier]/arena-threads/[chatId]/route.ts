import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import {
  archiveArenaAgentThreadContract,
  updateArenaAgentThreadContract,
} from '@/lib/api/contracts/arena-agent-chat'
import { parseRequest } from '@/lib/api/server'
import { archiveArenaAgentThread, updateArenaAgentThread } from '@/lib/chat/arena-agent-history'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  arenaAgentFailureResponse,
  arenaAgentStoreErrorResponse,
  arenaAgentSuccess,
  requireArenaAgentCron,
} from '@/app/api/chat/arena-agent-route'

const logger = createLogger('ArenaAgentThreadAPI')

/**
 * PATCH /api/chat/[identifier]/arena-threads/[chatId]
 * Renames or pins an open thread owned by the Arena user and dashboard.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const PATCH = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; chatId: string }> }
  ) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(updateArenaAgentThreadContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const result = await updateArenaAgentThread({
        arenaUserId: parsed.data.body.arenaUserId,
        publicUuid: parsed.data.body.publicUuid,
        chatSlug: parsed.data.params.identifier,
        chatId: parsed.data.params.chatId,
        title: parsed.data.body.title,
        pinned: parsed.data.body.pinned,
      })
      if (!result.ok) return arenaAgentStoreErrorResponse(result)
      return arenaAgentSuccess(result.thread)
    } catch (error) {
      logger.error('Failed to update arena agent thread', error)
      return arenaAgentFailureResponse(error, 'Failed to update thread')
    }
  }
)

/**
 * DELETE /api/chat/[identifier]/arena-threads/[chatId]
 * Archives an open thread. Messages stay stored.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const DELETE = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; chatId: string }> }
  ) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(archiveArenaAgentThreadContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const result = await archiveArenaAgentThread({
        arenaUserId: parsed.data.query.arenaUserId,
        publicUuid: parsed.data.query.publicUuid,
        chatSlug: parsed.data.params.identifier,
        chatId: parsed.data.params.chatId,
      })
      if (!result.ok) return arenaAgentStoreErrorResponse(result)
      return arenaAgentSuccess({ success: true })
    } catch (error) {
      logger.error('Failed to archive arena agent thread', error)
      return arenaAgentFailureResponse(error, 'Failed to archive thread')
    }
  }
)
