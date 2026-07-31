import type { ToolHostingConfig } from '@/tools/types'

/**
 * Env var prefix for Browser Use hosted keys. Provide keys as
 * `BROWSER_USE_API_KEY_COUNT` plus `BROWSER_USE_API_KEY_1..N`.
 */
export const BROWSER_USE_API_KEY_PREFIX = 'BROWSER_USE_API_KEY'

/** Task initialization fee — https://browser-use.com/pricing (V2 flat pricing). */
export const BROWSER_USE_TASK_INIT_USD = 0.01

/**
 * Default per-step rate for Browser Use 2.0 — https://browser-use.com/pricing
 * (V2 flat pricing; actual step rates vary by model).
 */
export const BROWSER_USE_STEP_USD = 0.006

/**
 * Reads API-reported total cost from Browser Use tool output.
 */
export function readBrowserUseTotalCostUsd(output: Record<string, unknown>): number | null {
  const candidates = [output.__totalCostUsd, output.totalCostUsd, output.cost]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value
    }
  }
  return null
}

/**
 * Shared Browser Use hosted-key config.
 *
 * Prefers API-reported `__totalCostUsd` / `totalCostUsd` / `cost`. Otherwise
 * PLACEHOLDER: $0.01 task init + $0.006 × (steps || 1) from Browser Use V2
 * flat pricing (https://browser-use.com/pricing).
 */
export const browserUseHosting: ToolHostingConfig = {
  envKeyPrefix: BROWSER_USE_API_KEY_PREFIX,
  apiKeyParam: 'apiKey',
  byokProviderId: 'browser_use',
  pricing: {
    type: 'custom',
    getCost: (_params, output) => {
      const reported = readBrowserUseTotalCostUsd(output)
      if (reported != null) {
        return {
          cost: reported,
          metadata: { source: 'api_total_cost_usd', totalCostUsd: reported },
        }
      }

      // PLACEHOLDER — Browser Use V2 flat pricing:
      // $0.01 task init + $0.006/step (Browser Use 2.0 default)
      // https://browser-use.com/pricing
      const steps = Array.isArray(output.steps) ? output.steps.length : 0
      const stepCount = steps > 0 ? steps : 1
      const cost = BROWSER_USE_TASK_INIT_USD + BROWSER_USE_STEP_USD * stepCount
      return {
        cost,
        metadata: {
          source: 'placeholder_v2_flat',
          taskInitUsd: BROWSER_USE_TASK_INIT_USD,
          stepUsd: BROWSER_USE_STEP_USD,
          steps: stepCount,
        },
      }
    },
  },
  rateLimit: {
    mode: 'per_request',
    requestsPerMinute: 20,
  },
}
