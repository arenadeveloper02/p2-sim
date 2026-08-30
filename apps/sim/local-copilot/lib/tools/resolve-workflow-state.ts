import { reloadLocalCopilotWorkflowContext } from '@/local-copilot/lib/context/reload-workflow-context'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import { resolveWorkflowIdForDelegatedTool } from '@/local-copilot/lib/tools/mothership-delegated-tools'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

type WorkflowStateContext = NonNullable<LocalCopilotStructuredContext['workflow']>

export interface ResolvedWorkflowState {
  ok: true
  workflow: WorkflowStateContext
}

export interface MissingWorkflowState {
  ok: false
  error: string
}

/**
 * Home-chat-safe workflow lookup: use the open workflow, a passed workflowId,
 * or the single workspace workflow. Never throws.
 */
export async function resolveWorkflowStateForLocalTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown> = {}
): Promise<ResolvedWorkflowState | MissingWorkflowState> {
  const workflowId = resolveWorkflowIdForDelegatedTool(args, ctx)
  const current = ctx.structuredContext.workflow

  if (current && (!workflowId || current.id === workflowId)) {
    return { ok: true, workflow: current }
  }

  if (!workflowId) {
    return { ok: false, error: missingHomeWorkflowError(ctx) }
  }

  const loaded = await reloadLocalCopilotWorkflowContext({
    previous: ctx.structuredContext,
    workflowId,
  })
  if (!loaded.workflow) {
    return { ok: false, error: missingHomeWorkflowError(ctx) }
  }

  ctx.workflowId = loaded.workflow.id
  ctx.structuredContext = loaded

  return { ok: true, workflow: loaded.workflow }
}

export function missingHomeWorkflowError(ctx: ToolExecutionContext): string {
  const workflows = ctx.structuredContext.workspaceWorkflows ?? []
  if (workflows.length === 0) {
    return 'A workflow is required. Create one with create_workflow first.'
  }
  return `workflowId is required on home chat. Pass workflowId from workspaceWorkflows. Available: ${workflows
    .map((workflow) => `"${workflow.name}" (${workflow.id})`)
    .join(', ')}`
}
