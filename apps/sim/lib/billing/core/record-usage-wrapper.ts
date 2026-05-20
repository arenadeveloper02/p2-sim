import { env } from '@/lib/core/config/env'
import {
  recordUsage as recordUsageBase,
  type RecordUsageParams,
} from '@/lib/billing/core/usage-log'

export type {
  RecordUsageParams,
  UsageEntry,
  UsageLogCategory,
  UsageLogSource,
} from '@/lib/billing/core/usage-log'

/**
 * Multiplier for usage_log / user_stats writes (USAGE_LOG_COST_MULTIPLIER).
 * Kept separate from COST_MULTIPLIER so existing provider/wand paths are unchanged.
 */
function getUsageLogCostMultiplier(): number {
  const multiplier = env.USAGE_LOG_COST_MULTIPLIER ?? 1
  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
    return 1
  }
  return multiplier
}

/** Scale a dollar amount before persisting to usage_log / user_stats. */
export function scaleUsageLogCost(cost: number): number {
  if (cost <= 0) {
    return cost
  }
  return cost * getUsageLogCostMultiplier()
}

function withScaledUsageCosts(params: RecordUsageParams): RecordUsageParams {
  if (getUsageLogCostMultiplier() === 1) {
    return params
  }

  return {
    ...params,
    entries: params.entries.map((entry) => ({
      ...entry,
      cost: scaleUsageLogCost(entry.cost),
    })),
  }
}

/**
 * Wraps recordUsage from usage-log.ts; applies USAGE_LOG_COST_MULTIPLIER to entry costs.
 * Call sites that already apply COST_MULTIPLIER should keep using usage-log directly.
 */
export async function recordUsage(params: RecordUsageParams): Promise<void> {
  return recordUsageBase(withScaledUsageCosts(params))
}
