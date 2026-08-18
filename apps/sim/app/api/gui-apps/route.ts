import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { createDeployedAppContract } from '@/lib/api/contracts/arena-generative-apps'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { performGenerativeAppDeploy } from '@/lib/workflows/orchestration'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import {
  ChatDeployAuthNotAllowedError,
  validateChatDeployAuth,
} from '@/ee/access-control/utils/permission-check'

const logger = createLogger('GenerativeAppDeployAPI')

export const POST = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return createErrorResponse('Unauthorized', 401)
  }

  const parsed = await parseRequest(
    createDeployedAppContract,
    request,
    {},
    {
      validationErrorResponse: (error) =>
        createErrorResponse(getValidationErrorMessage(error), 400, 'VALIDATION_ERROR'),
    }
  )
  if (!parsed.success) return parsed.response

  const body = parsed.data.body
  const authType = body.authType ?? 'public'

  if (authType === 'password' && !body.password) {
    return createErrorResponse('Password is required when using password protection', 400)
  }
  if (
    (authType === 'email' || authType === 'sso') &&
    (!Array.isArray(body.allowedEmails) || body.allowedEmails.length === 0)
  ) {
    return createErrorResponse(
      `At least one email or domain is required when using ${authType} access control`,
      400
    )
  }

  const { hasAccess, workflow: workflowRecord } = await checkWorkflowAccessForChatCreation(
    body.workflowId,
    session.user.id
  )
  if (!hasAccess || !workflowRecord?.workspaceId) {
    return createErrorResponse(
      !hasAccess || !workflowRecord
        ? 'Workflow not found or access denied'
        : 'Workflow has no associated workspace',
      !hasAccess || !workflowRecord ? 404 : 500
    )
  }

  const [existingIdentifier] = await db
    .select({ id: deployedApp.id, workflowId: deployedApp.workflowId })
    .from(deployedApp)
    .where(and(eq(deployedApp.identifier, body.identifier), isNull(deployedApp.archivedAt)))
    .limit(1)

  if (existingIdentifier && existingIdentifier.workflowId !== body.workflowId) {
    return createErrorResponse('Identifier already in use', 400)
  }

  if (workflowRecord.workspaceId) {
    try {
      await validateChatDeployAuth(session.user.id, workflowRecord.workspaceId, authType)
    } catch (error) {
      if (error instanceof ChatDeployAuthNotAllowedError) {
        return createErrorResponse(error.message, 403)
      }
      throw error
    }
  }

  try {
    const result = await performGenerativeAppDeploy({
      workflowId: body.workflowId,
      userId: session.user.id,
      workspaceId: workflowRecord.workspaceId,
      draftId: body.draftId,
      revisionId: body.revisionId,
      identifier: body.identifier,
      title: body.title,
      description: body.description,
      department: body.department,
      authType,
      password: body.password,
      allowedEmails: body.allowedEmails,
      requireArenaEmailId: body.requireArenaEmailId ?? true,
    })

    if (!result.success || !result.id || !result.appUrl) {
      return createErrorResponse(result.error || 'Failed to deploy app', 400)
    }

    return createSuccessResponse({
      id: result.id,
      appUrl: result.appUrl,
      message: 'Generative app deployed',
    })
  } catch (error) {
    logger.error('Failed to deploy generative app', { error: getErrorMessage(error) })
    return createErrorResponse(getErrorMessage(error, 'Failed to deploy app'), 500)
  }
})
