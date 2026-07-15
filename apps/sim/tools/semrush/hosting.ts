import type { ToolHostingConfig } from '@/tools/types'

/**
 * Env var prefix for Semrush hosted keys. Provide keys as
 * `SEMRUSH_API_KEY_COUNT` plus `SEMRUSH_API_KEY_1..N`.
 */
export const SEMRUSH_API_KEY_PREFIX = 'SEMRUSH_API_KEY'

/**
 * Shared Semrush hosted-key config.
 *
 * PLACEHOLDER — update when unit rate confirmed. Semrush Analytics / Projects
 * API units vary by report type and are not consistently exposed in responses.
 */
export const semrushHosting: ToolHostingConfig = {
  envKeyPrefix: SEMRUSH_API_KEY_PREFIX,
  apiKeyParam: 'apiKey',
  byokProviderId: 'semrush',
  pricing: {
    type: 'custom',
    getCost: () => {
      // PLACEHOLDER — update when unit rate confirmed
      return { cost: 0.01, metadata: { source: 'placeholder_per_request' } }
    },
  },
  rateLimit: {
    mode: 'per_request',
    requestsPerMinute: 60,
  },
}
