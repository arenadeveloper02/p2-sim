import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getWorkspaceUsageAnalyticsContract } from '@/lib/api/contracts/workspace-usage'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  getWorkspaceUsageAnalytics,
  InvalidUsageSourcesError,
  parseWorkspaceUsageSources,
} from '@/lib/workspaces/usage/analytics'
import { hasWorkspaceAdminAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('WorkspaceUsageAnalyticsAPI')

/**
 * GET /api/workspaces/[id]/usage
 *
 * Workspace-admin usage analytics joining the billing ledger, workflow execution
 * logs, and copilot chat/run tables.
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(getWorkspaceUsageAnalyticsContract, request, context)
    if (!parsed.success) return parsed.response

    const { id: workspaceId } = parsed.data.params
    const { startTime, endTime, period, sources, allTime, rootExecutionId } = parsed.data.query

    const isAdmin = await hasWorkspaceAdminAccess(session.user.id, workspaceId)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const analytics = await getWorkspaceUsageAnalytics({
        workspaceId,
        startTime,
        endTime,
        period,
        sources: parseWorkspaceUsageSources(sources),
        allTime,
        rootExecutionId,
      })

      return NextResponse.json(analytics)
    } catch (error) {
      if (error instanceof InvalidUsageSourcesError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      const message = toError(error).message
      if (message === 'Invalid time range') {
        return NextResponse.json({ error: message }, { status: 400 })
      }

      logger.error('Workspace usage analytics failed', {
        workspaceId,
        error: message,
      })
      return NextResponse.json({ error: 'Failed to compute workspace usage analytics' }, { status: 500 })
    }
  }
)
