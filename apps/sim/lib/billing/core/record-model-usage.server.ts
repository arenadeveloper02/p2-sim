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

interface ToolModelUsageScope {
  userId?: string
  workspaceId?: string
  workflowId?: string
  executionId?: string
}

/**
 * Records Figma-to-HTML AI model usage from a successful tool result.
 * Called from the server-side tool executor — not from the tool config module.
 */
export async function recordFigmaToHtmlAiModelUsage(
  result: ToolResponse,
  scope: ToolModelUsageScope,
  fileKey?: string
): Promise<void> {
  if (!scope.userId) {
    return
  }

  const output = result.output
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return
  }

  const metadata = (output as { metadata?: Record<string, unknown> }).metadata
  if (!metadata || typeof metadata !== 'object') {
    return
  }

  const model = typeof metadata.aiModel === 'string' ? metadata.aiModel : ''
  if (!model || model === 'fallback') {
    return
  }

  const inputTokens = typeof metadata.inputTokens === 'number' ? metadata.inputTokens : 0
  const outputTokens = typeof metadata.outputTokens === 'number' ? metadata.outputTokens : 0

  await recordModelUsage({
    userId: scope.userId,
    model,
    inputTokens,
    outputTokens,
    source: resolveToolModelUsageSource(scope.executionId),
    workspaceId: scope.workspaceId,
    workflowId: scope.workflowId,
    executionId: scope.executionId,
    sourceReference: fileKey ? `figma_to_html_ai:${fileKey}` : 'figma_to_html_ai',
  })
}
