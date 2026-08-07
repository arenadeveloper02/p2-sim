import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getUserUsageAnalyticsContract } from '@/lib/api/contracts/user-usage'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  InvalidUsageSourcesError,
  parseWorkspaceUsageSources,
} from '@/lib/workspaces/usage/analytics'
import {
  getUserUsageAnalytics,
  InvalidUserWorkspaceError,
} from '@/lib/workspaces/usage/user-analytics'

const logger = createLogger('UserUsageAnalyticsAPI')

/**
 * GET /api/users/me/usage
 *
 * Self-scoped usage analytics for the signed-in user (resolved actor attribution).
 * Optional `workspaceId` subsets to one membership workspace; omit for all.
 * Lineage drill-down (`rootExecutionId`) only applies when a single workspace is selected.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getUserUsageAnalyticsContract, request, {})
  if (!parsed.success) return parsed.response

  const { startTime, endTime, period, sources, allTime, workspaceId, rootExecutionId } =
    parsed.data.query

  try {
    const analytics = await getUserUsageAnalytics({
      userId: session.user.id,
      startTime,
      endTime,
      period,
      sources: parseWorkspaceUsageSources(sources),
      allTime,
      workspaceId,
      rootExecutionId,
    })

    return NextResponse.json(analytics)
  } catch (error) {
    if (error instanceof InvalidUsageSourcesError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof InvalidUserWorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    const message = toError(error).message
    if (message === 'Invalid time range') {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    logger.error('User usage analytics failed', {
      userId: session.user.id,
      error: message,
    })
    return NextResponse.json({ error: 'Failed to compute user usage analytics' }, { status: 500 })
  }
})
