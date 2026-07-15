import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getCreditUsageSummaryContract } from '@/lib/api/contracts/billing-credit-usage'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { getCreditUsageSummary } from '@/lib/billing/core/credit-usage-breakdown'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('BillingCreditUsageAPI')

/**
 * GET /api/billing/credit-usage?workspaceId=...
 *
 * Returns Mothership + workflow-run credit usage for the billing page.
 * Organization admins receive org-wide totals and per-member rows; everyone
 * else receives only their own usage for the active billing period.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getCreditUsageSummaryContract, request, {})
  if (!parsed.success) return parsed.response

  try {
    const summary = await getCreditUsageSummary({
      userId: session.user.id,
      workspaceId: parsed.data.query.workspaceId,
    })

    if (!summary) {
      return NextResponse.json({ error: 'Usage summary unavailable' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error) {
    logger.error('Failed to get credit usage summary', {
      userId: session.user.id,
      workspaceId: parsed.data.query.workspaceId,
      error,
    })
    return NextResponse.json({ error: 'Failed to get credit usage summary' }, { status: 500 })
  }
})
