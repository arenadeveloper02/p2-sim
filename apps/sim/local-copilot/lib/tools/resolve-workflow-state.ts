import { reloadLocalCopilotWorkflowContext } from '@/local-copilot/lib/context/reload-workflow-context'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import { resolveWorkflowIdForDelegatedTool } from '@/local-copilot/lib/tools/mothership-delegated-tools'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'
import { loadWorkflowRevision } from '@/local-copilot/lib/writes/workflow-access'

type WorkflowStateContext = NonNullable<LocalCopilotStructuredContext['workflow']>

export interface ResolvedWorkflowState {
  ok: true
  workflow: WorkflowStateContext
}

export interface MissingWorkflowState {
  ok: false
  error: string
}

export interface ResolveWorkflowStateOptions {
  /**
   * When true, always reload from Postgres instead of returning the turn-cached
   * graph. Required for get_workflow_context after a stale-revision edit failure —
   * otherwise "Re-read the workflow and retry" never refreshes `workflowRevision`
   * and every subsequent edit_workflow keeps failing.
   */
  forceReload?: boolean
}

/**
 * Home-chat-safe workflow lookup: use the open workflow, a passed workflowId,
 * or the single workspace workflow. Never throws.
 */
export async function resolveWorkflowStateForLocalTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown> = {},
  options: ResolveWorkflowStateOptions = {}
): Promise<ResolvedWorkflowState | MissingWorkflowState> {
  const workflowId = resolveWorkflowIdForDelegatedTool(args, ctx)
  const current = ctx.structuredContext.workflow
  const forceReload = options.forceReload === true

  if (!forceReload && current && (!workflowId || current.id === workflowId)) {
    return { ok: true, workflow: current }
  }

  const targetId = workflowId || current?.id
  if (!targetId) {
    return { ok: false, error: missingHomeWorkflowError(ctx) }
  }

  const loaded = await reloadLocalCopilotWorkflowContext({
    previous: ctx.structuredContext,
    workflowId: targetId,
  })
  if (!loaded.workflow) {
    return { ok: false, error: missingHomeWorkflowError(ctx) }
  }

  ctx.workflowId = loaded.workflow.id
  ctx.structuredContext = loaded

  const revision = await loadWorkflowRevision(loaded.workflow.id, ctx.workspaceId)
  if (revision) {
    ctx.workflowRevision = revision.revision
  }

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
