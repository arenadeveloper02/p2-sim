import { calculateCost } from '@/providers/utils'

/** Tools whose child-workflow cost already lands under `source='workflow'`. */
export const LOCAL_COPILOT_EXCLUDED_TOOL_COST_NAMES = new Set([
  'run_workflow',
  'run_workflow_until_block',
])

export type LocalTurnCostComponentKind = 'model' | 'tool'

export interface LocalTurnCostComponent {
  kind: LocalTurnCostComponentKind
  /** Model id or tool name / service label. */
  id: string
  /** Vendor COGS in USD before USAGE_LOG_COST_MULTIPLIER. */
  cost: number
  inputTokens?: number
  outputTokens?: number
  vendor?: string
  provider?: string
  toolId?: string
}

export interface LocalTurnCostSummary {
  /** Sum of component vendor COGS. */
  total: number
  input: number
  output: number
  components: LocalTurnCostComponent[]
}

/**
 * Explicit billing metadata returned by Local tool execution. Prefer this over
 * scraping arbitrary user-facing tool output.
 */
export interface LocalToolBillingMetadata {
  /** Trusted hosted-tool / server-tool cost in USD (vendor COGS). */
  cost: number
  service?: string
  vendor?: string
  provider?: string
  toolId?: string
}

/**
 * Accumulates model and trusted tool costs for one Local Arena Copilot turn.
 * Does not write the ledger — callers flush once at end-of-turn.
 */
export class LocalTurnCostAccumulator {
  private readonly components: LocalTurnCostComponent[] = []

  /** Prices a model round via `calculateCost` and records the component. */
  addModelUsage(params: {
    model: string
    inputTokens: number
    outputTokens: number
    provider?: string
    vendor?: string
  }): LocalTurnCostComponent | null {
    if (params.inputTokens <= 0 && params.outputTokens <= 0) {
      return null
    }

    const priced = calculateCost(params.model, params.inputTokens, params.outputTokens)
    if (priced.total <= 0) {
      return null
    }

    const component: LocalTurnCostComponent = {
      kind: 'model',
      id: params.model,
      cost: priced.total,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.vendor ? { vendor: params.vendor } : {}),
    }
    this.components.push(component)
    return component
  }

  /**
   * Records a trusted tool cost. Excludes `run_workflow*` child-workflow spend
   * and ignores non-positive amounts.
   */
  addToolBilling(params: {
    toolName: string
    billing: LocalToolBillingMetadata | null | undefined
  }): LocalTurnCostComponent | null {
    if (LOCAL_COPILOT_EXCLUDED_TOOL_COST_NAMES.has(params.toolName)) {
      return null
    }
    const billing = params.billing
    if (!billing || !(billing.cost > 0)) {
      return null
    }

    const component: LocalTurnCostComponent = {
      kind: 'tool',
      id: billing.toolId ?? billing.service ?? params.toolName,
      cost: billing.cost,
      ...(billing.vendor ? { vendor: billing.vendor } : {}),
      ...(billing.provider ? { provider: billing.provider } : {}),
      ...(billing.toolId || params.toolName ? { toolId: billing.toolId ?? params.toolName } : {}),
    }
    this.components.push(component)
    return component
  }

  /** Snapshot of accumulated components and totals. */
  summarize(): LocalTurnCostSummary {
    let total = 0
    let input = 0
    let output = 0
    for (const component of this.components) {
      total += component.cost
      if (component.kind !== 'model') continue
      const priced = calculateCost(
        component.id,
        component.inputTokens ?? 0,
        component.outputTokens ?? 0
      )
      input += priced.input
      output += priced.output
    }

    return {
      total: Number.parseFloat(total.toFixed(8)),
      input: Number.parseFloat(input.toFixed(8)),
      output: Number.parseFloat(output.toFixed(8)),
      components: [...this.components],
    }
  }
}

/**
 * Extracts trusted billing metadata from a Local tool result payload.
 * Accepts explicit `billing` on the execution result, `_serviceCost` from
 * server tools, and canonical `cost.total` / `cost.costDollars` shapes.
 */
export function extractLocalToolBillingMetadata(result: unknown): LocalToolBillingMetadata | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>

  const explicit = record.billing
  if (explicit && typeof explicit === 'object') {
    const billing = explicit as Record<string, unknown>
    const cost = typeof billing.cost === 'number' ? billing.cost : null
    if (cost != null && cost > 0) {
      return {
        cost,
        ...(typeof billing.service === 'string' ? { service: billing.service } : {}),
        ...(typeof billing.vendor === 'string' ? { vendor: billing.vendor } : {}),
        ...(typeof billing.provider === 'string' ? { provider: billing.provider } : {}),
        ...(typeof billing.toolId === 'string' ? { toolId: billing.toolId } : {}),
      }
    }
  }

  const serviceCost = record._serviceCost
  if (serviceCost && typeof serviceCost === 'object') {
    const sc = serviceCost as Record<string, unknown>
    const cost = typeof sc.cost === 'number' ? sc.cost : null
    if (cost != null && cost > 0) {
      return {
        cost,
        ...(typeof sc.service === 'string' ? { service: sc.service } : {}),
      }
    }
  }

  const costNode = record.cost
  if (costNode && typeof costNode === 'object') {
    const cost = costNode as Record<string, unknown>
    if (typeof cost.total === 'number' && cost.total > 0) {
      return { cost: cost.total }
    }
    if (typeof cost.costDollars === 'number' && cost.costDollars > 0) {
      return { cost: cost.costDollars }
    }
  }

  return null
}
