import { formatCredits } from '@/lib/billing/credits/conversion'
import { formatEmbeddedToolLabel } from '@/lib/logs/embedded-tool-costs'
import type {
  UsageActorTypeValue,
  UsageChargeTypeValue,
  UsageLogSourceValue,
  WorkspaceUsageAnalytics,
} from '@/lib/api/contracts/workspace-usage'
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

/** Human-readable labels for high-level charge-type buckets. */
export const CHARGE_TYPE_LABELS: Record<UsageChargeTypeValue, string> = {
  base_run: 'Base run fee',
  provider: 'Provider / model',
  tool: 'Hosted tools',
  cost_block: 'Cost blocks',
  other: 'Other',
}

/** Human-readable labels for usage_log actor_type values. */
export const ACTOR_TYPE_LABELS: Record<UsageActorTypeValue, string> = {
  user: 'User',
  api_key: 'API key',
  webhook: 'Webhook',
  schedule: 'Schedule',
}

/** Comma-separated sources passed to the analytics API for the mothership tab. */
export const MOTHERSHIP_USAGE_SOURCES =
  'workspace-chat,mothership_block,copilot,mcp_copilot' as const

type UsageMetrics = WorkspaceUsageAnalytics['summary']['usage']

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

/** Format a charge-type bucket for display. */
export function formatChargeTypeLabel(chargeType: UsageChargeTypeValue): string {
  return CHARGE_TYPE_LABELS[chargeType] ?? chargeType
}

/** Format a tool id for dashboard display (includes virtual embedded-tool ids). */
export function formatToolLabel(toolId: string): string {
  return formatEmbeddedToolLabel(toolId)
}

/** Format actor_type for display. */
export function formatActorType(actorType: UsageActorTypeValue | null): string {
  if (!actorType) return 'Unknown'
  return ACTOR_TYPE_LABELS[actorType] ?? actorType
}

/** Compact token count for tables and summary cards. */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toLocaleString()
}

/** Format usage metrics as a single summary line. */
export function formatUsageMetricsSummary(usage: UsageMetrics): string {
  const parts: string[] = []
  if (usage.totalTokens > 0) {
    parts.push(`${formatTokenCount(usage.totalTokens)} tokens`)
  }
  if (usage.invocationCount > 0) {
    parts.push(`${usage.invocationCount.toLocaleString()} invocations`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No usage volume recorded'
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
