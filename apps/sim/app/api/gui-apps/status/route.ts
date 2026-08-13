import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { authorizeWorkflowByWorkspacePermission } from '@sim/platform-authz/workflow'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getGenerativeAppStatusContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('GenerativeAppStatusAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const parsed = await parseRequest(getGenerativeAppStatusContract, request, {})
  if (!parsed.success) return parsed.response
  const { workflowId } = parsed.data.query
  const requestId = generateRequestId()

  try {
    const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
    if (!auth.success || !auth.userId) {
      return createErrorResponse('Unauthorized', 401)
    }

    const authorization = await authorizeWorkflowByWorkspacePermission({
      workflowId,
      userId: auth.userId,
      action: 'read',
    })
    if (!authorization.allowed) {
      return createErrorResponse(
        authorization.message || 'Access denied',
        authorization.status || 403
      )
    }

    const [deployment] = await db
      .select({
        id: deployedApp.id,
        identifier: deployedApp.identifier,
        title: deployedApp.title,
        authType: deployedApp.authType,
        requireArenaEmailId: deployedApp.requireArenaEmailId,
        isActive: deployedApp.isActive,
      })
      .from(deployedApp)
      .where(and(eq(deployedApp.workflowId, workflowId), isNull(deployedApp.archivedAt)))
      .limit(1)

    const isDeployed = Boolean(deployment?.isActive)
    return createSuccessResponse({
      isDeployed,
      deployment: deployment
        ? {
            id: deployment.id,
            identifier: deployment.identifier,
            title: deployment.title,
            authType: deployment.authType,
            requireArenaEmailId: deployment.requireArenaEmailId,
          }
        : null,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error checking generative app status`, { error })
    return createErrorResponse('Failed to check generative app status', 500)
  }
})
