import { isParallelReadTool } from '@/local-copilot/lib/tools/parallel-reads'

/**
 * Whether the orchestrator must reload the workflow graph into `toolCtx`
 * after a tool finishes.
 *
 * Read-only tools never mutate the persisted graph — skip the Postgres
 * reload between tool rounds. Idempotent `create_workflow` reuse also
 * skips (the first create already refreshed).
 */
export function toolRequiresWorkflowContextRefresh(params: {
  toolName: string
  success: boolean
  createdWorkflowId?: string
  result?: unknown
}): boolean {
  if (!params.success) return false
  if (isParallelReadTool(params.toolName)) return false

  if (isAlreadyCreatedThisTurn(params.result)) return false

  if (params.createdWorkflowId) return true
  return params.toolName === 'edit_workflow'
}

function isAlreadyCreatedThisTurn(result: unknown): boolean {
  return (
    !!result &&
    typeof result === 'object' &&
    (result as { alreadyCreatedThisTurn?: unknown }).alreadyCreatedThisTurn === true
  )
}
