import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { listSkillChildren } from '@/lib/workflows/skills/operations'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('SkillTreeAPI')

export const GET = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ skillId: string }> }) => {
    const requestId = generateRequestId()
    const { skillId } = await params
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    const path = request.nextUrl.searchParams.get('path') ?? undefined

    try {
      const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
      if (!authResult.success || !authResult.userId) {
        logger.warn(`[${requestId}] Unauthorized skill tree access attempt`)
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

      const children = await listSkillChildren({ skillId, workspaceId, path })
      return NextResponse.json({ data: children })
    } catch (error) {
      logger.error(`[${requestId}] Error fetching skill tree`, error)
      return NextResponse.json({ error: 'Failed to fetch skill tree' }, { status: 500 })
    }
  }
)
