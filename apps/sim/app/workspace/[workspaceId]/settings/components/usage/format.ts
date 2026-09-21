import type {
  UsageActorTypeValue,
  UsageChargeTypeValue,
  UsageLogSourceValue,
  WorkspaceUsageAnalytics,
} from '@/lib/api/contracts/workspace-usage'
import { dollarsToCredits, formatCreditCost } from '@/lib/billing/credits/conversion'
import {
  formatEmbeddedToolLabel,
  isImageGenerationBillingKey,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'
import type { UsagePeriod } from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'
import { normalizeUsageToolBucketId } from '@/tools/normalize'
import { getToolIds } from '@/tools/tool-ids'

/**
 * Synthetic By Tools bucket for mothership / Copilot ledger tool rows.
 * Must stay in sync with {@link byToolBucketIdExpr} in ledger-helpers.
 * Displayed as "Copilot tools" (tool spend only; models are a separate block).
 */
export const COPILOT_USAGE_TOOL_BUCKET_ID = 'copilot' as const

/** Human-readable labels for usage_log source values. */
export const SOURCE_LABELS: Record<UsageLogSourceValue, string> = {
  workflow: 'Workflow',
  wand: 'Wand',
  /** Workspace panel Copilot chat (not Local mothership). */
  copilot: 'Copilot',
  /** Cloud / Sim mothership home chat (Go-priced). */
  'workspace-chat': 'Mothership',
  mcp_copilot: 'MCP copilot',
  /** Cloud mothership block in a workflow (Go-priced). */
  mothership_block: 'Mothership block',
  'knowledge-base': 'Knowledge base',
  'voice-input': 'Voice input',
  enrichment: 'Enrichment',
}

/** Display name for Local mothership (ledger source `copilot` + metadata.backend=local). */
export const ARENA_AI_SOURCE_LABEL = 'Arena AI'

/** True when a usage_log row is Local mothership (Arena AI), not workspace Copilot. */
export function isLocalMothershipUsageMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  return (metadata as { backend?: unknown }).backend === 'local'
}

/**
 * Resolves the Usage UI source label.
 * Local mothership shares ledger source `copilot` with workspace Copilot — distinguish via
 * metadata.backend or an analytics-provided label override.
 */
export function resolveUsageSourceLabel(params: {
  source: string
  label?: string | null
  metadata?: unknown
}): string {
  if (params.label?.trim()) return params.label.trim()
  if (params.source === 'copilot' && isLocalMothershipUsageMetadata(params.metadata)) {
    return ARENA_AI_SOURCE_LABEL
  }
  return formatSourceLabel(params.source)
}

/** Human-readable labels for high-level charge-type buckets. */
export const CHARGE_TYPE_LABELS: Record<UsageChargeTypeValue, string> = {
  base_run: 'Base run fee',
  provider: 'Provider / model',
  tool: 'Hosted tools',
  cost_block: 'Cost blocks',
  mothership: 'Mothership pricing',
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

/** Format billable dollar cost as credits for the usage dashboard. */
export function formatBillableWithCredits(dollars: number): string {
  return formatCreditCost(dollars, { emptyForZeroOrLess: false }) ?? '—'
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
  if (toolId === COPILOT_USAGE_TOOL_BUCKET_ID) return 'Copilot tools'
  return formatEmbeddedToolLabel(toolId)
}

/**
 * Service-family prefixes derived from registered tool ids (cached).
 * Shared by 2+ tools — longest match wins (`google_ads` over `google`, `exa` for
 * `exa_search` / glued names like `exacomposesearch`).
 */
let usageToolServiceFamilies: string[] | null = null

function getUsageToolServiceFamilies(): string[] {
  if (usageToolServiceFamilies) return usageToolServiceFamilies

  const prefixCounts = new Map<string, number>()
  for (const id of getToolIds()) {
    const parts = id.split('_').filter(Boolean)
    if (parts.length < 2) continue
    for (let length = 1; length < parts.length; length++) {
      const prefix = parts.slice(0, length).join('_')
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1)
    }
  }

  usageToolServiceFamilies = [...prefixCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([prefix]) => prefix)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))

  return usageToolServiceFamilies
}

/**
 * Normalizes a By Tools bucket id: strip resource ids / mid-id API versions, then
 * roll up to the longest registered service family (`exa_search` / `exaindnewssearch` → `exa`).
 */
export function resolveUsageToolFamilyId(toolId: string): string {
  const normalized = normalizeUsageToolBucketId(toolId)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!normalized) return toolId
  if (normalized === COPILOT_USAGE_TOOL_BUCKET_ID) return COPILOT_USAGE_TOOL_BUCKET_ID
  if (normalized === UNATTRIBUTED_AGENT_TOOLS_ID) return UNATTRIBUTED_AGENT_TOOLS_ID
  if (isImageGenerationBillingKey(normalized)) return normalized

  for (const family of getUsageToolServiceFamilies()) {
    if (normalized === family || normalized.startsWith(`${family}_`)) return family
  }

  // Display / agent names with spaces stripped (`ExaComposeSearch` → `exacomposesearch`).
  if (!normalized.includes('_')) {
    for (const family of getUsageToolServiceFamilies()) {
      if (family.length < 3) continue
      if (normalized.length > family.length && normalized.startsWith(family)) return family
    }
  }

  return normalized
}

/** Display label for a tool bucket (`google_ads` → `Google Ads`). */
export function formatUsageToolFamilyLabel(familyId: string): string {
  if (familyId === COPILOT_USAGE_TOOL_BUCKET_ID) return 'Copilot tools'
  if (familyId === UNATTRIBUTED_AGENT_TOOLS_ID) return formatEmbeddedToolLabel(familyId)
  if (isImageGenerationBillingKey(familyId)) return formatEmbeddedToolLabel(familyId)
  return familyId.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

interface UsageToolBucketRow {
  toolId: string
  billableCost: number
  count: number
  rawCost?: number
}

/** True when Usage tables would show at least 1 credit for this amount. */
export function hasBillableCredits(billableCost: number): boolean {
  return dollarsToCredits(billableCost) > 0
}

/**
 * Aggregates By Tools rows after {@link resolveUsageToolFamilyId} normalization.
 * Drops Copilot tools and buckets that display as 0 credits.
 */
export function aggregateUsageToolsByFamily<T extends UsageToolBucketRow>(rows: T[]): T[] {
  const merged = new Map<string, T>()

  for (const row of rows) {
    const familyId = resolveUsageToolFamilyId(row.toolId)
    const existing = merged.get(familyId)
    if (existing) {
      existing.billableCost += row.billableCost
      existing.count += row.count
      if (typeof existing.rawCost === 'number' || typeof row.rawCost === 'number') {
        existing.rawCost = (existing.rawCost ?? 0) + (row.rawCost ?? 0)
      }
    } else {
      merged.set(familyId, {
        ...row,
        toolId: familyId,
        billableCost: row.billableCost,
        count: row.count,
        ...(typeof row.rawCost === 'number' ? { rawCost: row.rawCost } : {}),
      })
    }
  }

  return [...merged.values()]
    .filter((row) => hasBillableCredits(row.billableCost) && row.toolId !== COPILOT_USAGE_TOOL_BUCKET_ID)
    .sort((a, b) => b.billableCost - a.billableCost)
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

/** Shorter period chip labels for the admin Usage screenshot layout. */
export function formatAdminPeriodChipLabel(period: UsagePeriod): string {
  switch (period) {
    case '1d':
      return '24 hours'
    case '7d':
      return '7 days'
    case '30d':
      return '30 days'
    case '90d':
      return '90 days'
    default:
      return period
  }
}
