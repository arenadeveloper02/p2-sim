import { createLogger } from '@sim/logger'
import type { NextRequest, NextResponse } from 'next/server'
import {
  authenticateDeployedAppContract,
  getDeployedAppConfigContract,
} from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import {
  authorizeDeployedAppRequest,
  findDeployedAppByIdentifier,
  setAppAuthCookie,
  toDeployedAppConfig,
} from '@/lib/arena-generative-ui/deployment'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('DeployedAppConfigAPI')

export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const parsed = await parseRequest(getDeployedAppConfigContract, request, context)
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment) {
      return createErrorResponse('App not found', 404)
    }

    const authorized = await authorizeDeployedAppRequest({ request, deployment })
    if (!authorized.ok) return authorized.response

    const response = createSuccessResponse(toDeployedAppConfig(deployment))
    if (deployment.authType && deployment.authType !== 'public' && deployment.authType !== 'sso') {
      setAppAuthCookie(response, deployment.id, deployment.authType, deployment.password)
    }
    return response
  }
)

export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const parsed = await parseRequest(authenticateDeployedAppContract, request, context)
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment) {
      logger.warn('App not found for auth', { identifier: parsed.data.params.identifier })
      return createErrorResponse('App not found', 404)
    }

    const authorized = await authorizeDeployedAppRequest({
      request,
      deployment,
      parsedBody: parsed.data.body,
    })
    if (!authorized.ok) return authorized.response

    const response = createSuccessResponse(toDeployedAppConfig(deployment)) as NextResponse
    if (deployment.authType) {
      setAppAuthCookie(response, deployment.id, deployment.authType, deployment.password)
    }
    return response
  }
)
