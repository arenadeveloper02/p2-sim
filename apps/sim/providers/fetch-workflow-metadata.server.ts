import { createLogger } from '@sim/logger'
import type { WorkflowToolExecutionContext } from '@/tools/types'

const logger = createLogger('FetchWorkflowMetadata')

/**
 * Fetches workflow metadata (name and description) from the API.
 * Server-only: pulls executor HTTP auth (`node:crypto`).
 */
export async function fetchWorkflowMetadata(
  workflowId: string,
  executionContext: WorkflowToolExecutionContext | undefined
): Promise<{ name: string; description: string | null } | null> {
  try {
    if (!executionContext?.userId) {
      throw new Error('Workflow metadata enrichment requires a trusted execution subject')
    }
    const { buildAPIUrl, buildExecutorDelegationHeaders } = await import('@/executor/utils/http')
    const { executionScopeForTarget } = await import('@/executor/utils/delegation')

    const headers = await buildExecutorDelegationHeaders({
      subjectUserId: executionContext.userId,
      workflowId,
      ...executionScopeForTarget(executionContext, workflowId),
    })
    const url = buildAPIUrl(`/api/workflows/${workflowId}`)

    const response = await fetch(url.toString(), { headers })
    if (!response.ok) {
      await response.text().catch(() => {})
      logger.warn(`Failed to fetch workflow metadata for ${workflowId}`)
      return null
    }

    const { data } = await response.json()
    return {
      name: data?.name || 'Workflow',
      description: data?.description || null,
    }
  } catch (error) {
    logger.error('Error fetching workflow metadata:', error)
    return null
  }
}
