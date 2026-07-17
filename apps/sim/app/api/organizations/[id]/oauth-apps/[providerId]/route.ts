import { db } from '@sim/db'
import { member } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { deleteOrganizationOAuthAppContract } from '@/lib/api/contracts/organization-oauth-apps'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { deleteOrganizationOAuthApp, listCustomOAuthAppKeys } from '@/lib/oauth/custom-apps'
import { isOrgAdminRole } from '@sim/platform-authz/workspace'

const logger = createLogger('OrganizationOAuthAppDeleteAPI')

/**
 * DELETE /api/organizations/[id]/oauth-apps/[providerId]
 * Removes an organization-scoped custom OAuth app (org admin/owner only).
 */
export const DELETE = withRouteHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string; providerId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(deleteOrganizationOAuthAppContract, _request, context)
    if (!parsed.success) return parsed.response

    const { id: organizationId, providerId: appKey } = parsed.data.params

    const [memberEntry] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, session.user.id)))
      .limit(1)

    if (!memberEntry) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isOrgAdminRole(memberEntry.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    if (!listCustomOAuthAppKeys().includes(appKey)) {
      return NextResponse.json({ error: `Unsupported custom OAuth app: ${appKey}` }, { status: 400 })
    }

    await deleteOrganizationOAuthApp(organizationId, appKey)

    logger.info('Organization custom OAuth app deleted', { organizationId, appKey })

    return NextResponse.json({ success: true as const })
  }
)
