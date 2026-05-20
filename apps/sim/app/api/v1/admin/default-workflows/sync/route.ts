import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { syncDefaultWorkflowsForSource } from '@/lib/workflows/default-user-workflows/service'
import { authenticateCronSecretRequest } from '@/app/api/v1/admin/cron-secret-auth'
import {
  badRequestResponse,
  internalErrorResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminSyncDefaultWorkflowsAPI')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * POST /api/v1/admin/default-workflows/sync
 *
 * Overwrites all user copies of a source default workflow from the template and redeploys.
 *
 * Request body:
 *   { sourceWorkflowId: string, deploy?: boolean }  // deploy defaults to true
 */
export const POST = withRouteHandler(async (request) => {
  const requestId = generateRequestId()

  try {
    const authResponse = authenticateCronSecretRequest(request)
    if (authResponse) {
      return authResponse
    }

    const body: unknown = await request.json()
    if (!isRecord(body)) {
      return badRequestResponse('Request body must be a JSON object.')
    }

    const sourceWorkflowId =
      typeof body.sourceWorkflowId === 'string' ? body.sourceWorkflowId.trim() : ''
    if (!sourceWorkflowId) {
      return badRequestResponse('sourceWorkflowId is required.')
    }

    const deploy = body.deploy !== false

    const result = await syncDefaultWorkflowsForSource({
      sourceWorkflowId,
      deploy,
      requestId,
      request,
    })

    logger.info(`[${requestId}] Admin API: Synced default workflows from source`, {
      sourceWorkflowId,
      total: result.total,
      updated: result.updated,
      deployed: result.deployed,
      failed: result.failed,
    })

    return singleResponse(result)
  } catch (error) {
    logger.error(`[${requestId}] Admin API: Failed to sync default workflows`, {
      error: toError(error),
    })
    return internalErrorResponse('Failed to sync default workflows')
  }
})
