import { db } from '@sim/db'
import { deployedApp, workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import {
  deleteDeployedAppContract,
  updateDeployedAppContract,
} from '@/lib/api/contracts/arena-generative-apps'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  performGenerativeAppDeploy,
  performGenerativeAppUndeploy,
} from '@/lib/workflows/orchestration'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import {
  ChatDeployAuthNotAllowedError,
  validateChatDeployAuth,
} from '@/ee/access-control/utils/permission-check'

const logger = createLogger('GenerativeAppManageAPI')

async function loadManagedApp(id: string, userId: string) {
  const [row] = await db
    .select({
      app: deployedApp,
      workspaceId: workflow.workspaceId,
    })
    .from(deployedApp)
    .innerJoin(workflow, eq(deployedApp.workflowId, workflow.id))
    .where(and(eq(deployedApp.id, id), isNull(deployedApp.archivedAt)))
    .limit(1)

  if (!row) {
    return { hasAccess: false as const }
  }

  const { hasAccess } = await checkWorkflowAccessForChatCreation(row.app.workflowId, userId)
  if (!hasAccess) {
    return { hasAccess: false as const }
  }

  return { hasAccess: true as const, app: row.app, workspaceId: row.workspaceId }
}

export const PATCH = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    const parsed = await parseRequest(updateDeployedAppContract, request, context, {
      validationErrorResponse: (error) =>
        createErrorResponse(getValidationErrorMessage(error), 400, 'VALIDATION_ERROR'),
    })
    if (!parsed.success) return parsed.response

    const { id } = parsed.data.params
    const body = parsed.data.body
    const managed = await loadManagedApp(id, session.user.id)
    if (!managed.hasAccess || !managed.app) {
      return createErrorResponse('App not found or access denied', 404)
    }

    const authType = body.authType ?? managed.app.authType
    if (authType && authType !== managed.app.authType && managed.workspaceId) {
      try {
        await validateChatDeployAuth(
          session.user.id,
          managed.workspaceId,
          authType as 'public' | 'password' | 'email' | 'sso'
        )
      } catch (error) {
        if (error instanceof ChatDeployAuthNotAllowedError) {
          return createErrorResponse(error.message, 403)
        }
        throw error
      }
    }

    if (body.isActive === false) {
      await performGenerativeAppUndeploy({
        id,
        userId: session.user.id,
        workspaceId: managed.workspaceId,
        title: managed.app.title,
      })
      return createSuccessResponse({
        id,
        appUrl: '',
        message: 'Generative app archived',
      })
    }

    try {
      const result = await performGenerativeAppDeploy({
        workflowId: managed.app.workflowId,
        userId: session.user.id,
        workspaceId: managed.workspaceId || managed.app.workspaceId,
        draftId: body.draftId ?? managed.app.draftId ?? '',
        revisionId: body.revisionId ?? managed.app.revisionId ?? undefined,
        identifier: body.identifier ?? managed.app.identifier,
        title: body.title ?? managed.app.title,
        description: body.description ?? managed.app.description ?? undefined,
        department: body.department ?? managed.app.department,
        authType: (authType as 'public' | 'password' | 'email' | 'sso') ?? 'public',
        password: body.password,
        allowedEmails: body.allowedEmails,
        requireArenaEmailId: body.requireArenaEmailId ?? managed.app.requireArenaEmailId,
      })

      if (!result.success || !result.id || !result.appUrl) {
        return createErrorResponse(result.error || 'Failed to update app', 400)
      }

      return createSuccessResponse({
        id: result.id,
        appUrl: result.appUrl,
        message: 'Generative app updated',
      })
    } catch (error) {
      logger.error('Failed to update generative app', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Failed to update app'), 500)
    }
  }
)

export const DELETE = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    const parsed = await parseRequest(deleteDeployedAppContract, request, context)
    if (!parsed.success) return parsed.response

    const managed = await loadManagedApp(parsed.data.params.id, session.user.id)
    if (!managed.hasAccess || !managed.app) {
      return createErrorResponse('App not found or access denied', 404)
    }

    await performGenerativeAppUndeploy({
      id: managed.app.id,
      userId: session.user.id,
      workspaceId: managed.workspaceId,
      title: managed.app.title,
    })

    return createSuccessResponse({ message: 'Generative app archived' })
  }
)
