import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceZoomAdminAccessContract } from '@/lib/api/contracts/workspaces'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { canUseZoomAdminInWorkspace } from '@/lib/workspaces/can-use-zoom-admin'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('WorkspaceZoomAdminAccessAPI')

/**
 * GET /api/workspaces/[id]/zoom-admin-access
 * Returns whether Zoom Admin connect is allowed (org allowlist or env).
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(getWorkspaceZoomAdminAccessContract, request, context)
    if (!parsed.success) return parsed.response

    const { id: workspaceId } = parsed.data.params
    const access = await checkWorkspaceAccess(workspaceId, session.user.id)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 })
    }

    const canUseZoomAdmin = await canUseZoomAdminInWorkspace({ workspaceId })
    logger.info('Resolved Zoom Admin workspace access', { workspaceId, canUseZoomAdmin })

    return NextResponse.json({ canUseZoomAdmin })
  }
)
