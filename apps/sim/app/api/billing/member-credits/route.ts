import { type NextRequest, NextResponse } from 'next/server'
import { getMyMemberCreditsContract } from '@/lib/api/contracts/organization'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { getMyMemberCreditsForWorkspace } from '@/lib/billing/organizations/member-limits'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

/**
 * GET /api/billing/member-credits?workspaceId=...
 *
 * Returns the caller's OWN per-member usage and cap inside the workspace's
 * organization, in DOLLARS (the DB unit) so the client's `formatCredits` does the
 * single dollars→credits conversion. Own-data only, so no admin gate (unlike the
 * org/member admin route). Reads allocation from the DB for display — a null
 * `limitDollars` means no per-member cap (workspace isn't org-owned, or no cap
 * is set), and callers fall back to the shared org pool.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getMyMemberCreditsContract, request, {})
  if (!parsed.success) return parsed.response

  const { workspaceId } = parsed.data.query
  const { usedDollars, limitDollars } = await getMyMemberCreditsForWorkspace(
    session.user.id,
    workspaceId
  )

  return NextResponse.json({
    success: true,
    data: {
      usedDollars,
      limitDollars,
    },
  })
})
