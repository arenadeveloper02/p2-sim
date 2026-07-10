import type { TraceSpan } from '@/lib/logs/types'

export const UNATTRIBUTED_AGENT_TOOLS_ID = 'unattributed_agent_tools'

type ToolCostSpan = {
  type?: string
  name?: string
  model?: string
  output?: unknown
  children?: ToolCostSpan[]
}

/** Reads `output.cost.total` from a trace tool span when present. */
export function getSpanToolOutputCost(span: ToolCostSpan): number {
  const output = span.output
  if (!output || typeof output !== 'object' || Array.isArray(output)) return 0
  const cost = (output as Record<string, unknown>).cost
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return 0
  const total = (cost as Record<string, unknown>).total
  return typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : 0
}

/** Sums billable tool output costs under a span tree, keyed by tool name. */
export function extractEmbeddedToolCostsFromSpan(span: ToolCostSpan): Record<string, number> {
  const costs: Record<string, number> = {}

  const visit = (node: ToolCostSpan) => {
    if (node.type === 'tool') {
      const cost = getSpanToolOutputCost(node)
      if (cost > 0) {
        const name = node.name?.trim() || 'unknown_tool'
        costs[name] = (costs[name] ?? 0) + cost
      }
    }
    node.children?.forEach(visit)
  }

  visit(span)
  return costs
}

/** Scales per-tool raw costs so their sum matches the parent `toolCost` subtotal. */
export function normalizeEmbeddedToolCosts(
  raw: Record<string, number>,
  targetTotal: number
): Record<string, number> {
  const entries = Object.entries(raw).filter(([, value]) => value > 0)
  if (entries.length === 0 || targetTotal <= 0) return {}

  const rawSum = entries.reduce((sum, [, value]) => sum + value, 0)
  if (rawSum <= 0) return {}

  if (Math.abs(rawSum - targetTotal) < 1e-10) {
    return Object.fromEntries(entries)
  }

  const scale = targetTotal / rawSum
  return Object.fromEntries(entries.map(([key, value]) => [key, value * scale]))
}

/** Within a single cost summary, sum per-tool costs across spans for the same model. */
export function accumulateEmbeddedToolCosts(
  existing: Record<string, number> | undefined,
  incoming: Record<string, number>
): Record<string, number> {
  const merged = { ...(existing ?? {}) }
  for (const [key, value] of Object.entries(incoming)) {
    if (value <= 0) continue
    merged[key] = (merged[key] ?? 0) + value
  }
  return merged
}

/** Pause/resume cumulative merge: per tool name, keep the running maximum. */
export function mergeEmbeddedToolCosts(
  existing: Record<string, number> | undefined,
  incoming: Record<string, number>
): Record<string, number> {
  const merged = { ...(existing ?? {}) }
  for (const [key, value] of Object.entries(incoming)) {
    if (value <= 0) continue
    merged[key] = Math.max(merged[key] ?? 0, value)
  }
  return merged
}

/** Extracts per-tool costs for a model from trace spans (legacy runs without metadata). */
export function extractEmbeddedToolCostsFromTrace(
  spans: TraceSpan[] | undefined,
  model: string
): Record<string, number> {
  const costs: Record<string, number> = {}

  const visit = (span: TraceSpan, inheritedModel?: string) => {
    const spanModel = span.model ?? inheritedModel
    if (span.type === 'tool' && spanModel === model) {
      const cost = getSpanToolOutputCost(span)
      if (cost > 0) {
        const name = span.name?.trim() || 'unknown_tool'
        costs[name] = (costs[name] ?? 0) + cost
      }
    }
    span.children?.forEach((child) => visit(child, spanModel))
  }

  spans?.forEach((span) => visit(span))
  return costs
}

export interface ResolvedEmbeddedTools {
  tools: Array<{ name: string; cost: number }>
  unattributed: number
}

/**
 * Resolves named embedded tools for a model row, using persisted metadata first and
 * trace spans as a fallback. Any remainder vs `toolCost` is unattributed.
 */
export function resolveEmbeddedToolsForModel(params: {
  model: string
  toolCost?: number
  embeddedToolCosts?: Record<string, number>
  traceSpans?: TraceSpan[]
}): ResolvedEmbeddedTools {
  const toolCost = params.toolCost ?? 0
  if (toolCost <= 0) {
    return { tools: [], unattributed: 0 }
  }

  let named = params.embeddedToolCosts ?? {}
  if (Object.keys(named).length === 0 && params.traceSpans) {
    named = extractEmbeddedToolCostsFromTrace(params.traceSpans, params.model)
  }

  const tools = Object.entries(named)
    .filter(([, cost]) => cost > 0)
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))

  const namedTotal = tools.reduce((sum, tool) => sum + tool.cost, 0)
  const unattributed = Math.max(0, toolCost - namedTotal)

  return { tools, unattributed }
}

export function formatEmbeddedToolLabel(toolId: string): string {
  if (toolId === UNATTRIBUTED_AGENT_TOOLS_ID) return 'Unattributed agent tools'
  if (toolId === 'image_generate') return 'Image Generator'
  return toolId.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
