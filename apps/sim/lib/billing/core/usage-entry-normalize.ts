import {
  getEmbeddingModelPricing,
  getModelPricing,
  getProviderFromModel,
  getRerankModelPricing,
  PROVIDER_DEFINITIONS,
  resolveCanonicalModelId,
} from '@/providers/models'
import { normalizeToolId } from '@/tools/normalize'
import type { UsageEntry, UsagePricingSnapshot } from '@/lib/billing/core/usage-log'

function readUsageLogCostMultiplier(): number {
  const raw = process.env.USAGE_LOG_COST_MULTIPLIER ?? process.env.COST_MULTIPLIER ?? undefined
  if (raw === undefined || raw === null || raw === '') return 1
  const parsed = Number.parseFloat(String(raw).trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

/** Canonical model ID for usage_log grouping (stops byModel fragmentation). */
export function normalizeUsageModelId(modelId: string): string {
  return resolveCanonicalModelId(modelId)
}

/** Stable registry tool id for usage_log grouping (strips resource suffixes). */
export function normalizeUsageToolId(toolId: string): string {
  return normalizeToolId(toolId)
}

/**
 * Builds a pricing snapshot for a model row, capturing rates and the multiplier
 * at write time so later env changes cannot retroactively reprice the row.
 */
export function buildModelPricingSnapshot(
  modelId: string,
  multiplier?: number
): UsagePricingSnapshot {
  const model = normalizeUsageModelId(modelId)
  const effectiveMultiplier = multiplier ?? readUsageLogCostMultiplier()
  const providerId = getProviderFromModel(model)
  const vendor = PROVIDER_DEFINITIONS[providerId]?.name
  const pricing = getModelPricing(model) ?? getEmbeddingModelPricing(model)
  const rerankPricing = getRerankModelPricing(model)

  if (rerankPricing) {
    return {
      model,
      vendor: vendor ?? 'Cohere',
      multiplier: effectiveMultiplier,
      flatRate: rerankPricing.perSearchUnit,
      pricingSource: 'models-ts',
      capturedAt: new Date().toISOString(),
    }
  }

  return {
    model,
    vendor,
    multiplier: effectiveMultiplier,
    ...(pricing
      ? {
          inputRatePerMillion: pricing.input,
          outputRatePerMillion: pricing.output,
          ...(pricing.cachedInput != null
            ? { cachedInputRatePerMillion: pricing.cachedInput }
            : {}),
          pricingSource: 'models-ts' as const,
        }
      : { pricingSource: 'models-ts' as const }),
    capturedAt: new Date().toISOString(),
  }
}

/** Captures hosted-tool identity at write time for tool-category ledger rows. */
export function buildToolPricingSnapshot(
  toolId: string,
  multiplier?: number
): UsagePricingSnapshot {
  const tool = normalizeUsageToolId(toolId)
  return {
    tool,
    multiplier: multiplier ?? readUsageLogCostMultiplier(),
    pricingSource: 'hosted-key',
    capturedAt: new Date().toISOString(),
  }
}

/** External vendor spend is COGS passthrough — multiplier is always 1. */
export function buildExternalPricingSnapshot(vendor?: string): UsagePricingSnapshot {
  return {
    vendor,
    multiplier: 1,
    pricingSource: 'vendor-pricing',
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Normalizes model/tool identifiers and ensures model rows carry a pricing snapshot.
 * Applied centrally at write time in {@link recordUsage}.
 */
export function normalizeUsageEntry(entry: UsageEntry): UsageEntry {
  let normalized = entry

  if (entry.category === 'model') {
    const canonicalModel = normalizeUsageModelId(entry.description)
    const multiplier = entry.pricingSnapshot?.multiplier ?? readUsageLogCostMultiplier()
    const pricingSnapshot =
      entry.pricingSnapshot ?? buildModelPricingSnapshot(canonicalModel, multiplier)
    normalized = {
      ...entry,
      description: canonicalModel,
      pricingSnapshot: {
        ...pricingSnapshot,
        model: canonicalModel,
        multiplier: pricingSnapshot.multiplier ?? multiplier,
      },
      ...(entry.provider ? {} : { provider: getProviderFromModel(canonicalModel) }),
    }
  }

  if (entry.category === 'tool') {
    const canonicalTool = normalizeUsageToolId(entry.toolId ?? entry.description)
    const multiplier = entry.pricingSnapshot?.multiplier ?? readUsageLogCostMultiplier()
    normalized = {
      ...normalized,
      description: canonicalTool,
      toolId: canonicalTool,
      pricingSnapshot:
        entry.pricingSnapshot ?? buildToolPricingSnapshot(canonicalTool, multiplier),
    }
  }

  if (entry.category === 'external') {
    normalized = {
      ...normalized,
      pricingSnapshot: entry.pricingSnapshot ?? buildExternalPricingSnapshot(entry.vendor),
    }
  }

  return normalized
}
