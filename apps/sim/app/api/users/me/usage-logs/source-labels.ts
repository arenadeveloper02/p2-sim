import {
  BILLING_USAGE_LOG_SOURCE_LABELS,
  type InternalUsageLogSource,
  toBillingUsageLogSource,
} from '@/lib/billing/usage-sources'

const ARENA_AI_SOURCE_LABEL = 'Arena AI'

function isLocalMothershipUsageMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  return (metadata as { backend?: unknown }).backend === 'local'
}

/**
 * Display label for a usage-log row. Local mothership shares ledger source
 * `copilot` with workspace Copilot — distinguish via metadata.backend.
 */
export function resolveUsageLogSourceLabel(source: string, metadata?: unknown): string {
  if (source === 'copilot' && isLocalMothershipUsageMetadata(metadata)) {
    return ARENA_AI_SOURCE_LABEL
  }

  try {
    return BILLING_USAGE_LOG_SOURCE_LABELS[
      toBillingUsageLogSource(source as InternalUsageLogSource)
    ]
  } catch {
    return source
  }
}
