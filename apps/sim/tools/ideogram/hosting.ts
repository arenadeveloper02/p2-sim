import { calculateIdeogramHostedCost } from '@/lib/image-generation/ideogram-pricing'
import type { IdeogramOperation } from '@/tools/ideogram/constants'
import type { ToolHostingConfig } from '@/tools/types'

/** Env var prefix for Ideogram hosted keys (`IDEOGRAM_API_KEY` or `IDEOGRAM_API_KEY_COUNT` + `_1..N`). */
export const IDEOGRAM_API_KEY_PREFIX = 'IDEOGRAM_API_KEY'

/**
 * Shared Ideogram hosted-key config for a specific operation.
 *
 * Pricing: per-image list rates from https://ideogram.ai/features/api-pricing,
 * multiplied by the platform cost multiplier. Cost varies by operation and
 * `renderingSpeed` (FLASH/TURBO/DEFAULT/QUALITY) for generate/remix/edit/reframe.
 */
export function createIdeogramHosting(operation: IdeogramOperation): ToolHostingConfig {
  return {
    envKeyPrefix: IDEOGRAM_API_KEY_PREFIX,
    apiKeyParam: 'apiKey',
    byokProviderId: 'ideogram',
    pricing: {
      type: 'custom',
      getCost: (params, output) => calculateIdeogramHostedCost(operation, params, output),
    },
    rateLimit: {
      mode: 'per_request',
      // Ideogram default is 10 in-flight across shared keys — keep per-workspace RPM conservative.
      requestsPerMinute: 20,
    },
  }
}
