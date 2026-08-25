import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { getLastSuccessfulWorkflowOutputSchemaContract } from '@/lib/api/contracts/workflows'
import { parseRequest } from '@/lib/api/server'
import { loadLastSuccessfulRunOutputSchema } from '@/lib/arena-generative-ui/last-run-output-schema'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'
import { validateWorkflowAccess } from '@/app/api/workflows/middleware'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('WorkflowLastSuccessfulOutputSchemaAPI')

export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const requestId = generateRequestId()
    const parsed = await parseRequest(
      getLastSuccessfulWorkflowOutputSchemaContract,
      request,
      context
    )
    if (!parsed.success) return parsed.response
    const { id } = parsed.data.params

    try {
      const validation = await validateWorkflowAccess(request, id, false)
      if (validation.error) {
        logger.warn(`[${requestId}] Workflow access validation failed: ${validation.error.message}`)
        return createErrorResponse(validation.error.message, validation.error.status)
      }

      const activeDeploymentVersionId = await loadActiveDeploymentVersionId(id)
      const result = await loadLastSuccessfulRunOutputSchema(id, { activeDeploymentVersionId })
      return createSuccessResponse({
        outputSchema: result.fields,
        warnings: result.warnings,
        found: result.found,
      })
    } catch (error) {
      logger.error(`[${requestId}] Error reading last successful output schema for ${id}`, {
        error: getErrorMessage(error),
      })
      return createErrorResponse('Failed to read last successful output schema', 500)
    }
  }
)

async function loadActiveDeploymentVersionId(workflowId: string): Promise<string | null> {
  try {
    const deployed = await loadDeployedWorkflowState(workflowId)
    return deployed.deploymentVersionId
  } catch {
    return null
  }
}
