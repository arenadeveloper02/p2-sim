import type { ModelUsageMetadata } from '@/lib/billing/core/usage-log'
import {
  mergeEmbeddedToolCosts,
  mergeEmbeddedToolIds,
  resolveEmbeddedToolsForModel,
} from '@/lib/logs/embedded-tool-costs'

interface ModelMetadataRow {
  executionId: string | null
  description: string
  provider: string | null
  cost: string
  rawCost: string | null
  metadata: unknown
}

interface EmbeddedCostBucket {
  billable: number
  raw: number
}

interface EmbeddedToolCostBucket extends EmbeddedCostBucket {
  /** Distinct execution×model attributions that contributed this tool spend. */
  count: number
}

function parseLedgerAmount(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeEmbeddedCostMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries: Array<[string, number]> = []
  for (const [toolId, cost] of Object.entries(value as Record<string, unknown>)) {
    const amount = coerceFiniteNumber(cost)
    if (!toolId || amount == null || amount <= 0) continue
    entries.push([toolId, amount])
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function normalizeEmbeddedIdMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries: Array<[string, string]> = []
  for (const [costKey, bucketId] of Object.entries(value as Record<string, unknown>)) {
    if (!costKey || typeof bucketId !== 'string') continue
    const trimmed = bucketId.trim()
    if (!trimmed) continue
    entries.push([costKey, trimmed])
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/**
 * Reads model ledger metadata for embedded-tool splits.
 * Tolerates stringified JSON and corrupted keys that stringified the whole
 * metadata blob (seen in some historical rows).
 */
export function parseModelUsageMetadata(raw: unknown): ModelUsageMetadata {
  let obj: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>
      }
    } catch {
      return { inputTokens: 0, outputTokens: 0 }
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>
  } else {
    return { inputTokens: 0, outputTokens: 0 }
  }

  const toolCost = coerceFiniteNumber(obj.toolCost)
  let embeddedToolCosts = normalizeEmbeddedCostMap(obj.embeddedToolCosts)
  const embeddedToolIds = normalizeEmbeddedIdMap(obj.embeddedToolIds)

  if (!embeddedToolCosts) {
    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'toolCost' ||
        key === 'inputTokens' ||
        key === 'outputTokens' ||
        key === 'embeddedToolCosts' ||
        key === 'embeddedToolIds'
      ) {
        continue
      }
      // Corrupted writes used the stringified metadata object as a map key.
      if (!(key.includes('embeddedToolCosts') || key.startsWith('{'))) continue
      const recovered = normalizeEmbeddedCostMap(value)
      if (recovered) {
        embeddedToolCosts = recovered
        break
      }
    }
  }

  return {
    inputTokens: coerceFiniteNumber(obj.inputTokens) ?? 0,
    outputTokens: coerceFiniteNumber(obj.outputTokens) ?? 0,
    ...(toolCost != null && toolCost > 0 ? { toolCost } : {}),
    ...(embeddedToolCosts ? { embeddedToolCosts } : {}),
    ...(embeddedToolIds ? { embeddedToolIds } : {}),
  }
}

export interface EmbeddedToolVirtualSplit {
  byModelEmbedded: Map<string, EmbeddedCostBucket>
  byProviderEmbedded: Map<string, EmbeddedCostBucket>
  byToolEmbedded: Map<string, EmbeddedToolCostBucket>
  totalEmbeddedBillable: number
  totalEmbeddedRaw: number
}

/**
 * Derives virtual embedded-tool splits from model `usage_log.metadata`
 * (`toolCost` / `embeddedToolCosts`) without changing authoritative ledger totals.
 * Powers Usage dashboard By Tools for Agent-embedded hosted tools.
 */
export function computeEmbeddedToolVirtualSplit(
  rows: ModelMetadataRow[]
): EmbeddedToolVirtualSplit {
  const executionModelState = new Map<
    string,
    {
      toolCost: number
      embeddedToolCosts: Record<string, number>
      embeddedToolIds?: Record<string, string>
      billable: number
      raw: number
      provider: string | null
      model: string
    }
  >()

  for (const row of rows) {
    if (!row.executionId) continue
    const key = `${row.executionId}::${row.description}`
    const metadata = parseModelUsageMetadata(row.metadata)
    const billable = parseLedgerAmount(row.cost)
    const raw = parseLedgerAmount(row.rawCost ?? row.cost)

    const existing = executionModelState.get(key) ?? {
      toolCost: 0,
      embeddedToolCosts: {},
      billable: 0,
      raw: 0,
      provider: row.provider,
      model: row.description,
    }

    existing.billable += billable
    existing.raw += raw
    existing.toolCost = Math.max(existing.toolCost, metadata.toolCost ?? 0)
    if (metadata.embeddedToolCosts) {
      existing.embeddedToolCosts = mergeEmbeddedToolCosts(
        existing.embeddedToolCosts,
        metadata.embeddedToolCosts
      )
    }
    existing.embeddedToolIds = mergeEmbeddedToolIds(
      existing.embeddedToolIds,
      metadata.embeddedToolIds
    )
    if (row.provider) existing.provider = row.provider
    executionModelState.set(key, existing)
  }

  const byModelEmbedded = new Map<string, EmbeddedCostBucket>()
  const byProviderEmbedded = new Map<string, EmbeddedCostBucket>()
  const byToolEmbedded = new Map<string, EmbeddedToolCostBucket>()
  let totalEmbeddedBillable = 0
  let totalEmbeddedRaw = 0

  for (const state of executionModelState.values()) {
    if (state.toolCost <= 0) continue

    const ratio = state.billable > 0 ? state.raw / state.billable : 1
    const embeddedRaw = state.toolCost * ratio

    totalEmbeddedBillable += state.toolCost
    totalEmbeddedRaw += embeddedRaw

    const modelEntry = byModelEmbedded.get(state.model) ?? { billable: 0, raw: 0 }
    modelEntry.billable += state.toolCost
    modelEntry.raw += embeddedRaw
    byModelEmbedded.set(state.model, modelEntry)

    if (state.provider) {
      const providerEntry = byProviderEmbedded.get(state.provider) ?? { billable: 0, raw: 0 }
      providerEntry.billable += state.toolCost
      providerEntry.raw += embeddedRaw
      byProviderEmbedded.set(state.provider, providerEntry)
    }

    const resolved = resolveEmbeddedToolsForModel({
      model: state.model,
      toolCost: state.toolCost,
      embeddedToolCosts:
        Object.keys(state.embeddedToolCosts).length > 0 ? state.embeddedToolCosts : undefined,
      embeddedToolIds: state.embeddedToolIds,
    })

    for (const tool of resolved.tools) {
      const toolId = tool.name
      const toolBillable = tool.cost
      const toolRaw = tool.cost * ratio
      const toolEntry = byToolEmbedded.get(toolId) ?? { billable: 0, raw: 0, count: 0 }
      toolEntry.billable += toolBillable
      toolEntry.raw += toolRaw
      toolEntry.count += 1
      byToolEmbedded.set(toolId, toolEntry)
    }
  }

  return {
    byModelEmbedded,
    byProviderEmbedded,
    byToolEmbedded,
    totalEmbeddedBillable,
    totalEmbeddedRaw,
  }
}

export function applyEmbeddedToolChargeTypeSplit<
  T extends { chargeType: string; billableCost: number; rawCost: number; count: number },
>(rows: T[], split: EmbeddedToolVirtualSplit): T[] {
  if (split.totalEmbeddedBillable <= 0) return rows

  const adjusted = rows.map((row) => ({ ...row }))
  const provider = adjusted.find((row) => row.chargeType === 'provider')
  const tool = adjusted.find((row) => row.chargeType === 'tool')

  if (provider) {
    provider.billableCost = Math.max(0, provider.billableCost - split.totalEmbeddedBillable)
    provider.rawCost = Math.max(0, provider.rawCost - split.totalEmbeddedRaw)
  }

  if (tool) {
    tool.billableCost += split.totalEmbeddedBillable
    tool.rawCost += split.totalEmbeddedRaw
  } else {
    adjusted.push({
      chargeType: 'tool',
      billableCost: split.totalEmbeddedBillable,
      rawCost: split.totalEmbeddedRaw,
      count: 0,
    } as T)
  }

  return adjusted
}

export function subtractEmbeddedFromBucketRows<
  T extends { billableCost: number; rawCost: number; count: number },
>(rows: T[], getKey: (row: T) => string, embedded: Map<string, EmbeddedCostBucket>): T[] {
  if (embedded.size === 0) return rows

  return rows.map((row) => {
    const entry = embedded.get(getKey(row))
    if (!entry) return row
    return {
      ...row,
      billableCost: Math.max(0, row.billableCost - entry.billable),
      rawCost: Math.max(0, row.rawCost - entry.raw),
    }
  })
}

export function mergeEmbeddedToolBucketRows<
  T extends { toolId: string; billableCost: number; rawCost: number; count: number },
>(rows: T[], embedded: Map<string, EmbeddedToolCostBucket | EmbeddedCostBucket>): T[] {
  if (embedded.size === 0) return rows

  const merged = new Map(rows.map((row) => [row.toolId, { ...row }]))

  for (const [toolId, costs] of embedded) {
    const embeddedCount = 'count' in costs ? costs.count : 0
    const existing = merged.get(toolId)
    if (existing) {
      existing.billableCost += costs.billable
      existing.rawCost += costs.raw
      existing.count += embeddedCount
    } else {
      merged.set(toolId, {
        toolId,
        billableCost: costs.billable,
        rawCost: costs.raw,
        count: embeddedCount,
      } as T)
    }
  }

  return [...merged.values()].sort((a, b) => b.billableCost - a.billableCost)
}
