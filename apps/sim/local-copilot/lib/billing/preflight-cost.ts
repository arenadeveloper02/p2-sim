/**
 * Static preflight cost estimates for Local Copilot confirmation UI.
 */

export interface LocalPreflightCostEstimate {
  estimatedCostUsd: number
  estimatedCostLabel: string
}

const COSTLY_TOOL_ESTIMATES: Record<string, LocalPreflightCostEstimate> = {
  generate_image: { estimatedCostUsd: 0.04, estimatedCostLabel: '~$0.04 per image' },
  generate_audio: { estimatedCostUsd: 0.02, estimatedCostLabel: '~$0.02 per audio clip' },
  generate_video: { estimatedCostUsd: 0.2, estimatedCostLabel: '~$0.20 per video' },
}

const SPECIALIST_ROUND_ESTIMATE_USD = 0.03

/**
 * Estimates cost for a single Local tool confirmation.
 */
export function estimateLocalToolCost(
  toolName: string,
  _args: Record<string, unknown> = {}
): LocalPreflightCostEstimate | null {
  return COSTLY_TOOL_ESTIMATES[toolName] ?? null
}

/**
 * Estimates cost for a multi-specialist batch (parent specialist tools).
 */
export function estimateMultiSpecialistCost(specialistCallCount: number): LocalPreflightCostEstimate | null {
  if (specialistCallCount < 2) return null
  const estimatedCostUsd = Number((specialistCallCount * SPECIALIST_ROUND_ESTIMATE_USD).toFixed(2))
  return {
    estimatedCostUsd,
    estimatedCostLabel: `~$${estimatedCostUsd.toFixed(2)} for ${specialistCallCount} specialists`,
  }
}
