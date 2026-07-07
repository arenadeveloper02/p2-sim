import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import { resolveToolModelUsageSource } from '@/lib/billing/core/record-model-usage'
import { recordModelUsageEntries } from '@/lib/billing/core/record-model-usage.server'

export interface DevelopmentUsageContext {
  userId: string
  workspaceId?: string
  workflowId?: string
  executionId?: string
  requestId: string
}

/**
 * Records development-block LLM usage to the usage_log ledger.
 */
export async function recordDevelopmentModelUsage(
  llmUsage: ModelUsageByModel | undefined,
  context: DevelopmentUsageContext
): Promise<void> {
  if (!llmUsage || Object.keys(llmUsage).length === 0) {
    return
  }

  await recordModelUsageEntries(llmUsage, {
    userId: context.userId,
    source: resolveToolModelUsageSource(context.executionId),
    workspaceId: context.workspaceId,
    workflowId: context.workflowId,
    executionId: context.executionId,
    sourceReference: `development:${context.requestId}`,
  })
}
