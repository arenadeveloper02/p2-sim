import type { IdeogramPostProcessorOperation } from '@/lib/image-generation/ideogram-post-processor-fields'

/**
 * Hosted Ideogram post-process COGS (USD) before USAGE_LOG_COST_MULTIPLIER.
 * BYOK calls should pass cost 0 — the customer supplies their own key.
 */
export const IDEOGRAM_POST_PROCESS_RAW_COST_USD: Record<IdeogramPostProcessorOperation, number> = {
  describe_v4: 0.02,
  layerize_text: 0.06,
  reframe_v3: 0.06,
  remove_background: 0.04,
  upscale: 0.08,
} as const

/**
 * Returns the raw (pre-multiplier) hosted cost for a post-process operation.
 */
export function getIdeogramPostProcessRawCost(
  operation: IdeogramPostProcessorOperation,
  options?: { byok?: boolean }
): number {
  if (options?.byok) return 0
  return IDEOGRAM_POST_PROCESS_RAW_COST_USD[operation] ?? 0
}
