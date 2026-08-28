import { db } from '@sim/db'
import { usageLog } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import type { AdditiveCostLeaf, CostLedger } from '@/lib/api/contracts/logs'
import type { ModelUsageMetadata } from '@/lib/billing/core/usage-log'
import {
  formatEmbeddedToolLabel,
  mergeEmbeddedToolCosts,
  resolveEmbeddedToolsForModel,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'
import type { TraceSpan } from '@/lib/logs/types'

type LedgerItem = CostLedger['items'][number]

function mergeLedgerMetadata(existing: LedgerItem, metadata: ModelUsageMetadata): void {
  if (typeof metadata.inputTokens === 'number') {
    existing.inputTokens = Math.max(existing.inputTokens ?? 0, metadata.inputTokens)
  }
  if (typeof metadata.outputTokens === 'number') {
    existing.outputTokens = Math.max(existing.outputTokens ?? 0, metadata.outputTokens)
  }
  if (typeof metadata.toolCost === 'number') {
    existing.toolCost = Math.max(existing.toolCost ?? 0, metadata.toolCost)
  }
  if (metadata.embeddedToolCosts) {
    const resolved = resolveEmbeddedToolsForModel({
      model: existing.description,
      toolCost: existing.toolCost,
      embeddedToolCosts: mergeEmbeddedToolCosts(
        Object.fromEntries((existing.embeddedTools ?? []).map((tool) => [tool.name, tool.cost])),
        metadata.embeddedToolCosts
      ),
    })
    existing.embeddedTools = resolved.tools
  }
}

function enrichModelItemFromTrace(item: LedgerItem, traceSpans?: TraceSpan[]): void {
  if (item.category !== 'model' || !item.toolCost || item.toolCost <= 0) return
  if (item.embeddedTools && item.embeddedTools.length > 0) return

  const resolved = resolveEmbeddedToolsForModel({
    model: item.description,
    toolCost: item.toolCost,
    traceSpans,
  })
  item.embeddedTools = resolved.tools
}

/** Builds additive leaf rows that reconcile exactly to the ledger total. */
export function buildAdditiveCostLeaves(
  items: LedgerItem[],
  traceSpans?: TraceSpan[]
): AdditiveCostLeaf[] {
  const enrichedItems = items.map((item) => {
    const copy = {
      ...item,
      embeddedTools: item.embeddedTools ? [...item.embeddedTools] : undefined,
    }
    enrichModelItemFromTrace(copy, traceSpans)
    return copy
  })

  const leaves: AdditiveCostLeaf[] = []

  for (const [index, item] of enrichedItems.entries()) {
    if (item.category === 'fixed') {
      leaves.push({
        key: `fixed-${index}`,
        group: 'base',
        label: item.description === 'execution_fee' ? 'Base Run' : item.description,
        dollars: item.cost,
      })
      continue
    }

    if (item.category === 'model') {
      const toolCost = item.toolCost ?? 0
      const modelOnlyCost = Math.max(0, item.cost - toolCost)
      if (modelOnlyCost > 0) {
        leaves.push({
          key: `model-${index}`,
          group: 'model',
          label: item.description,
          dollars: modelOnlyCost,
        })
      }

      const resolved = resolveEmbeddedToolsForModel({
        model: item.description,
        toolCost,
        embeddedToolCosts: item.embeddedTools
          ? Object.fromEntries(item.embeddedTools.map((tool) => [tool.name, tool.cost]))
          : undefined,
        traceSpans,
      })

      for (const [toolIndex, tool] of resolved.tools.entries()) {
        leaves.push({
          key: `model-${index}-tool-${toolIndex}`,
          group: 'tool',
          label: formatEmbeddedToolLabel(tool.name),
          dollars: tool.cost,
        })
      }

      if (resolved.unattributed > 0) {
        leaves.push({
          key: `model-${index}-unattributed`,
          group: 'tool',
          label: formatEmbeddedToolLabel(UNATTRIBUTED_AGENT_TOOLS_ID),
          dollars: resolved.unattributed,
        })
      }
      continue
    }

    if (item.category === 'tool') {
      leaves.push({
        key: `tool-${index}`,
        group: 'tool',
        label: formatEmbeddedToolLabel(item.description),
        dollars: item.cost,
      })
      continue
    }

    leaves.push({
      key: `other-${index}`,
      group: 'other',
      label: item.description,
      dollars: item.cost,
    })
  }

  return leaves
}

/**
 * The itemized billing lines for one run, or `null` when the run has no ledger.
 *
 * `null` and `[]` are different answers and both are reachable, so neither may
 * stand in for the other. `null` means `usage_log` recorded nothing for the
 * execution — a run that predates the ledger, or a job run, which the
 * `source = 'workflow'` predicate excludes outright. An empty array would claim
 * a ledger exists and itemizes to nothing.
 *
 * Lines are folded on `(category, description)` because the ledger records one
 * row per billed event and a run can bill the same model many times; token
 * counts take the maximum rather than the sum, matching how they are reported
 * per call rather than accumulated. Billable cost is preferred when present so
 * the UI matches what the workspace was charged.
 */
export async function buildCostLedger(
  executionId: string,
  traceSpans?: TraceSpan[]
): Promise<CostLedger | null> {
  const rows = await db
    .select({
      category: usageLog.category,
      description: usageLog.description,
      cost: usageLog.cost,
      billableCost: usageLog.billableCost,
      metadata: usageLog.metadata,
    })
    .from(usageLog)
    .where(and(eq(usageLog.executionId, executionId), eq(usageLog.source, 'workflow')))

  if (rows.length === 0) return null

  const byKey = new Map<string, LedgerItem>()
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as ModelUsageMetadata
    const category = row.category as LedgerItem['category']
    const key = `${category}::${row.description}`
    const existing = byKey.get(key)
    if (existing) {
      existing.cost += Number(row.billableCost ?? row.cost)
      mergeLedgerMetadata(existing, metadata)
    } else {
      const item: LedgerItem = {
        category,
        description: row.description,
        cost: Number(row.billableCost ?? row.cost),
        ...(typeof metadata.inputTokens === 'number' ? { inputTokens: metadata.inputTokens } : {}),
        ...(typeof metadata.outputTokens === 'number'
          ? { outputTokens: metadata.outputTokens }
          : {}),
        ...(typeof metadata.toolCost === 'number' ? { toolCost: metadata.toolCost } : {}),
      }
      if (metadata.embeddedToolCosts) {
        item.embeddedTools = resolveEmbeddedToolsForModel({
          model: row.description,
          toolCost: metadata.toolCost,
          embeddedToolCosts: metadata.embeddedToolCosts,
        }).tools
      }
      byKey.set(key, item)
    }
  }

  const items = [...byKey.values()]
  const total = items.reduce((sum, item) => sum + item.cost, 0)
  const leaves = buildAdditiveCostLeaves(items, traceSpans)
  return { total, items, leaves }
}
