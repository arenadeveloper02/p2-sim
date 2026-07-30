import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type {
  ModelUsageByModel,
  RecordModelUsageParams,
} from '@/lib/billing/core/record-model-usage'
import { resolveToolModelUsageSource } from '@/lib/billing/core/record-model-usage'
import { recordUsage } from '@/lib/billing/core/usage-log'
import { getCostMultiplier } from '@/lib/core/config/env-flags'
import { calculateCost } from '@/providers/utils'
import type { ToolResponse } from '@/tools/types'

const logger = createLogger('RecordModelUsage')

/**
 * Records a single model call to the usage_log ledger with token metadata.
 * Best-effort — failures are logged and never thrown to callers.
 */
export async function recordModelUsage(params: RecordModelUsageParams): Promise<void> {
  const {
    userId,
    model,
    inputTokens,
    outputTokens,
    source,
    workspaceId,
    workflowId,
    executionId,
    chatId,
    sourceReference,
  } = params

  if (inputTokens <= 0 && outputTokens <= 0) {
    return
  }

  const { total } = calculateCost(model, inputTokens, outputTokens)
  const cost = total * getCostMultiplier()
  if (cost <= 0) {
    return
  }

  try {
    await recordUsage({
      userId,
      workspaceId,
      workflowId,
      executionId,
      ...(chatId ? { chatId } : {}),
      entries: [
        {
          category: 'model',
          source,
          description: model,
          cost,
          ...(sourceReference ? { sourceReference } : {}),
          metadata: { inputTokens, outputTokens },
        },
      ],
    })
  } catch (error) {
    logger.error('Failed to record model usage', {
      error: toError(error).message,
      model,
      source,
      userId,
      workspaceId,
      workflowId,
      executionId,
      chatId,
    })
  }
}

/**
 * Records one usage_log row per model in a usage map.
 */
export async function recordModelUsageEntries(
  usageByModel: ModelUsageByModel,
  context: Omit<RecordModelUsageParams, 'model' | 'inputTokens' | 'outputTokens'>
): Promise<void> {
  await Promise.all(
    Object.entries(usageByModel).map(([model, usage]) =>
      recordModelUsage({
        ...context,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    )
  )
}
