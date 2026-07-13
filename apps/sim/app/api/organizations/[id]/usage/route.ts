import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getOrganizationUsageAnalyticsContract } from '@/lib/api/contracts/organization-usage'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { isOrganizationAdminOrOwner } from '@/lib/workspaces/permissions/utils'
import {
  InvalidUsageSourcesError,
  parseWorkspaceUsageSources,
} from '@/lib/workspaces/usage/analytics'
import { getOrganizationUsageAnalytics } from '@/lib/workspaces/usage/organization-analytics'

const logger = createLogger('OrganizationUsageAnalyticsAPI')

/**
 * GET /api/organizations/[id]/usage
 *
 * Organization-admin usage analytics across all active workspaces in the org
 * (totals, by-workspace rollup, and most-expensive workflows / chats / actors).
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(getOrganizationUsageAnalyticsContract, request, context)
    if (!parsed.success) return parsed.response

    const { id: organizationId } = parsed.data.params
    const { startTime, endTime, period, sources, allTime } = parsed.data.query

    const isAdmin = await isOrganizationAdminOrOwner(session.user.id, organizationId)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const analytics = await getOrganizationUsageAnalytics({
        organizationId,
        startTime,
        endTime,
        period,
        sources: parseWorkspaceUsageSources(sources),
        allTime,
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

      logger.error('Organization usage analytics failed', {
        organizationId,
        error: message,
      })
      return NextResponse.json(
        { error: 'Failed to compute organization usage analytics' },
        { status: 500 }
      )
    }
  }
)
