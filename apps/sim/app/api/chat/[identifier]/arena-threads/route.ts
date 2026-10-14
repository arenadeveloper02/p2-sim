import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import {
  createArenaAgentThreadContract,
  listArenaAgentThreadsContract,
} from '@/lib/api/contracts/arena-agent-chat'
import { parseRequest } from '@/lib/api/server'
import { createArenaAgentThread, listArenaAgentThreads } from '@/lib/chat/arena-agent-history'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  arenaAgentFailureResponse,
  arenaAgentStoreErrorResponse,
  arenaAgentSuccess,
  requireArenaAgentCron,
} from '@/app/api/chat/arena-agent-route'

const logger = createLogger('ArenaAgentThreadsAPI')

/**
 * GET /api/chat/[identifier]/arena-threads
 * Lists open threads for one Arena user on one dashboard.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(listArenaAgentThreadsContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const records = await listArenaAgentThreads({
        arenaUserId: parsed.data.query.arenaUserId,
        publicUuid: parsed.data.query.publicUuid,
        chatSlug: parsed.data.params.identifier,
      })
      return arenaAgentSuccess({ records, total: records.length })
    } catch (error) {
      logger.error('Failed to list arena agent threads', error)
      return arenaAgentFailureResponse(error, 'Failed to list threads')
    }
  }
)

/**
 * POST /api/chat/[identifier]/arena-threads
 * Creates a thread. The same chat id returns the existing open thread.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const authError = requireArenaAgentCron(request)
    if (authError) return authError

    const parsed = await parseRequest(createArenaAgentThreadContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const result = await createArenaAgentThread({
        arenaUserId: parsed.data.body.arenaUserId,
        publicUuid: parsed.data.body.publicUuid,
        chatSlug: parsed.data.params.identifier,
        chatId: parsed.data.body.chatId,
        title: parsed.data.body.title,
      })
      if (!result.ok) return arenaAgentStoreErrorResponse(result)
      return arenaAgentSuccess(result.thread)
    } catch (error) {
      logger.error('Failed to create arena agent thread', error)
      return arenaAgentFailureResponse(error, 'Failed to create thread')
    }
  }
)
