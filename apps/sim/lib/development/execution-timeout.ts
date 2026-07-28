import { getMaxExecutionTimeout } from '@/lib/core/execution-limits'

interface WorkflowBlockLike {
  type?: string
  enabled?: boolean
}

/**
 * Returns true when the workflow includes an enabled Development block (long-running app generation).
 */
export function workflowHasEnabledDevelopmentBlock(
  blocks: Record<string, WorkflowBlockLike> | undefined
): boolean {
  if (!blocks) return false
  return Object.values(blocks).some(
    (block) => block?.type === 'development' && block?.enabled !== false
  )
}

/**
 * Sync runs from the editor use the plan sync limit (5 min on free). Development pipelines
 * (LLM + build repair + GitHub + Vercel) need the async ceiling instead.
 */
export function resolveWorkflowSyncTimeoutMs(options: {
  executionTimeout: { sync: number; async: number }
  blocks: Record<string, WorkflowBlockLike> | undefined
}): number {
  const { executionTimeout, blocks } = options
  const sync = executionTimeout.sync
  if (!workflowHasEnabledDevelopmentBlock(blocks)) {
    return sync
  }
  return Math.min(Math.max(sync, executionTimeout.async), getMaxExecutionTimeout())
}
