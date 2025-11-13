import type { NextRequest } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/db-helpers'
import { hasWorkflowChanged } from '@/lib/workflows/utils'
import { validateWorkflowAccess } from '@/app/api/workflows/middleware'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('WorkflowStatusAPI')

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()

  try {
    const { id } = await params

    const validation = await validateWorkflowAccess(request, id, false)
    if (validation.error) {
      logger.warn(`[${requestId}] Workflow access validation failed: ${validation.error.message}`)
      return createErrorResponse(validation.error.message, validation.error.status)
    }

    // Check if the workflow has meaningful changes that would require redeployment
    let needsRedeployment = false
    if (validation.workflow.isDeployed && validation.workflow.deployedState) {
      const normalizedData = await loadWorkflowFromNormalizedTables(id)

      if (!normalizedData) {
        // If no normalized data found, assume changes exist
        needsRedeployment = true
      } else {
        // Normalize current state from normalized tables
        const normalizedCurrentBlocks: Record<string, any> = {}
        if (normalizedData.blocks) {
          for (const [blockId, block] of Object.entries(normalizedData.blocks)) {
            // Remove fields that don't exist in deployed state
            const { isFromNormalizedTables, ...blockWithoutExtraFields } = block as any
            normalizedCurrentBlocks[blockId] = {
              ...blockWithoutExtraFields,
              // Normalize triggerMode: null and false should be treated as the same
              triggerMode: block.triggerMode === null ? false : block.triggerMode,
            }
          }
        }

        const currentState = {
          blocks: normalizedCurrentBlocks,
          edges: normalizedData.edges || [],
          loops: normalizedData.loops || {},
          parallels: normalizedData.parallels || {},
          // Don't include lastSaved or isFromNormalizedTables in comparison as they change on every check
        }

        // Normalize deployed state to match current state structure
        const deployedState = validation.workflow.deployedState as any

        // Normalize edges to match current state structure (remove type and data fields)
        const normalizedDeployedEdges = (deployedState.edges || []).map((edge: any) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          // Remove type and data fields that are added during deployment
        }))

        // Normalize deployed blocks to handle triggerMode differences
        const normalizedDeployedBlocks: Record<string, any> = {}
        if (deployedState.blocks) {
          for (const [blockId, block] of Object.entries(deployedState.blocks)) {
            const blockData = block as any
            normalizedDeployedBlocks[blockId] = {
              ...blockData,
              // Normalize triggerMode: null and false should be treated as the same
              triggerMode: blockData.triggerMode === null ? false : blockData.triggerMode,
            }
          }
        }

        const normalizedDeployedState = {
          blocks: normalizedDeployedBlocks,
          edges: normalizedDeployedEdges,
          loops: deployedState.loops || {},
          parallels: deployedState.parallels || {},
          // Don't include lastSaved in comparison
        }

        needsRedeployment = hasWorkflowChanged(currentState as any, normalizedDeployedState as any)
      }
    }

    return createSuccessResponse({
      isDeployed: validation.workflow.isDeployed,
      deployedAt: validation.workflow.deployedAt,
      isPublished: validation.workflow.isPublished,
      needsRedeployment,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error getting status for workflow: ${(await params).id}`, error)
    return createErrorResponse('Failed to get status', 500)
  }
}
