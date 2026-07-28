import { getCostMultiplier } from '@/lib/core/config/env-flags'
import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import { calculateCost } from '@/providers/utils'
import type { ProviderResponse } from '@/providers/types'

/** Billable cost fields placed on tool `output` for span → usage_log metering. */
export interface ToolLlmCostFields {
  cost: {
    input: number
    output: number
    total: number
  }
  model: string
  tokens: {
    input: number
    output: number
    total: number
  }
}

/**
 * Builds tool-output cost fields from a single model call.
 * Applies {@link getCostMultiplier} the same way `executeProviderRequest` does.
 */
export function buildToolLlmCostFields(
  model: string,
  inputTokens: number,
  outputTokens: number
): ToolLlmCostFields | undefined {
  if (!model || model === 'fallback') {
    return undefined
  }
  if (inputTokens <= 0 && outputTokens <= 0) {
    return undefined
  }

  const multiplier = getCostMultiplier()
  const priced = calculateCost(model, inputTokens, outputTokens, false, multiplier, multiplier)

  return {
    cost: {
      input: priced.input,
      output: priced.output,
      total: priced.total,
    },
    model,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
  }
}

/**
 * Sums per-model usage into overall tool pricing, keeping `llmUsage` for breakdown.
 */
export function buildToolLlmCostFromModelUsage(
  llmUsage: ModelUsageByModel | undefined
): (ToolLlmCostFields & { llmUsage: ModelUsageByModel }) | undefined {
  if (!llmUsage || Object.keys(llmUsage).length === 0) {
    return undefined
  }

  let inputTokens = 0
  let outputTokens = 0
  let inputCost = 0
  let outputCost = 0
  const models: string[] = []

  for (const [model, usage] of Object.entries(llmUsage)) {
    const fields = buildToolLlmCostFields(model, usage.inputTokens, usage.outputTokens)
    if (!fields) {
      continue
    }
    models.push(model)
    inputTokens += fields.tokens.input
    outputTokens += fields.tokens.output
    inputCost += fields.cost.input
    outputCost += fields.cost.output
  }

  if (models.length === 0) {
    return undefined
  }

  return {
    cost: {
      input: Number.parseFloat(inputCost.toFixed(8)),
      output: Number.parseFloat(outputCost.toFixed(8)),
      total: Number.parseFloat((inputCost + outputCost).toFixed(8)),
    },
    model: models.length === 1 ? models[0]! : models.join(','),
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    llmUsage,
  }
}

/**
 * Lifts cost / tokens / model from an `executeProviderRequest` response.
 * Cost is already multiplier-aware when returned by the provider layer.
 */
export function extractProviderToolCostFields(
  aiResponse: unknown
): Partial<ToolLlmCostFields> | undefined {
  if (!aiResponse || typeof aiResponse !== 'object' || Array.isArray(aiResponse)) {
    return undefined
  }

  const response = aiResponse as ProviderResponse
  const fields: Partial<ToolLlmCostFields> = {}

  if (typeof response.model === 'string' && response.model.length > 0) {
    fields.model = response.model
  }

  if (response.tokens && typeof response.tokens === 'object') {
    const input = typeof response.tokens.input === 'number' ? response.tokens.input : 0
    const output = typeof response.tokens.output === 'number' ? response.tokens.output : 0
    const total =
      typeof response.tokens.total === 'number' ? response.tokens.total : input + output
    fields.tokens = { input, output, total }
  }

  if (response.cost && typeof response.cost === 'object' && typeof response.cost.total === 'number') {
    fields.cost = {
      input: typeof response.cost.input === 'number' ? response.cost.input : 0,
      output: typeof response.cost.output === 'number' ? response.cost.output : 0,
      total: response.cost.total,
    }
  }

  if (!fields.cost && !fields.tokens && !fields.model) {
    return undefined
  }

  return fields
}
