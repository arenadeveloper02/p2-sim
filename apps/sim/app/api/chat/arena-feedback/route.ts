import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { upsertArenaAgentFeedbackContract } from '@/lib/api/contracts/arena-agent-chat'
import { parseRequest } from '@/lib/api/server'
import { upsertArenaAgentFeedback } from '@/lib/chat/arena-agent-history'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  arenaAgentFailureResponse,
  arenaAgentSuccess,
  requireArenaAgentCron,
} from '@/app/api/chat/arena-agent-route'

const logger = createLogger('ArenaAgentFeedbackAPI')

/**
 * POST /api/chat/arena-feedback
 * Saves or clears feedback for one execution, keyed by the Arena user.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const authError = requireArenaAgentCron(request)
  if (authError) return authError

  const parsed = await parseRequest(upsertArenaAgentFeedbackContract, request, {})
  if (!parsed.success) return parsed.response

  try {
    await upsertArenaAgentFeedback(parsed.data.body)
    return arenaAgentSuccess({ success: true })
  } catch (error) {
    logger.error('Failed to save arena agent feedback', error)
    return arenaAgentFailureResponse(error, 'Failed to save feedback')
  }
})
