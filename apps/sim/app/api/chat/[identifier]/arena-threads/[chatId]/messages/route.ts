import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import {
  createArenaAgentMessageContract,
  listArenaAgentMessagesContract,
} from '@/lib/api/contracts/arena-agent-chat'
import { parseRequest } from '@/lib/api/server'
import { createArenaAgentMessage, listArenaAgentMessages } from '@/lib/chat/arena-agent-history'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  arenaAgentFailureResponse,
  arenaAgentStoreErrorResponse,
  arenaAgentSuccess,
  requireArenaAgentCron,
} from '@/app/api/chat/arena-agent-route'

const logger = createLogger('ArenaAgentMessagesAPI')

/**
 * GET /api/chat/[identifier]/arena-threads/[chatId]/messages
 * Returns messages for one open thread when the Arena user and dashboard match.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const GET = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; chatId: string }> }
  ) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(listArenaAgentMessagesContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const result = await listArenaAgentMessages({
        arenaUserId: parsed.data.query.arenaUserId,
        publicUuid: parsed.data.query.publicUuid,
        chatSlug: parsed.data.params.identifier,
        chatId: parsed.data.params.chatId,
      })
      if (!result.ok) return arenaAgentStoreErrorResponse(result)
      return arenaAgentSuccess({ messages: result.messages })
    } catch (error) {
      logger.error('Failed to list arena agent messages', error)
      return arenaAgentFailureResponse(error, 'Failed to list messages')
    }
  }
)

/**
 * POST /api/chat/[identifier]/arena-threads/[chatId]/messages
 * Appends a user or assistant message to an open thread.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; chatId: string }> }
  ) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(createArenaAgentMessageContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const result = await createArenaAgentMessage({
        arenaUserId: parsed.data.body.arenaUserId,
        publicUuid: parsed.data.body.publicUuid,
        chatSlug: parsed.data.params.identifier,
        chatId: parsed.data.params.chatId,
        role: parsed.data.body.role,
        content: parsed.data.body.content,
        executionId: parsed.data.body.executionId,
      })
      if (!result.ok) return arenaAgentStoreErrorResponse(result)
      return arenaAgentSuccess(result.message)
    } catch (error) {
      logger.error('Failed to create arena agent message', error)
      return arenaAgentFailureResponse(error, 'Failed to create message')
    }
  }
)
