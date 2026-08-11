/**
 * Forces tool args to use the authenticated workspace id.
 */
export function pinToolArgsToWorkspace(
  args: Record<string, unknown>,
  workspaceId: string
): Record<string, unknown> {
  return {
    ...args,
    workspaceId,
  }
}

export interface WorkflowWorkspaceCheck {
  ok: true
  workflowId: string
}

export interface WorkflowWorkspaceDenial {
  ok: false
  error: string
}

/**
 * Ensures a workflow id is allowed for the authenticated workspace.
 */
export function assertWorkflowInWorkspace(params: {
  workflowId: string
  workspaceId: string
  workflowWorkspaceId: string | null | undefined
  allowedWorkflowIds?: Set<string>
}): WorkflowWorkspaceCheck | WorkflowWorkspaceDenial {
  const workflowId = params.workflowId.trim()
  if (!workflowId) {
    return { ok: false, error: 'workflowId is required' }
  }
  if (params.allowedWorkflowIds?.has(workflowId)) {
    return { ok: true, workflowId }
  }
  if (!params.workflowWorkspaceId) {
    return { ok: false, error: 'Workflow not found in this workspace' }
  }
  if (params.workflowWorkspaceId !== params.workspaceId) {
    return { ok: false, error: 'Workflow does not belong to the authenticated workspace' }
  }
  return { ok: true, workflowId }
}
