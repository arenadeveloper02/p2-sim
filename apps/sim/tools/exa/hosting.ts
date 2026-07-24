import type { ToolHostingConfig } from '@/tools/types'

/**
 * Env var prefix for Exa hosted keys. Provide keys as
 * `EXA_API_KEY_COUNT` plus `EXA_API_KEY_1..N`.
 */
export const EXA_API_KEY_PREFIX = 'EXA_API_KEY'

/**
 * Fallback when Exa does not return `costDollars`.
 * Search is $7 / 1k requests ($0.007) — https://exa.ai/pricing
 */
export const EXA_FALLBACK_COST_USD = 0.007

/**
 * Reads API-reported dollar cost from Exa tool output.
 * Prefers `__costDollars` (number or `{ total }`), then `costDollars`.
 */
export function readExaCostDollars(output: Record<string, unknown>): number | null {
  const candidates = [output.__costDollars, output.costDollars]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const total = (value as { total?: unknown }).total
      if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
        return total
      }
    }
  }
  return null
}

/**
 * Shared Exa hosted-key config for all Exa tools.
 *
 * Pricing: prefer API-reported `costDollars` / `__costDollars` from the Exa
 * response. Fallback $0.007 per request (Search $7/1k — https://exa.ai/pricing)
 * when the API omits cost.
 */
export const exaHosting: ToolHostingConfig = {
  envKeyPrefix: EXA_API_KEY_PREFIX,
  apiKeyParam: 'apiKey',
  byokProviderId: 'exa',
  pricing: {
    type: 'custom',
    getCost: (_params, output) => {
      // Prefer API-reported cost (https://exa.ai/pricing — costDollars on responses).
      // Fallback $0.007 = Search $7/1k when costDollars is missing.
      const reported = readExaCostDollars(output)
      const cost = reported ?? EXA_FALLBACK_COST_USD
      return {
        cost,
        metadata: {
          source: reported != null ? 'costDollars' : 'fallback_search_rate',
          costDollars: cost,
        },
      }
    },
  },
  rateLimit: {
    mode: 'per_request',
    requestsPerMinute: 60,
  },
}
