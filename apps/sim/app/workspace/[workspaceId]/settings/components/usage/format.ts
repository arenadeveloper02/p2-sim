import type {
  UsageActorTypeValue,
  UsageChargeTypeValue,
  UsageLogSourceValue,
  WorkspaceUsageAnalytics,
} from '@/lib/api/contracts/workspace-usage'
import { formatCreditCost } from '@/lib/billing/credits/conversion'
import {
  formatEmbeddedToolLabel,
  isImageGenerationBillingKey,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'
import type { UsagePeriod } from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'

/**
 * Multi-segment registry prefixes that must not roll up on the first `_` alone
 * (e.g. `browser_use_run_task` → `browser_use`, not `browser`).
 */
const MULTI_SEGMENT_TOOL_FAMILIES = [
  'azure_devops',
  'browser_use',
  'context_dev',
  'google_books',
  'google_maps',
  'google_pagespeed',
  'google_translate',
  'openai_image',
] as const

/**
 * Synthetic By Tools bucket for mothership / Copilot ledger tool rows.
 * Must stay in sync with {@link byToolBucketIdExpr} in ledger-helpers.
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
  if (toolId === COPILOT_USAGE_TOOL_BUCKET_ID) return 'Copilot'
  return formatEmbeddedToolLabel(toolId)
}

/** True when `toolId` is already a registry-style snake_case operation id. */
function isRegistryStyleToolId(toolId: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(toolId)
}

/**
 * Rolls operation-level tool ids up to a service family for Usage ranking tables.
 * Registry ids (`exa_search` / `exa_answer`) and Exa-prefixed display names
 * ("Exa Search", "EXA Competitor Research") → `exa`.
 * Other legacy canvas titles keep their full name so "Competitor Research"
 * stays intact instead of truncating to "Competitor".
 */
export function resolveUsageToolFamilyId(toolId: string): string {
  const trimmed = toolId.trim()
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return toolId
  if (normalized === COPILOT_USAGE_TOOL_BUCKET_ID) return COPILOT_USAGE_TOOL_BUCKET_ID
  if (normalized === UNATTRIBUTED_AGENT_TOOLS_ID) return UNATTRIBUTED_AGENT_TOOLS_ID
  if (isImageGenerationBillingKey(normalized)) return normalized

  for (const family of MULTI_SEGMENT_TOOL_FAMILIES) {
    if (normalized === family || normalized.startsWith(`${family}_`)) return family
  }

  // Display / legacy canvas titles: only collapse when they clearly name a known
  // family (e.g. "Exa Search"). Otherwise keep the full slug as the bucket id.
  if (!isRegistryStyleToolId(trimmed)) {
    if (normalized === 'exa' || normalized.startsWith('exa_')) return 'exa'
    return normalized
  }

  const separator = normalized.indexOf('_')
  return separator === -1 ? normalized : normalized.slice(0, separator)
}

/** Display label for a service-family tool bucket (`exa` → `Exa`). */
export function formatUsageToolFamilyLabel(familyId: string): string {
  if (familyId === COPILOT_USAGE_TOOL_BUCKET_ID) return 'Copilot'
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

/**
 * Aggregates By Tools rows by service family so the dashboard shows Exa once,
 * not Exa Search / Exa Answer separately.
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

  return [...merged.values()].sort((a, b) => b.billableCost - a.billableCost)
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
