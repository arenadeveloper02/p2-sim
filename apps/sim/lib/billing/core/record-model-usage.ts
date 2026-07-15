/** Sources used when recording internal model calls from tools and copilot. */
export type ModelUsageSource = 'workflow' | 'copilot'

export interface RecordModelUsageParams {
  userId: string
  model: string
  inputTokens: number
  outputTokens: number
  source: ModelUsageSource
  workspaceId?: string
  workflowId?: string
  executionId?: string
  sourceReference?: string
}

export type ModelUsageByModel = Record<string, { inputTokens: number; outputTokens: number }>

/**
 * Workflow tool calls attribute to `workflow`; standalone copilot paths use `copilot`.
 */
export function resolveToolModelUsageSource(executionId?: string): ModelUsageSource {
  return executionId ? 'workflow' : 'copilot'
}
