import type { UsageLogSource } from '@/lib/api/contracts/user'

/**
 * Humanized labels for `usage_log.source`, shared by the Credit usage page's
 * row rendering and the CSV export so both read identically.
 * Local mothership rows also use source `copilot` — callers must pass metadata
 * through {@link resolveUsageLogSourceLabel} to show "Arena AI".
 */
export const USAGE_LOG_SOURCE_LABELS: Record<UsageLogSource, string> = {
  workflow: 'Workflow',
  wand: 'Wand',
  copilot: 'Copilot',
  'workspace-chat': 'Mothership',
  mcp_copilot: 'MCP copilot',
  mothership_block: 'Mothership block',
  'knowledge-base': 'Knowledge Base',
  'voice-input': 'Voice input',
  enrichment: 'Enrichment',
}

/** Local mothership ledger rows stamp metadata.backend = local. */
export function resolveUsageLogSourceLabel(
  source: UsageLogSource,
  metadata?: unknown
): string {
  if (
    source === 'copilot' &&
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    (metadata as { backend?: unknown }).backend === 'local'
  ) {
    return 'Arena AI'
  }
  return USAGE_LOG_SOURCE_LABELS[source]
}
