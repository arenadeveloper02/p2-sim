import type { ModelUsageMetadata } from '@/lib/billing/core/usage-log'
import {
  mergeEmbeddedToolCosts,
  resolveEmbeddedToolsForModel,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'

interface ModelMetadataRow {
  executionId: string | null
  description: string
  provider: string | null
  cost: string
  rawCost: string | null
  metadata: unknown
}

function parseLedgerAmount(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export interface EmbeddedToolVirtualSplit {
  byModelEmbedded: Map<string, { billable: number; raw: number }>
  byProviderEmbedded: Map<string, { billable: number; raw: number }>
  byToolEmbedded: Map<string, { billable: number; raw: number }>
  totalEmbeddedBillable: number
  totalEmbeddedRaw: number
}

/**
 * Derives virtual embedded-tool splits from cumulative model metadata without
 * changing authoritative ledger totals.
 */
export function computeEmbeddedToolVirtualSplit(
  rows: ModelMetadataRow[]
): EmbeddedToolVirtualSplit {
  const executionModelState = new Map<
    string,
    {
      toolCost: number
      embeddedToolCosts: Record<string, number>
      billable: number
      raw: number
      provider: string | null
      model: string
    }
  >()

  for (const row of rows) {
    if (!row.executionId) continue
    const key = `${row.executionId}::${row.description}`
    const metadata = (row.metadata ?? {}) as ModelUsageMetadata
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
    if (row.provider) existing.provider = row.provider
    executionModelState.set(key, existing)
  }

  const byModelEmbedded = new Map<string, { billable: number; raw: number }>()
  const byProviderEmbedded = new Map<string, { billable: number; raw: number }>()
  const byToolEmbedded = new Map<string, { billable: number; raw: number }>()
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
    })

    for (const tool of resolved.tools) {
      const toolBillable = tool.cost
      const toolRaw = tool.cost * ratio
      const toolEntry = byToolEmbedded.get(tool.name) ?? { billable: 0, raw: 0 }
      toolEntry.billable += toolBillable
      toolEntry.raw += toolRaw
      byToolEmbedded.set(tool.name, toolEntry)
    }

    if (resolved.unattributed > 0) {
      const toolEntry = byToolEmbedded.get(UNATTRIBUTED_AGENT_TOOLS_ID) ?? {
        billable: 0,
        raw: 0,
      }
      toolEntry.billable += resolved.unattributed
      toolEntry.raw += resolved.unattributed * ratio
      byToolEmbedded.set(UNATTRIBUTED_AGENT_TOOLS_ID, toolEntry)
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
>(
  rows: T[],
  getKey: (row: T) => string,
  embedded: Map<string, { billable: number; raw: number }>
): T[] {
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
>(rows: T[], embedded: Map<string, { billable: number; raw: number }>): T[] {
  if (embedded.size === 0) return rows

  const merged = new Map(rows.map((row) => [row.toolId, { ...row }]))

  for (const [toolId, costs] of embedded) {
    const existing = merged.get(toolId)
    if (existing) {
      existing.billableCost += costs.billable
      existing.rawCost += costs.raw
    } else {
      merged.set(toolId, {
        toolId,
        billableCost: costs.billable,
        rawCost: costs.raw,
        count: 0,
      } as T)
    }
  }

  return [...merged.values()].sort((a, b) => b.billableCost - a.billableCost)
}
