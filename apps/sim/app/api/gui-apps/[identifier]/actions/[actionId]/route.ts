import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { runDeployedAppActionContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import {
  authorizeDeployedAppRequest,
  findDeployedAppByIdentifier,
} from '@/lib/arena-generative-ui/deployment'
import {
  createDeployedAppActionSseResponse,
  isStreamingAction,
  runDeployedAppAction,
} from '@/lib/arena-generative-ui/run-action'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('DeployedAppActionAPI')

export const POST = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; actionId: string }> }
  ) => {
    const parsed = await parseRequest(runDeployedAppActionContract, request, context)
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment) {
      return createErrorResponse('App not found', 404)
    }

    const authorized = await authorizeDeployedAppRequest({
      request,
      deployment,
      bodyEmailId: parsed.data.body.emailId,
    })
    if (!authorized.ok) return authorized.response

    const actionId = parsed.data.params.actionId
    const values = (parsed.data.body.values ?? {}) as Record<string, unknown>

    if (isStreamingAction(deployment.manifest, deployment.apiBindings, actionId)) {
      return createDeployedAppActionSseResponse({
        deployment,
        actionId,
        values,
        requestId: authorized.requestId,
      })
    }

    try {
      const result = await runDeployedAppAction({
        deployment,
        actionId,
        values,
        requestId: authorized.requestId,
      })
      return createSuccessResponse(result)
    } catch (error) {
      logger.error('Generative app action failed', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Action failed'), 500)
    }
  }
)
