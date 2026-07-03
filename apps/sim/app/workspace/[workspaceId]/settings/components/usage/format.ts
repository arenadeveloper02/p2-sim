import { formatCredits } from '@/lib/billing/credits/conversion'
import type { UsageLogSourceValue } from '@/lib/api/contracts/workspace-usage'
import type { UsagePeriod } from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'

/** Human-readable labels for usage_log source values. */
export const SOURCE_LABELS: Record<UsageLogSourceValue, string> = {
  workflow: 'Workflow',
  wand: 'Wand',
  copilot: 'Copilot',
  'workspace-chat': 'Workspace chat',
  mcp_copilot: 'MCP copilot',
  mothership_block: 'Mothership block',
  'knowledge-base': 'Knowledge base',
  'voice-input': 'Voice input',
  enrichment: 'Enrichment',
}

/** Comma-separated sources passed to the analytics API for the mothership tab. */
export const MOTHERSHIP_USAGE_SOURCES =
  'workspace-chat,mothership_block,copilot,mcp_copilot' as const

/**
 * Format a dollar amount for dashboard display.
 * Small non-zero values keep extra precision; larger values use currency formatting.
 */
export function formatDollarAmount(dollars: number): string {
  if (dollars === 0) return '$0.00'
  if (Math.abs(dollars) < 0.01) return `$${dollars.toFixed(4)}`
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** Format billable cost as dollars with credits in parentheses. */
export function formatBillableWithCredits(dollars: number): string {
  const credits = formatCredits(dollars)
  return `${formatDollarAmount(dollars)} (${credits} credits)`
}

/** Format a usage_log source key for display. */
export function formatSourceLabel(source: string): string {
  return SOURCE_LABELS[source as UsageLogSourceValue] ?? source
}

/** Format a period preset for the period selector. */
export function formatPeriodLabel(period: UsagePeriod): string {
  switch (period) {
    case '1d':
      return 'Past 24 hours'
    case '7d':
      return 'Past 7 days'
    case '30d':
      return 'Past 30 days'
    case '90d':
      return 'Past 90 days'
    default:
      return period
  }
}
