import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getSkillNode } from '@/lib/workflows/skills/operations'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('SkillNodeAPI')

export const GET = withRouteHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ skillId: string; nodeId: string }> }
  ) => {
    const requestId = generateRequestId()
    const { skillId, nodeId } = await params
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    try {
      const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
      if (!authResult.success || !authResult.userId) {
        logger.warn(`[${requestId}] Unauthorized skill node access attempt`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      if (!workspaceId) {
        return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
      }

      const userPermission = await getUserEntityPermissions(
        authResult.userId,
        'workspace',
        workspaceId
      )
      if (!userPermission) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      const node = await getSkillNode({ skillId, nodeId, workspaceId })
      if (!node) {
        return NextResponse.json({ error: 'Skill node not found' }, { status: 404 })
      }

      return NextResponse.json({ data: node })
    } catch (error) {
      logger.error(`[${requestId}] Error fetching skill node`, error)
      return NextResponse.json({ error: 'Failed to fetch skill node' }, { status: 500 })
    }
  }
)
