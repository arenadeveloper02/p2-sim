import {
  FALAI_IMAGE_MODEL_IDS,
  IMAGE_BLOCK_MODEL_IDS,
} from '@/lib/image-generation/block-model-config'
import type { TraceSpan } from '@/lib/logs/types'

export const UNATTRIBUTED_AGENT_TOOLS_ID = 'unattributed_agent_tools'

/** Tool ids whose embedded costs should split by underlying image model when available. */
export const IMAGE_AGGREGATE_TOOL_IDS = new Set([
  'image_generate',
  'openai_image',
  'google_imagen',
  'google_nano_banana',
])

const LEGACY_IMAGE_AGGREGATE_TOOL_KEY = 'image_generate'

const IMAGE_GENERATION_MODEL_IDS = new Set<string>([
  ...IMAGE_BLOCK_MODEL_IDS,
  ...FALAI_IMAGE_MODEL_IDS,
])

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

/** Returns the billed image model from tool output when present. */
export function extractToolOutputModel(output: unknown): string | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  const record = output as Record<string, unknown>

  if (typeof record.model === 'string' && record.model.trim().length > 0) {
    return record.model.trim()
  }

  const cost = record.cost
  if (cost && typeof cost === 'object' && !Array.isArray(cost)) {
    const costModel = (cost as Record<string, unknown>).model
    if (typeof costModel === 'string' && costModel.trim().length > 0) {
      return costModel.trim()
    }
  }

  const metadata = record.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const metaModel = (metadata as Record<string, unknown>).model
    if (typeof metaModel === 'string' && metaModel.trim().length > 0) {
      return metaModel.trim()
    }
  }

  return null
}

/** True when a billing key is an image tool id or a known image generation model id. */
export function isImageGenerationBillingKey(key: string): boolean {
  const normalized = key.trim()
  if (!normalized) return false
  if (IMAGE_AGGREGATE_TOOL_IDS.has(normalized)) return true
  return IMAGE_GENERATION_MODEL_IDS.has(normalized)
}

/**
 * Resolves the billing key for an embedded or standalone hosted tool span.
 * Image aggregate tools prefer the underlying model id when output includes it.
 */
export function resolveEmbeddedToolCostKey(toolName: string, output?: unknown): string {
  const normalizedTool = toolName.trim() || 'unknown_tool'
  if (!IMAGE_AGGREGATE_TOOL_IDS.has(normalizedTool)) {
    return normalizedTool
  }

  return extractToolOutputModel(output) ?? normalizedTool
}

export function hasLegacyAggregatedImageToolCosts(
  embeddedToolCosts: Record<string, number> | undefined
): boolean {
  return Boolean(embeddedToolCosts && LEGACY_IMAGE_AGGREGATE_TOOL_KEY in embeddedToolCosts)
}

/** Sums billable tool output costs under a span tree, keyed by billing id. */
export function extractEmbeddedToolCostsFromSpan(span: ToolCostSpan): Record<string, number> {
  const costs: Record<string, number> = {}

  const visit = (node: ToolCostSpan) => {
    if (node.type === 'tool') {
      const cost = getSpanToolOutputCost(node)
      if (cost > 0) {
        const key = resolveEmbeddedToolCostKey(node.name?.trim() || 'unknown_tool', node.output)
        costs[key] = (costs[key] ?? 0) + cost
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
        const key = resolveEmbeddedToolCostKey(span.name?.trim() || 'unknown_tool', span.output)
        costs[key] = (costs[key] ?? 0) + cost
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
  const shouldPreferTrace =
    Boolean(params.traceSpans) &&
    (Object.keys(named).length === 0 || hasLegacyAggregatedImageToolCosts(named))

  if (shouldPreferTrace && params.traceSpans) {
    named = normalizeEmbeddedToolCosts(
      extractEmbeddedToolCostsFromTrace(params.traceSpans, params.model),
      toolCost
    )
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
  if (isImageGenerationBillingKey(toolId) && !IMAGE_AGGREGATE_TOOL_IDS.has(toolId)) {
    return toolId
  }
  return toolId.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
