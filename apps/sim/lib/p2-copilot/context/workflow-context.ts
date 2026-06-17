import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { formatNormalizedWorkflowForCopilot } from '@/lib/copilot/tools/shared/workflow-utils'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { getWorkflowById } from '@/lib/workflows/utils'

const logger = createLogger('P2CopilotWorkflowContext')

export interface BuildContextParams {
  workflowId?: string
  workspaceId?: string
  workflowName?: string
}

/**
 * Builds the system context string injected into every P2 copilot request.
 *
 * This is the brain's structural advantage over a generic assistant: it sees
 * the live workflow graph by default. If no workflow is in scope (workspace-level
 * chat) we still describe the workspace so the agent can orient itself.
 */
export async function buildWorkflowContext(params: BuildContextParams): Promise<string> {
  const { workflowId, workspaceId, workflowName } = params

  const lines: string[] = []
  if (workspaceId) lines.push(`Workspace: ${workspaceId}`)

  if (!workflowId) {
    lines.push('No specific workflow is open. Use list_user_workspaces / list_folders to navigate.')
    return lines.join('\n')
  }

  try {
    const meta = await getWorkflowById(workflowId)
    lines.push(`Current workflow: ${meta?.name ?? workflowName ?? workflowId} (id: ${workflowId})`)

    const normalized = await loadWorkflowFromNormalizedTables(workflowId)
    if (!normalized) {
      lines.push('(workflow has no saved state yet)')
      return lines.join('\n')
    }

    const blocks = Object.values(normalized.blocks)
    lines.push(`Blocks (${blocks.length}):`)
    for (const block of blocks) {
      lines.push(`- ${block.name} [${block.type}]${block.enabled === false ? ' (disabled)' : ''}`)
    }

    const formatted = formatNormalizedWorkflowForCopilot(
      normalized as Parameters<typeof formatNormalizedWorkflowForCopilot>[0]
    )
    if (formatted) {
      lines.push('', 'Detailed workflow state:', formatted)
    }
  } catch (error) {
    logger.warn('Failed to build workflow context', { error: toError(error).message, workflowId })
    lines.push('(failed to load workflow state; use read_workflow to fetch it)')
  }

  return lines.join('\n')
}
