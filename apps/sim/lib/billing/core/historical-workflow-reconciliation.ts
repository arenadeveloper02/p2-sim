import { db } from '@sim/db'
import {
  usageLog,
  workflow,
  workflowExecutionLogs,
  workflowExecutionSnapshots,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage, getPostgresErrorCode } from '@sim/utils/errors'
import { BlockType } from '@/executor/constants'
import { CostBlockHandler } from '@/executor/handlers/cost/cost-handler'
import type { BlockLog, BlockState, ExecutionContext } from '@/executor/types'
import { BASE_EXECUTION_CHARGE } from '@/lib/billing/constants'
import {
  collectTraceExecutionArtifacts,
  resolveExternalDescription,
} from '@/lib/billing/core/cost-block-reprice'
import { getHighestPrioritySubscription } from '@/lib/billing/core/plan'
import {
  normalizeUsageModelId,
  normalizeUsageToolId,
} from '@/lib/billing/core/usage-entry-normalize'
import {
  deriveBillingContext,
  recordUsage,
  stableEventKey,
  type UsageEntry,
  type UsageLogCategory,
  type UsageLogMetadata,
  type UsagePricingSnapshot,
} from '@/lib/billing/core/usage-log'
import { isLargeValueRef } from '@/lib/execution/payloads/large-value-ref'
import {
  extractEmbeddedToolCostsFromSpan,
  getSpanToolOutputCost,
  normalizeEmbeddedToolCosts,
} from '@/lib/logs/embedded-tool-costs'
import {
  calculateCostSummary,
  type CostSummaryExternalCharge,
} from '@/lib/logs/execution/logging-factory'
import { materializeExecutionData, TRACE_STORE_REF_KEY } from '@/lib/logs/execution/trace-store'
import type { WorkflowState } from '@/lib/logs/types'
import type { SerializedBlock, SerializedConnection, SerializedWorkflow } from '@/serializer/types'
import { FALAI_HOSTED_KEY_MARKUP_MULTIPLIER } from '@/lib/tools/falai-pricing'
import { calculateHostedImageToolCost } from '@/lib/tools/image-pricing'
import { resolveBlockModelCost, shouldBillModelUsage } from '@/providers/utils'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

const logger = createLogger('HistoricalWorkflowReconciliation')

export const RECONCILIATION_EPSILON = 1e-6

export const HISTORICAL_RECONCILE_VERSION = 'historical-reconcile-v1'

export const HISTORICAL_RECONCILE_PRICING_MODE = 'current-catalog' as const

export type HistoricalReconcilePricingMode = typeof HISTORICAL_RECONCILE_PRICING_MODE

const HISTORICAL_RECONCILE_LOCK_TIMEOUT_MS = 10_000

export interface ReconciliationTargetLine {
  category: UsageLogCategory
  description: string
  target: number
  reason?: string
  evidenceSource?: string
  metadata?: UsageLogMetadata
  toolId?: string
  vendor?: string
  quantity?: number
  unit?: string
  pricingSnapshot?: UsagePricingSnapshot
}

export interface HistoricalReconcileShadowRecord {
  executionId: string
  workflowId: string | null
  workspaceId: string
  startedAt: string
  status: string
  ledgerSum: number
  ledgerLines: LedgerLineSummary[]
  costTotal: number | null
  targetSum: number
  positiveDelta: number
  negativeDelta: number
  confidence: ReconciliationConfidence
  applyEligible: boolean
  primaryClass: ReconciliationClass
  warnings: string[]
  blockers: string[]
  targets: ReconciliationTargetLine[]
  pricingMode: HistoricalReconcilePricingMode
}

export interface HistoricalAdjustmentBuildResult {
  entries: UsageEntry[]
  positiveDeltaTotal: number
  negativeDeltaTotal: number
  skippedNegativeLines: Array<{
    category: UsageLogCategory
    description: string
    target: number
    billed: number
    delta: number
  }>
}

export type HistoricalReconcileApplyStatus = 'applied' | 'skipped' | 'unchanged' | 'error'

export interface ApplyHistoricalReconciliationResult {
  executionId: string
  status: HistoricalReconcileApplyStatus
  reason?: string
  entriesInserted: number
  positiveDeltaApplied: number
  negativeDeltaSkipped: number
  ledgerSumBefore: number
  ledgerSumAfter: number
  costTotalBefore: number | null
  costTotalAfter: number
}

export interface ApplyHistoricalReconciliationBatchResult {
  processed: number
  applied: number
  unchanged: number
  skipped: number
  errors: number
  totalPositiveDeltaApplied: number
  totalNegativeDeltaSkipped: number
  results: ApplyHistoricalReconciliationResult[]
}

export const TERMINAL_EXECUTION_STATUSES = ['completed', 'failed', 'cancelled'] as const

export type ReconciliationClass =
  | 'reconciled'
  | 'ledger_projection_drift'
  | 'span_cost_legacy'
  | 'cost_stripped_needs_reprice'
  | 'missing_trace_data'
  | 'cost_block'
  | 'hosted_tool'
  | 'agent_embedded_tool'
  | 'mothership_risk'

export type ReconciliationConfidence = 'high' | 'medium' | 'low'

export interface HistoricalExecutionFilter {
  workflowId?: string
  executionId?: string
  workspaceId?: string
  since?: Date
  until?: Date
  limit?: number
}

export interface HistoricalExecutionRow {
  executionId: string
  workflowId: string | null
  workspaceId: string
  startedAt: Date
  status: string
  trigger: string
  stateSnapshotId: string
  costTotal: number | null
  ledgerSum: number
  drift: number
  modelsUsed: string[] | null
}

export interface LedgerLineSummary {
  category: string
  description: string
  cost: number
}

export interface TraceEvidenceSummary {
  hasTraceSpans: boolean
  traceSpanCount: number
  traceStoreExternalized: boolean
  traceStoreMaterialized: boolean
  traceStoreExpired: boolean
  spansWithInlineCost: number
  spansWithTokensNoCost: number
  spansWithHostedToolMetadata: number
  spansWithEmbeddedToolCost: number
  spansWithCostBlockType: number
  modelsInSpans: string[]
  hostedToolSignals: string[]
}

export interface ExecutionEvidence {
  executionId: string
  workflowId: string | null
  workspaceId: string
  startedAt: Date
  status: string
  trigger: string
  stateSnapshotId: string
  costTotal: number | null
  ledgerSum: number
  drift: number
  billingReconciliationPending: boolean
  billingReconciliationReason: string | null
  ledgerLines: LedgerLineSummary[]
  mothershipLedgerSum: number
  trace: TraceEvidenceSummary
  hasSnapshot: boolean
  snapshotHasCostBlocks: boolean
  snapshotState: WorkflowState | null
  traceSpans: TraceSpanLike[] | undefined
  modelsUsed: string[] | null
}

export interface ComputeTargetLedgerOptions {
  pricingMode?: HistoricalReconcilePricingMode
}

export interface ShadowRepriceSummary {
  total: number
  withTargets: number
  withPositiveDelta: number
  withNegativeDelta: number
  totalPositiveDelta: number
  totalNegativeDelta: number
  records: HistoricalReconcileShadowRecord[]
}

export interface ExecutionClassification {
  executionId: string
  workflowId: string | null
  workspaceId: string
  startedAt: Date
  status: string
  primaryClass: ReconciliationClass
  secondaryClasses: ReconciliationClass[]
  confidence: ReconciliationConfidence
  blockers: string[]
  warnings: string[]
  evidenceSources: string[]
  applyEligible: boolean
  costTotal: number | null
  ledgerSum: number
  drift: number
}

export interface ReconciliationAuditSummary {
  total: number
  byClass: Record<ReconciliationClass, number>
  byConfidence: Record<ReconciliationConfidence, number>
  applyEligible: number
  withDrift: number
  topRiskExamples: ExecutionClassification[]
  classifications: ExecutionClassification[]
}

interface TraceSpanLike {
  type?: string
  name?: string
  model?: string
  cost?: { input?: number; output?: number; total?: number; toolCost?: number }
  tokens?: {
    input?: number
    output?: number
    total?: number
    prompt?: number
    completion?: number
  }
  output?: Record<string, unknown>
  children?: TraceSpanLike[]
}

function parseDecimal(value: string | null | undefined): number {
  if (value == null) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasTokenCounts(span: TraceSpanLike): boolean {
  const tokens = span.tokens
  if (!tokens) return false
  const input = tokens.input ?? tokens.prompt ?? 0
  const output = tokens.output ?? tokens.completion ?? 0
  const total = tokens.total ?? 0
  return input > 0 || output > 0 || total > 0
}

function hasInlineSpanCost(span: TraceSpanLike): boolean {
  const total = span.cost?.total
  return typeof total === 'number' && Number.isFinite(total) && total > 0
}

function detectHostedToolSignals(output: Record<string, unknown> | undefined): string[] {
  if (!output) return []
  const signals: string[] = []

  const metadata = output.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const creditsUsed = (metadata as { creditsUsed?: unknown }).creditsUsed
    if (typeof creditsUsed === 'number' && creditsUsed > 0) {
      signals.push('firecrawl_credits')
    }
  }

  if (typeof output.__falaiCostDollars === 'number' && output.__falaiCostDollars > 0) {
    signals.push('falai_cost_dollars')
  }

  if (output.__imageBilling && typeof output.__imageBilling === 'object') {
    signals.push('image_billing')
  }

  return signals
}

function walkTraceSpans(
  spans: TraceSpanLike[] | undefined,
  visit: (span: TraceSpanLike) => void
): void {
  if (!spans) return
  for (const span of spans) {
    visit(span)
    walkTraceSpans(span.children, visit)
  }
}

/**
 * Inspects trace span trees for reconciliation evidence without mutating spans.
 */
export function analyzeTraceSpans(traceSpans: TraceSpanLike[] | undefined): TraceEvidenceSummary {
  const models = new Set<string>()
  const hostedToolSignals = new Set<string>()
  let spansWithInlineCost = 0
  let spansWithTokensNoCost = 0
  let spansWithHostedToolMetadata = 0
  let spansWithEmbeddedToolCost = 0
  let spansWithCostBlockType = 0

  walkTraceSpans(traceSpans, (span) => {
    if (span.model) models.add(span.model)

    if (hasInlineSpanCost(span)) {
      spansWithInlineCost += 1
    } else if (span.model && hasTokenCounts(span)) {
      spansWithTokensNoCost += 1
    }

    if (span.type === 'cost') {
      spansWithCostBlockType += 1
    }

    const toolSignals = detectHostedToolSignals(span.output)
    if (toolSignals.length > 0) {
      spansWithHostedToolMetadata += 1
      for (const signal of toolSignals) hostedToolSignals.add(signal)
    }

    if (span.type === 'agent' || span.model) {
      const embeddedCosts = extractEmbeddedToolCostsFromSpan(span)
      const embeddedTotal = Object.values(embeddedCosts).reduce((sum, value) => sum + value, 0)
      const toolCost = span.cost?.toolCost ?? 0
      if (embeddedTotal > 0 || toolCost > 0) {
        spansWithEmbeddedToolCost += 1
      }
    }
  })

  return {
    hasTraceSpans: Boolean(traceSpans && traceSpans.length > 0),
    traceSpanCount: traceSpans?.length ?? 0,
    traceStoreExternalized: false,
    traceStoreMaterialized: false,
    traceStoreExpired: false,
    spansWithInlineCost,
    spansWithTokensNoCost,
    spansWithHostedToolMetadata,
    spansWithEmbeddedToolCost,
    spansWithCostBlockType,
    modelsInSpans: [...models],
    hostedToolSignals: [...hostedToolSignals],
  }
}

/** Returns true when snapshot state contains at least one Cost block. */
export function snapshotStateHasCostBlocks(stateData: WorkflowState | null | undefined): boolean {
  if (!stateData?.blocks) return false
  return Object.values(stateData.blocks).some((block) => block.type === BlockType.COST)
}

function readBillingReconciliationFlags(executionData: Record<string, unknown>): {
  pending: boolean
  reason: string | null
} {
  const pending = executionData.billingReconciliationPending === true
  const reasonRaw = executionData.billingReconciliationReason
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim().length > 0 ? reasonRaw : null
  return { pending, reason }
}

function uniqueClasses(classes: ReconciliationClass[]): ReconciliationClass[] {
  return [...new Set(classes)]
}

/**
 * Classifies a single execution's evidence into reconciliation classes, confidence,
 * and apply eligibility for the historical repricer.
 */
export function classifyExecutionEvidence(evidence: ExecutionEvidence): ExecutionClassification {
  const warnings: string[] = []
  const blockers: string[] = []
  const evidenceSources: string[] = []
  const secondaryClasses: ReconciliationClass[] = []

  const hasDrift = Math.abs(evidence.drift) > RECONCILIATION_EPSILON
  const { trace } = evidence

  if (evidence.mothershipLedgerSum > 0 && evidence.ledgerSum > 0) {
    secondaryClasses.push('mothership_risk')
    warnings.push('workflow_and_mothership_block_ledger_rows_present')
  }

  if (trace.spansWithInlineCost > 0) {
    secondaryClasses.push('span_cost_legacy')
    evidenceSources.push('legacy_span_cost')
  }

  if (trace.spansWithTokensNoCost > 0) {
    secondaryClasses.push('cost_stripped_needs_reprice')
    evidenceSources.push('tokens_repriced')
  }

  if (evidence.snapshotHasCostBlocks || trace.spansWithCostBlockType > 0) {
    secondaryClasses.push('cost_block')
    evidenceSources.push('cost_block_snapshot')
  }

  if (trace.spansWithHostedToolMetadata > 0) {
    secondaryClasses.push('hosted_tool')
    for (const signal of trace.hostedToolSignals) {
      evidenceSources.push(signal)
    }
  }

  if (trace.spansWithEmbeddedToolCost > 0) {
    secondaryClasses.push('agent_embedded_tool')
    evidenceSources.push('agent_tool_cost')
  }

  if (!evidence.hasSnapshot) {
    warnings.push('snapshot_missing')
  }

  if (evidence.billingReconciliationPending) {
    warnings.push(
      evidence.billingReconciliationReason
        ? `billing_reconciliation_pending:${evidence.billingReconciliationReason}`
        : 'billing_reconciliation_pending'
    )
  }

  const unbillableModels = trace.modelsInSpans.filter((model) => !shouldBillModelUsage(model))
  if (unbillableModels.length > 0 && trace.spansWithTokensNoCost > 0) {
    warnings.push(`byok_ambiguity:${unbillableModels.join(',')}`)
  }

  let confidence: ReconciliationConfidence = 'high'
  if (warnings.some((warning) => warning.startsWith('byok_ambiguity'))) {
    confidence = 'low'
  } else if (
    (hasDrift || evidence.billingReconciliationPending) &&
    (trace.traceStoreExpired || (trace.traceStoreExternalized && !trace.traceStoreMaterialized))
  ) {
    confidence = 'medium'
  }

  let primaryClass: ReconciliationClass

  if (
    !hasDrift &&
    !evidence.billingReconciliationPending &&
    secondaryClasses.length === 0
  ) {
    primaryClass = 'reconciled'
  } else if (
    !hasDrift &&
    !evidence.billingReconciliationPending &&
    secondaryClasses.includes('mothership_risk')
  ) {
    primaryClass = 'mothership_risk'
    confidence = 'low'
  } else if (secondaryClasses.includes('mothership_risk') && hasDrift) {
    primaryClass = 'mothership_risk'
    confidence = 'low'
    blockers.push('manual_mothership_review_required')
  } else if (
    !trace.hasTraceSpans &&
    (trace.traceStoreExpired || trace.traceStoreExternalized)
  ) {
    primaryClass =
      hasDrift && evidence.ledgerSum > 0 ? 'ledger_projection_drift' : 'missing_trace_data'
    if (primaryClass === 'missing_trace_data') {
      evidenceSources.push('unrecoverable')
      blockers.push('trace_store_unavailable')
      confidence = 'low'
    }
  } else if (!trace.hasTraceSpans) {
    primaryClass =
      hasDrift && evidence.ledgerSum > 0 ? 'ledger_projection_drift' : 'missing_trace_data'
    if (primaryClass === 'missing_trace_data') {
      evidenceSources.push('unrecoverable')
      blockers.push('no_trace_spans')
      confidence = 'low'
    }
  } else if (hasDrift && evidence.ledgerSum > 0 && secondaryClasses.length === 0) {
    primaryClass = 'ledger_projection_drift'
  } else if (secondaryClasses.includes('span_cost_legacy')) {
    primaryClass = 'span_cost_legacy'
  } else if (secondaryClasses.includes('cost_stripped_needs_reprice')) {
    primaryClass = 'cost_stripped_needs_reprice'
    if (confidence === 'high') confidence = 'medium'
  } else if (secondaryClasses.includes('cost_block')) {
    primaryClass = 'cost_block'
  } else if (secondaryClasses.includes('hosted_tool')) {
    primaryClass = 'hosted_tool'
  } else if (secondaryClasses.includes('agent_embedded_tool')) {
    primaryClass = 'agent_embedded_tool'
  } else if (hasDrift && evidence.ledgerSum === 0) {
    primaryClass = 'missing_trace_data'
    evidenceSources.push('unrecoverable')
    blockers.push('ledger_empty_no_recoverable_evidence')
    confidence = 'low'
  } else if (hasDrift) {
    primaryClass = 'ledger_projection_drift'
  } else {
    primaryClass = 'reconciled'
  }

  const dedupedSecondary = uniqueClasses(
    secondaryClasses.filter((item) => item !== primaryClass)
  )

  const applyEligible =
    hasDrift &&
    blockers.length === 0 &&
    primaryClass !== 'mothership_risk' &&
    primaryClass !== 'missing_trace_data' &&
    primaryClass !== 'reconciled' &&
    primaryClass !== 'ledger_projection_drift' &&
    confidence !== 'low'

  return {
    executionId: evidence.executionId,
    workflowId: evidence.workflowId,
    workspaceId: evidence.workspaceId,
    startedAt: evidence.startedAt,
    status: evidence.status,
    primaryClass,
    secondaryClasses: dedupedSecondary,
    confidence,
    blockers,
    warnings,
    evidenceSources: [...new Set(evidenceSources)],
    applyEligible,
    costTotal: evidence.costTotal,
    ledgerSum: evidence.ledgerSum,
    drift: evidence.drift,
  }
}

function emptyClassCounts(): Record<ReconciliationClass, number> {
  return {
    reconciled: 0,
    ledger_projection_drift: 0,
    span_cost_legacy: 0,
    cost_stripped_needs_reprice: 0,
    missing_trace_data: 0,
    cost_block: 0,
    hosted_tool: 0,
    agent_embedded_tool: 0,
    mothership_risk: 0,
  }
}

/**
 * Aggregates per-execution classifications into audit counters and risk examples.
 */
export function aggregateClassificationResults(
  classifications: ExecutionClassification[],
  topRiskLimit = 20
): ReconciliationAuditSummary {
  const byClass = emptyClassCounts()
  const byConfidence: Record<ReconciliationConfidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  }

  let applyEligible = 0
  let withDrift = 0

  for (const item of classifications) {
    byClass[item.primaryClass] += 1
    byConfidence[item.confidence] += 1
    if (item.applyEligible) applyEligible += 1
    if (Math.abs(item.drift) > RECONCILIATION_EPSILON) withDrift += 1
  }

  const topRiskExamples = [...classifications]
    .filter(
      (item) =>
        item.primaryClass !== 'reconciled' ||
        item.warnings.length > 0 ||
        item.blockers.length > 0
    )
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
    .slice(0, topRiskLimit)

  return {
    total: classifications.length,
    byClass,
    byConfidence,
    applyEligible,
    withDrift,
    topRiskExamples,
    classifications,
  }
}

/**
 * Lists terminal workflow executions with ledger sums and projection drift.
 */
export async function listHistoricalWorkflowExecutions(
  filter: HistoricalExecutionFilter = {}
): Promise<HistoricalExecutionRow[]> {
  const conditions = [
    inArray(workflowExecutionLogs.status, [...TERMINAL_EXECUTION_STATUSES]),
  ]

  if (filter.workflowId) {
    conditions.push(eq(workflowExecutionLogs.workflowId, filter.workflowId))
  }
  if (filter.executionId) {
    conditions.push(eq(workflowExecutionLogs.executionId, filter.executionId))
  }
  if (filter.workspaceId) {
    conditions.push(eq(workflowExecutionLogs.workspaceId, filter.workspaceId))
  }
  if (filter.since) {
    conditions.push(gte(workflowExecutionLogs.startedAt, filter.since))
  }
  if (filter.until) {
    conditions.push(lte(workflowExecutionLogs.startedAt, filter.until))
  }

  const limit = filter.limit ?? 500

  const rows = await db
    .select({
      executionId: workflowExecutionLogs.executionId,
      workflowId: workflowExecutionLogs.workflowId,
      workspaceId: workflowExecutionLogs.workspaceId,
      startedAt: workflowExecutionLogs.startedAt,
      status: workflowExecutionLogs.status,
      trigger: workflowExecutionLogs.trigger,
      stateSnapshotId: workflowExecutionLogs.stateSnapshotId,
      costTotal: workflowExecutionLogs.costTotal,
      modelsUsed: workflowExecutionLogs.modelsUsed,
      ledgerSum: sql<string>`COALESCE((
        SELECT SUM(${usageLog.cost})
        FROM ${usageLog}
        WHERE ${usageLog.executionId} = ${workflowExecutionLogs.executionId}
          AND ${usageLog.source} = 'workflow'
      ), 0)`,
    })
    .from(workflowExecutionLogs)
    .where(and(...conditions))
    .orderBy(desc(workflowExecutionLogs.startedAt))
    .limit(limit)

  return rows.map((row) => {
    const costTotal = row.costTotal != null ? parseDecimal(row.costTotal) : null
    const ledgerSum = parseDecimal(row.ledgerSum)
    return {
      executionId: row.executionId,
      workflowId: row.workflowId,
      workspaceId: row.workspaceId,
      startedAt: row.startedAt,
      status: row.status,
      trigger: row.trigger,
      stateSnapshotId: row.stateSnapshotId,
      costTotal,
      ledgerSum,
      drift: (costTotal ?? 0) - ledgerSum,
      modelsUsed: row.modelsUsed,
    }
  })
}

async function loadLedgerLines(executionId: string): Promise<LedgerLineSummary[]> {
  const rows = await db
    .select({
      category: usageLog.category,
      description: usageLog.description,
      cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.executionId, executionId), eq(usageLog.source, 'workflow')))
    .groupBy(usageLog.category, usageLog.description)
    .orderBy(asc(usageLog.category), asc(usageLog.description))

  return rows.map((row) => ({
    category: row.category,
    description: row.description,
    cost: parseDecimal(row.cost),
  }))
}

async function loadMothershipLedgerSum(executionId: string): Promise<number> {
  const [row] = await db
    .select({ cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)` })
    .from(usageLog)
    .where(
      and(
        eq(usageLog.parentExecutionId, executionId),
        eq(usageLog.source, 'mothership_block')
      )
    )

  return parseDecimal(row?.cost)
}

/**
 * Loads reconciliation evidence for a single workflow execution, including
 * materialized trace spans and snapshot cost-block presence.
 */
export async function loadExecutionEvidence(executionId: string): Promise<ExecutionEvidence | null> {
  const [row] = await db
    .select({
      executionId: workflowExecutionLogs.executionId,
      workflowId: workflowExecutionLogs.workflowId,
      workspaceId: workflowExecutionLogs.workspaceId,
      startedAt: workflowExecutionLogs.startedAt,
      status: workflowExecutionLogs.status,
      trigger: workflowExecutionLogs.trigger,
      stateSnapshotId: workflowExecutionLogs.stateSnapshotId,
      costTotal: workflowExecutionLogs.costTotal,
      modelsUsed: workflowExecutionLogs.modelsUsed,
      executionData: workflowExecutionLogs.executionData,
      snapshotStateData: workflowExecutionSnapshots.stateData,
    })
    .from(workflowExecutionLogs)
    .leftJoin(
      workflowExecutionSnapshots,
      eq(workflowExecutionSnapshots.id, workflowExecutionLogs.stateSnapshotId)
    )
    .where(eq(workflowExecutionLogs.executionId, executionId))
    .limit(1)

  if (!row) return null

  const executionData = (row.executionData ?? {}) as Record<string, unknown>
  const billingFlags = readBillingReconciliationFlags(executionData)
  const traceStoreExternalized = isLargeValueRef(executionData[TRACE_STORE_REF_KEY])

  let materializedData: Record<string, unknown> = executionData
  try {
    materializedData = await materializeExecutionData(executionData, {
      workspaceId: row.workspaceId,
      workflowId: row.workflowId,
      executionId: row.executionId,
    })
  } catch (error) {
    logger.warn('Failed to materialize execution data for reconciliation evidence', {
      executionId,
      error: getErrorMessage(error),
    })
  }

  const inlineTraceSpanCount =
    typeof executionData.traceSpanCount === 'number' ? executionData.traceSpanCount : 0
  const inlineHasTraceSpans = executionData.hasTraceSpans === true
  const traceSpans = materializedData.traceSpans as TraceSpanLike[] | undefined
  const trace = analyzeTraceSpans(traceSpans)

  trace.traceStoreExternalized = traceStoreExternalized
  trace.traceStoreMaterialized = traceSpans != null
  trace.traceSpanCount = Math.max(
    trace.traceSpanCount,
    inlineTraceSpanCount,
    traceSpans?.length ?? 0
  )
  trace.hasTraceSpans = trace.hasTraceSpans || inlineHasTraceSpans
  trace.traceStoreExpired =
    traceStoreExternalized &&
    !trace.hasTraceSpans &&
    (inlineHasTraceSpans || inlineTraceSpanCount > 0)

  const [ledgerLines, mothershipLedgerSum, ledgerSumRow] = await Promise.all([
    loadLedgerLines(executionId),
    loadMothershipLedgerSum(executionId),
    db
      .select({ cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)` })
      .from(usageLog)
      .where(and(eq(usageLog.executionId, executionId), eq(usageLog.source, 'workflow'))),
  ])

  const ledgerSum = parseDecimal(ledgerSumRow[0]?.cost)
  const costTotal = row.costTotal != null ? parseDecimal(row.costTotal) : null
  const snapshotState = row.snapshotStateData as WorkflowState | null | undefined

  return {
    executionId: row.executionId,
    workflowId: row.workflowId,
    workspaceId: row.workspaceId,
    startedAt: row.startedAt,
    status: row.status,
    trigger: row.trigger,
    stateSnapshotId: row.stateSnapshotId,
    costTotal,
    ledgerSum,
    drift: (costTotal ?? 0) - ledgerSum,
    billingReconciliationPending: billingFlags.pending,
    billingReconciliationReason: billingFlags.reason,
    ledgerLines,
    mothershipLedgerSum,
    trace,
    hasSnapshot: snapshotState != null,
    snapshotHasCostBlocks: snapshotStateHasCostBlocks(snapshotState),
    snapshotState: snapshotState ?? null,
    traceSpans,
    modelsUsed: row.modelsUsed,
  }
}

/**
 * Classifies a batch of historical workflow executions for audit and rollout planning.
 */
export async function auditHistoricalWorkflowExecutions(
  filter: HistoricalExecutionFilter = {}
): Promise<ReconciliationAuditSummary> {
  const rows = await listHistoricalWorkflowExecutions(filter)
  const classifications: ExecutionClassification[] = []

  for (const row of rows) {
    try {
      const evidence = await loadExecutionEvidence(row.executionId)
      if (!evidence) continue
      classifications.push(classifyExecutionEvidence(evidence))
    } catch (error) {
      logger.warn('Failed to classify execution', {
        executionId: row.executionId,
        error: getErrorMessage(error),
      })
    }
  }

  return aggregateClassificationResults(classifications)
}

function extractSubBlockValues(
  subBlocks: Record<string, { value?: unknown } | null | undefined>
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(subBlocks)) {
    if (entry && typeof entry === 'object' && 'value' in entry) {
      values[key] = entry.value
    }
  }
  return values
}

function workflowSnapshotToGraph(state: WorkflowState): {
  blocks: SerializedBlock[]
  connections: SerializedConnection[]
} {
  const blocks = Object.values(state.blocks).map((block) => ({
    id: block.id,
    position: block.position,
    config: {
      tool: block.type,
      params: extractSubBlockValues(block.subBlocks),
    },
    inputs: {},
    outputs: {},
    enabled: block.enabled,
    metadata: { id: block.type, name: block.name },
  }))

  const connections = state.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  }))

  return { blocks, connections }
}

function buildSnapshotExecutionContext(params: {
  workflowId: string
  graph: { blocks: SerializedBlock[]; connections: SerializedConnection[] }
  blockStates: Map<string, BlockState>
  blockLogs: BlockLog[]
}): ExecutionContext {
  const serializedWorkflow: SerializedWorkflow = {
    version: '1',
    blocks: params.graph.blocks,
    connections: params.graph.connections,
    loops: {},
    parallels: {},
  }

  return {
    workflowId: params.workflowId,
    blockStates: params.blockStates,
    blockLogs: params.blockLogs,
    metadata: { duration: 0 },
    environmentVariables: {},
    decisions: { router: new Map(), condition: new Map() },
    loopExecutions: new Map(),
    completedLoops: new Set(),
    executedBlocks: new Set(params.blockStates.keys()),
    activeExecutionPath: new Set(),
    workflow: serializedWorkflow,
  }
}

function cloneTraceSpans(spans: TraceSpanLike[] | undefined): TraceSpanLike[] | undefined {
  if (!spans) return undefined
  return structuredClone(spans)
}

function readSpanTokenCounts(span: TraceSpanLike): {
  input: number
  output: number
  total: number
} {
  const tokens = span.tokens
  const input = tokens?.input ?? tokens?.prompt ?? 0
  const output = tokens?.output ?? tokens?.completion ?? 0
  const total = tokens?.total ?? input + output
  return { input, output, total }
}

function computeStandaloneToolCost(span: TraceSpanLike): {
  cost: number
  reason: string
  evidenceSource: string
} | null {
  if (span.type !== 'tool' || !span.output) return null

  const output = span.output
  const metadata = output.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const creditsUsed = (metadata as { creditsUsed?: unknown }).creditsUsed
    if (typeof creditsUsed === 'number' && creditsUsed > 0) {
      return {
        cost: creditsUsed * 0.001,
        reason: 'firecrawl_credits',
        evidenceSource: 'firecrawl_credits',
      }
    }
  }

  if (typeof output.__falaiCostDollars === 'number' && output.__falaiCostDollars > 0) {
    return {
      cost: output.__falaiCostDollars * FALAI_HOSTED_KEY_MARKUP_MULTIPLIER,
      reason: 'falai_cost_dollars',
      evidenceSource: 'falai_cost_dollars',
    }
  }

  if (output.__imageBilling) {
    try {
      const { cost } = calculateHostedImageToolCost({}, output)
      return {
        cost,
        reason: 'image_billing',
        evidenceSource: 'image_billing',
      }
    } catch {
      return null
    }
  }

  const outputCost = getSpanToolOutputCost(span)
  if (outputCost > 0) {
    return {
      cost: outputCost,
      reason: 'tool_output_cost',
      evidenceSource: 'tool_output_cost',
    }
  }

  return null
}

/**
 * Enriches cost-stripped trace spans with repriced model, tool, and embedded-tool costs.
 */
export function enrichTraceSpansForReprice(
  traceSpans: TraceSpanLike[] | undefined
): TraceSpanLike[] | undefined {
  const cloned = cloneTraceSpans(traceSpans)
  if (!cloned) return undefined

  const visit = (span: TraceSpanLike, underAgent: boolean) => {
    const isAgent = span.type === 'agent' || Boolean(span.model)
    const nextUnderAgent = underAgent || isAgent

    if (!hasInlineSpanCost(span)) {
      if (span.model && hasTokenCounts(span) && shouldBillModelUsage(span.model)) {
        const { input, output } = readSpanTokenCounts(span)
        const modelCost = resolveBlockModelCost({
          model: span.model,
          promptTokens: input,
          completionTokens: output,
        })
        span.cost = {
          input: modelCost.input,
          output: modelCost.output,
          total: modelCost.total,
        }
      } else if (span.type === 'tool' && !underAgent) {
        const toolCost = computeStandaloneToolCost(span)
        if (toolCost) {
          span.cost = { total: toolCost.cost }
        }
      }
    }

    if (isAgent && (!hasInlineSpanCost(span) || (span.cost?.toolCost ?? 0) <= 0)) {
      const embeddedRaw = extractEmbeddedToolCostsFromSpan(span)
      const embeddedTotal = Object.values(embeddedRaw).reduce((sum, value) => sum + value, 0)
      if (embeddedTotal > 0) {
        const toolCost = embeddedTotal
        const normalized = normalizeEmbeddedToolCosts(embeddedRaw, toolCost)
        const normalizedTotal = Object.values(normalized).reduce((sum, value) => sum + value, 0)
        const baseTotal = span.cost?.total ?? 0
        span.cost = {
          ...(span.cost ?? {}),
          input: span.cost?.input ?? 0,
          output: span.cost?.output ?? 0,
          toolCost: normalizedTotal,
          total: baseTotal + normalizedTotal,
        }
      }
    }

    span.children?.forEach((child) => visit(child, nextUnderAgent))
  }

  for (const span of cloned) {
    visit(span, false)
  }

  return cloned
}

async function computeSnapshotCostBlockTargets(params: {
  workflowId: string
  snapshotState: WorkflowState
  traceSpans: TraceSpanLike[] | undefined
  warnings: string[]
}): Promise<ReconciliationTargetLine[]> {
  const costBlockIds = Object.values(params.snapshotState.blocks)
    .filter((block) => block.type === BlockType.COST)
    .map((block) => block.id)

  if (costBlockIds.length === 0 || !params.traceSpans?.length) {
    return []
  }

  const graph = workflowSnapshotToGraph(params.snapshotState)
  const { blockStates, blockLogs } = collectTraceExecutionArtifacts(params.traceSpans)
  const ctx = buildSnapshotExecutionContext({
    workflowId: params.workflowId,
    graph,
    blockStates,
    blockLogs,
  })

  const handler = new CostBlockHandler()
  const targets: ReconciliationTargetLine[] = []

  for (const costBlockId of costBlockIds) {
    const costBlock = graph.blocks.find((block) => block.id === costBlockId)
    if (!costBlock || costBlock.metadata?.id !== BlockType.COST) {
      continue
    }

    const mode = String(costBlock.config.params.mode ?? 'fixed')
    if (mode === 'expression') {
      params.warnings.push(`expression_cost_block_skipped:${costBlockId}`)
      continue
    }

    const inputs = { ...costBlock.config.params }
    const output = await handler.executeWithNode(ctx, costBlock, inputs, {
      nodeId: costBlockId,
    })

    if (!output.recorded || !output.cost?.total || output.cost.total <= RECONCILIATION_EPSILON) {
      continue
    }

    const raw = (output.raw ?? {}) as Record<string, unknown>
    const description = resolveExternalDescription(costBlock.metadata?.name ?? costBlockId, raw)

    targets.push({
      category: 'external',
      description,
      target: output.cost.total,
      reason: 'cost_block_snapshot',
      evidenceSource: 'cost_block_snapshot',
      vendor: typeof raw.vendor === 'string' ? raw.vendor : undefined,
      quantity: typeof raw.quantity === 'number' ? raw.quantity : output.units,
      unit: typeof raw.unit === 'string' ? raw.unit : undefined,
      metadata: {
        ...(typeof raw.amount === 'number' ? { originalAmount: raw.amount } : {}),
        ...(typeof raw.currency === 'string' ? { originalCurrency: raw.currency } : {}),
        ...(typeof raw.exchangeRate === 'number' ? { exchangeRate: raw.exchangeRate } : {}),
        ...(typeof raw.sourceBlockId === 'string' ? { sourceBlockId: raw.sourceBlockId } : {}),
        ...(typeof raw.responsePath === 'string' ? { responsePath: raw.responsePath } : {}),
        ...(typeof raw.quantityPath === 'string' ? { quantityPath: raw.quantityPath } : {}),
        ...(typeof raw.unitPrice === 'number' ? { unitPrice: raw.unitPrice } : {}),
        ...(typeof raw.source === 'string' ? { source: raw.source } : {}),
      },
    })
  }

  return targets
}

function externalChargeToTargetLine(
  description: string,
  charge: CostSummaryExternalCharge,
  evidenceSource: string
): ReconciliationTargetLine {
  return {
    category: 'external',
    description,
    target: charge.total,
    reason: evidenceSource,
    evidenceSource,
    vendor: charge.vendor,
    quantity: charge.quantity,
    unit: charge.unit,
    metadata: charge.metadata,
  }
}

function mergeTargetLines(lines: ReconciliationTargetLine[]): ReconciliationTargetLine[] {
  const merged = new Map<string, ReconciliationTargetLine>()

  for (const line of lines) {
    const key = ledgerLineKey(line.category, line.description)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...line })
      continue
    }

    existing.target += line.target
    if (!existing.reason && line.reason) existing.reason = line.reason
    if (!existing.evidenceSource && line.evidenceSource) {
      existing.evidenceSource = line.evidenceSource
    }
  }

  return [...merged.values()]
}

/**
 * Computes canonical target ledger lines from execution evidence using trace spans,
 * snapshot state, token repricing, and hosted-tool output metadata.
 */
export async function computeTargetLedgerLines(
  evidence: ExecutionEvidence,
  options: ComputeTargetLedgerOptions = {}
): Promise<{ targets: ReconciliationTargetLine[]; warnings: string[] }> {
  const pricingMode = options.pricingMode ?? HISTORICAL_RECONCILE_PRICING_MODE
  const warnings: string[] = []
  const targets: ReconciliationTargetLine[] = []

  if (
    !evidence.trace.hasTraceSpans &&
    !evidence.snapshotHasCostBlocks &&
  evidence.trace.traceStoreExpired
  ) {
    warnings.push('trace_store_unavailable')
    return { targets, warnings }
  }

  const enrichedSpans = enrichTraceSpansForReprice(evidence.traceSpans)
  const costSummary = calculateCostSummary(enrichedSpans)

  if (costSummary.baseExecutionCharge > 0) {
    targets.push({
      category: 'fixed',
      description: 'execution_fee',
      target: costSummary.baseExecutionCharge,
      reason: 'base_execution_charge',
      evidenceSource: 'base_execution_charge',
    })
  }

  for (const [modelName, modelData] of Object.entries(costSummary.models)) {
    const hasUsage =
      modelData.total > 0 ||
      modelData.tokens.total > 0 ||
      modelData.tokens.input > 0 ||
      modelData.tokens.output > 0
    if (!hasUsage) continue

    const evidenceSource = evidence.trace.spansWithInlineCost > 0
      ? 'legacy_span_cost'
      : 'tokens_repriced'

    targets.push({
      category: 'model',
      description: normalizeUsageModelId(modelName),
      target: modelData.total,
      reason: evidenceSource,
      evidenceSource,
      metadata: {
        inputTokens: modelData.tokens.input,
        outputTokens: modelData.tokens.output,
        ...(modelData.toolCost != null && modelData.toolCost > 0
          ? { toolCost: modelData.toolCost }
          : {}),
        ...(modelData.embeddedToolCosts &&
        Object.keys(modelData.embeddedToolCosts).length > 0
          ? { embeddedToolCosts: modelData.embeddedToolCosts }
          : {}),
      },
    })
  }

  for (const [description, charge] of Object.entries(costSummary.charges)) {
    if (charge.total <= 0) continue
    targets.push({
      category: 'tool',
      description: normalizeUsageToolId(description),
      target: charge.total,
      reason: 'standalone_tool_charge',
      evidenceSource: evidence.trace.spansWithHostedToolMetadata > 0
        ? evidence.trace.hostedToolSignals[0] ?? 'hosted_tool'
        : 'tool_output_cost',
      toolId: normalizeUsageToolId(description),
    })
  }

  for (const [description, charge] of Object.entries(costSummary.external)) {
    if (charge.total <= 0) continue
    targets.push(
      externalChargeToTargetLine(description, charge, 'legacy_span_cost')
    )
  }

  if (
    evidence.snapshotHasCostBlocks &&
    evidence.snapshotState &&
    evidence.workflowId &&
    Object.keys(costSummary.external).length === 0
  ) {
    const snapshotTargets = await computeSnapshotCostBlockTargets({
      workflowId: evidence.workflowId,
      snapshotState: evidence.snapshotState,
      traceSpans: enrichedSpans,
      warnings,
    })
    targets.push(...snapshotTargets)
  }

  if (targets.length === 0 && !evidence.trace.hasTraceSpans) {
    warnings.push('unrecoverable')
  }

  if (pricingMode !== HISTORICAL_RECONCILE_PRICING_MODE) {
    warnings.push(`unsupported_pricing_mode:${pricingMode}`)
  }

  return {
    targets: mergeTargetLines(targets),
    warnings,
  }
}

function buildShadowRecord(params: {
  evidence: ExecutionEvidence
  classification: ExecutionClassification
  targets: ReconciliationTargetLine[]
  warnings: string[]
  pricingMode?: HistoricalReconcilePricingMode
}): HistoricalReconcileShadowRecord {
  const alreadyBilled = new Map(
    params.evidence.ledgerLines.map((line) => [
      ledgerLineKey(line.category, line.description),
      line.cost,
    ])
  )

  const adjustment = buildHistoricalAdjustmentEntries({
    executionId: params.evidence.executionId,
    targets: params.targets,
    alreadyBilled,
    pricingMode: params.pricingMode,
  })

  const targetSum =
    params.targets.reduce((sum, line) => sum + line.target, 0) ||
    (params.evidence.trace.hasTraceSpans ? BASE_EXECUTION_CHARGE : 0)

  return {
    executionId: params.evidence.executionId,
    workflowId: params.evidence.workflowId,
    workspaceId: params.evidence.workspaceId,
    startedAt: params.evidence.startedAt.toISOString(),
    status: params.evidence.status,
    ledgerSum: params.evidence.ledgerSum,
    ledgerLines: params.evidence.ledgerLines,
    costTotal: params.evidence.costTotal,
    targetSum,
    positiveDelta: adjustment.positiveDeltaTotal,
    negativeDelta: adjustment.negativeDeltaTotal,
    confidence: params.classification.confidence,
    applyEligible: params.classification.applyEligible,
    primaryClass: params.classification.primaryClass,
    warnings: [...new Set([...params.classification.warnings, ...params.warnings])],
    blockers: params.classification.blockers,
    targets: params.targets,
    pricingMode: params.pricingMode ?? HISTORICAL_RECONCILE_PRICING_MODE,
  }
}

/**
 * Computes a single execution's shadow repricing artifact without writing to the ledger.
 */
export async function computeShadowRepriceForExecution(
  executionId: string,
  options: ComputeTargetLedgerOptions = {}
): Promise<HistoricalReconcileShadowRecord | null> {
  const evidence = await loadExecutionEvidence(executionId)
  if (!evidence) return null

  const classification = classifyExecutionEvidence(evidence)
  const { targets, warnings } = await computeTargetLedgerLines(evidence, options)

  return buildShadowRecord({
    evidence,
    classification,
    targets,
    warnings,
    pricingMode: options.pricingMode,
  })
}

/**
 * Dry-run batch shadow repricer for historical workflow executions.
 */
export async function dryRunHistoricalWorkflowReprices(
  filter: HistoricalExecutionFilter = {},
  options: ComputeTargetLedgerOptions = {}
): Promise<ShadowRepriceSummary> {
  const rows = await listHistoricalWorkflowExecutions(filter)
  const records: HistoricalReconcileShadowRecord[] = []

  for (const row of rows) {
    try {
      const record = await computeShadowRepriceForExecution(row.executionId, options)
      if (record) records.push(record)
    } catch (error) {
      logger.warn('Failed to shadow-reprice execution', {
        executionId: row.executionId,
        error: getErrorMessage(error),
      })
    }
  }

  let withPositiveDelta = 0
  let withNegativeDelta = 0
  let totalPositiveDelta = 0
  let totalNegativeDelta = 0

  for (const record of records) {
    if (record.positiveDelta > RECONCILIATION_EPSILON) withPositiveDelta += 1
    if (record.negativeDelta > RECONCILIATION_EPSILON) withNegativeDelta += 1
    totalPositiveDelta += record.positiveDelta
    totalNegativeDelta += record.negativeDelta
  }

  return {
    total: records.length,
    withTargets: records.filter((record) => record.targets.length > 0).length,
    withPositiveDelta,
    withNegativeDelta,
    totalPositiveDelta,
    totalNegativeDelta,
    records,
  }
}

function ledgerLineKey(category: string, description: string): string {
  return `${category}::${description}`
}

/**
 * Builds append-only positive adjustment rows for a historical reconciliation apply.
 * Negative deltas are reported in the result but never emitted as ledger entries.
 */
export function buildHistoricalAdjustmentEntries(params: {
  executionId: string
  targets: ReconciliationTargetLine[]
  alreadyBilled: Map<string, number>
  pricingMode?: HistoricalReconcilePricingMode
}): HistoricalAdjustmentBuildResult {
  const pricingMode = params.pricingMode ?? HISTORICAL_RECONCILE_PRICING_MODE
  const entries: UsageEntry[] = []
  const skippedNegativeLines: HistoricalAdjustmentBuildResult['skippedNegativeLines'] = []
  let positiveDeltaTotal = 0
  let negativeDeltaTotal = 0

  for (const line of params.targets) {
    const key = ledgerLineKey(line.category, line.description)
    const billed = params.alreadyBilled.get(key) ?? 0
    const delta = line.target - billed

    if (delta < -RECONCILIATION_EPSILON) {
      negativeDeltaTotal += Math.abs(delta)
      skippedNegativeLines.push({
        category: line.category,
        description: line.description,
        target: line.target,
        billed,
        delta,
      })
      continue
    }

    if (delta <= RECONCILIATION_EPSILON) {
      continue
    }

    positiveDeltaTotal += delta
    entries.push({
      category: line.category,
      source: 'workflow',
      description: line.description,
      cost: delta,
      rawCost: delta,
      billableCost: delta,
      metadata: {
        ...(line.metadata && typeof line.metadata === 'object' && !Array.isArray(line.metadata)
          ? line.metadata
          : {}),
        backfill: HISTORICAL_RECONCILE_VERSION,
        repricedTarget: line.target,
        billedBefore: billed,
        ...(line.reason ? { reconcileReason: line.reason } : {}),
        ...(line.evidenceSource ? { evidenceSource: line.evidenceSource } : {}),
      },
      eventKey: stableEventKey({
        backfill: HISTORICAL_RECONCILE_VERSION,
        executionId: params.executionId,
        category: line.category,
        description: line.description,
        billedBefore: billed.toFixed(8),
        target: line.target.toFixed(8),
        pricingMode,
      }),
      ...(line.toolId ? { toolId: line.toolId } : {}),
      ...(line.vendor ? { vendor: line.vendor } : {}),
      ...(line.quantity != null ? { quantity: line.quantity } : {}),
      ...(line.unit ? { unit: line.unit } : {}),
      ...(line.pricingSnapshot ? { pricingSnapshot: line.pricingSnapshot } : {}),
      ...(line.category === 'tool' && !line.toolId ? { toolId: line.description } : {}),
      ...(line.category === 'model' && line.metadata
        ? {
            quantity:
              ((line.metadata as { inputTokens?: number }).inputTokens ?? 0) +
              ((line.metadata as { outputTokens?: number }).outputTokens ?? 0),
            unit: 'tokens',
          }
        : {}),
    })
  }

  return {
    entries,
    positiveDeltaTotal,
    negativeDeltaTotal,
    skippedNegativeLines,
  }
}

async function loadAlreadyBilledWorkflowLedger(
  executionId: string,
  executor: Pick<typeof db, 'select'> = db
): Promise<Map<string, number>> {
  const rows = await executor
    .select({
      category: usageLog.category,
      description: usageLog.description,
      cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.executionId, executionId), eq(usageLog.source, 'workflow')))
    .groupBy(usageLog.category, usageLog.description)

  const alreadyBilled = new Map<string, number>()
  for (const row of rows) {
    alreadyBilled.set(ledgerLineKey(row.category, row.description), parseDecimal(row.cost))
  }
  return alreadyBilled
}

async function loadWorkflowLedgerSum(
  executionId: string,
  executor: Pick<typeof db, 'select'> = db
): Promise<number> {
  const [row] = await executor
    .select({ cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)` })
    .from(usageLog)
    .where(and(eq(usageLog.executionId, executionId), eq(usageLog.source, 'workflow')))

  return parseDecimal(row?.cost)
}

/**
 * Resolves the billing user for a workflow execution, preferring the execution log
 * attribution and falling back to the workflow owner.
 */
export async function resolveExecutionBillingUserId(params: {
  executionId: string
  workflowId?: string | null
}): Promise<string | null> {
  const [executionRow] = await db
    .select({
      userId: workflowExecutionLogs.userId,
      workflowId: workflowExecutionLogs.workflowId,
    })
    .from(workflowExecutionLogs)
    .where(eq(workflowExecutionLogs.executionId, params.executionId))
    .limit(1)

  if (executionRow?.userId) {
    return executionRow.userId
  }

  const workflowId = params.workflowId ?? executionRow?.workflowId
  if (!workflowId) {
    return null
  }

  const [workflowRow] = await db
    .select({ userId: workflow.userId })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)

  return workflowRow?.userId ?? null
}

/**
 * Parses one NDJSON shadow artifact line produced by the reconciliation dry-run.
 */
export function parseHistoricalReconcileShadowRecord(
  line: string
): HistoricalReconcileShadowRecord | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Partial<HistoricalReconcileShadowRecord>
    if (
      typeof parsed.executionId !== 'string' ||
      typeof parsed.workspaceId !== 'string' ||
      typeof parsed.startedAt !== 'string' ||
      !Array.isArray(parsed.targets)
    ) {
      return null
    }

    return {
      executionId: parsed.executionId,
      workflowId: parsed.workflowId ?? null,
      workspaceId: parsed.workspaceId,
      startedAt: parsed.startedAt,
      status: parsed.status ?? 'unknown',
      ledgerSum: typeof parsed.ledgerSum === 'number' ? parsed.ledgerSum : 0,
      ledgerLines: Array.isArray(parsed.ledgerLines)
        ? parsed.ledgerLines.filter(
            (line): line is LedgerLineSummary =>
              line != null &&
              typeof line === 'object' &&
              typeof (line as LedgerLineSummary).category === 'string' &&
              typeof (line as LedgerLineSummary).description === 'string' &&
              typeof (line as LedgerLineSummary).cost === 'number'
          )
        : [],
      costTotal: typeof parsed.costTotal === 'number' ? parsed.costTotal : null,
      targetSum: typeof parsed.targetSum === 'number' ? parsed.targetSum : 0,
      positiveDelta: typeof parsed.positiveDelta === 'number' ? parsed.positiveDelta : 0,
      negativeDelta: typeof parsed.negativeDelta === 'number' ? parsed.negativeDelta : 0,
      confidence: parsed.confidence ?? 'low',
      applyEligible: parsed.applyEligible === true,
      primaryClass: parsed.primaryClass ?? 'missing_trace_data',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
      targets: parsed.targets,
      pricingMode: parsed.pricingMode ?? HISTORICAL_RECONCILE_PRICING_MODE,
    }
  } catch {
    return null
  }
}

/**
 * Applies one gated historical reconciliation record: positive append-only ledger
 * adjustments plus an exact `cost_total` refresh from the workflow ledger sum.
 */
export async function applyHistoricalReconciliation(params: {
  record: HistoricalReconcileShadowRecord
  userId: string
  requireEligible?: boolean
}): Promise<ApplyHistoricalReconciliationResult> {
  const { record, userId } = params
  const requireEligible = params.requireEligible ?? true

  if (requireEligible && !record.applyEligible) {
    return {
      executionId: record.executionId,
      status: 'skipped',
      reason: 'not_apply_eligible',
      entriesInserted: 0,
      positiveDeltaApplied: 0,
      negativeDeltaSkipped: record.negativeDelta,
      ledgerSumBefore: record.ledgerSum,
      ledgerSumAfter: record.ledgerSum,
      costTotalBefore: record.costTotal,
      costTotalAfter: record.costTotal ?? record.ledgerSum,
    }
  }

  if (record.blockers.length > 0) {
    return {
      executionId: record.executionId,
      status: 'skipped',
      reason: `blocked:${record.blockers.join(',')}`,
      entriesInserted: 0,
      positiveDeltaApplied: 0,
      negativeDeltaSkipped: record.negativeDelta,
      ledgerSumBefore: record.ledgerSum,
      ledgerSumAfter: record.ledgerSum,
      costTotalBefore: record.costTotal,
      costTotalAfter: record.costTotal ?? record.ledgerSum,
    }
  }

  const billingContext = deriveBillingContext(
    userId,
    await getHighestPrioritySubscription(userId)
  )

  const startedAt = new Date(record.startedAt)
  if (Number.isNaN(startedAt.getTime())) {
    return {
      executionId: record.executionId,
      status: 'error',
      reason: 'invalid_started_at',
      entriesInserted: 0,
      positiveDeltaApplied: 0,
      negativeDeltaSkipped: record.negativeDelta,
      ledgerSumBefore: record.ledgerSum,
      ledgerSumAfter: record.ledgerSum,
      costTotalBefore: record.costTotal,
      costTotalAfter: record.costTotal ?? record.ledgerSum,
    }
  }

  try {
    let ledgerSumBefore = record.ledgerSum
    let entriesInserted = 0
    let positiveDeltaApplied = 0
    let negativeDeltaSkipped = 0
    let ledgerSumAfter = record.ledgerSum
    let costTotalAfter = record.costTotal ?? record.ledgerSum

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('lock_timeout', ${`${HISTORICAL_RECONCILE_LOCK_TIMEOUT_MS}ms`}, true)`
      )
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${record.executionId}, 0))`
      )

      const alreadyBilled = await loadAlreadyBilledWorkflowLedger(record.executionId, tx)
      ledgerSumBefore = await loadWorkflowLedgerSum(record.executionId, tx)

      const adjustment = buildHistoricalAdjustmentEntries({
        executionId: record.executionId,
        targets: record.targets,
        alreadyBilled,
        pricingMode: record.pricingMode,
      })

      negativeDeltaSkipped = adjustment.negativeDeltaTotal

      if (adjustment.entries.length > 0) {
        await recordUsage({
          userId,
          entries: adjustment.entries,
          workspaceId: record.workspaceId,
          workflowId: record.workflowId ?? undefined,
          executionId: record.executionId,
          occurredAt: startedAt,
          tx,
          billingEntity: billingContext.billingEntity,
          billingPeriod: billingContext.billingPeriod,
        })
        entriesInserted = adjustment.entries.length
        positiveDeltaApplied = adjustment.positiveDeltaTotal
      }

      ledgerSumAfter = await loadWorkflowLedgerSum(record.executionId, tx)
      costTotalAfter = ledgerSumAfter

      await tx
        .update(workflowExecutionLogs)
        .set({ costTotal: ledgerSumAfter.toString() })
        .where(eq(workflowExecutionLogs.executionId, record.executionId))
    })

    const status: HistoricalReconcileApplyStatus =
      entriesInserted > 0 ? 'applied' : 'unchanged'

    return {
      executionId: record.executionId,
      status,
      entriesInserted,
      positiveDeltaApplied,
      negativeDeltaSkipped,
      ledgerSumBefore,
      ledgerSumAfter,
      costTotalBefore: record.costTotal,
      costTotalAfter,
    }
  } catch (error) {
    const isLockTimeout = getPostgresErrorCode(error) === '55P03'
    logger.error('Failed to apply historical reconciliation', {
      executionId: record.executionId,
      error: getErrorMessage(error),
      lockTimeout: isLockTimeout,
    })

    return {
      executionId: record.executionId,
      status: 'error',
      reason: isLockTimeout ? 'advisory_lock_timeout' : getErrorMessage(error, 'apply_failed'),
      entriesInserted: 0,
      positiveDeltaApplied: 0,
      negativeDeltaSkipped: record.negativeDelta,
      ledgerSumBefore: record.ledgerSum,
      ledgerSumAfter: record.ledgerSum,
      costTotalBefore: record.costTotal,
      costTotalAfter: record.costTotal ?? record.ledgerSum,
    }
  }
}

export interface ApplyHistoricalReconciliationBatchFilter {
  workflowId?: string
  executionId?: string
  workspaceId?: string
  limit?: number
}

/**
 * Applies a batch of shadow artifact records with optional CLI filters.
 */
export async function applyHistoricalReconciliationBatch(params: {
  records: HistoricalReconcileShadowRecord[]
  filter?: ApplyHistoricalReconciliationBatchFilter
  requireEligible?: boolean
}): Promise<ApplyHistoricalReconciliationBatchResult> {
  const filter = params.filter ?? {}
  const requireEligible = params.requireEligible ?? true

  let candidates = params.records
  if (filter.workflowId) {
    candidates = candidates.filter((record) => record.workflowId === filter.workflowId)
  }
  if (filter.executionId) {
    candidates = candidates.filter((record) => record.executionId === filter.executionId)
  }
  if (filter.workspaceId) {
    candidates = candidates.filter((record) => record.workspaceId === filter.workspaceId)
  }
  if (filter.limit != null && filter.limit > 0) {
    candidates = candidates.slice(0, filter.limit)
  }

  const results: ApplyHistoricalReconciliationResult[] = []
  let applied = 0
  let unchanged = 0
  let skipped = 0
  let errors = 0
  let totalPositiveDeltaApplied = 0
  let totalNegativeDeltaSkipped = 0

  for (const record of candidates) {
    const userId = await resolveExecutionBillingUserId({
      executionId: record.executionId,
      workflowId: record.workflowId,
    })

    if (!userId) {
      results.push({
        executionId: record.executionId,
        status: 'error',
        reason: 'billing_user_not_found',
        entriesInserted: 0,
        positiveDeltaApplied: 0,
        negativeDeltaSkipped: record.negativeDelta,
        ledgerSumBefore: record.ledgerSum,
        ledgerSumAfter: record.ledgerSum,
        costTotalBefore: record.costTotal,
        costTotalAfter: record.costTotal ?? record.ledgerSum,
      })
      errors += 1
      continue
    }

    const result = await applyHistoricalReconciliation({
      record,
      userId,
      requireEligible,
    })
    results.push(result)

    if (result.status === 'applied') {
      applied += 1
      totalPositiveDeltaApplied += result.positiveDeltaApplied
    } else if (result.status === 'unchanged') {
      unchanged += 1
    } else if (result.status === 'skipped') {
      skipped += 1
    } else {
      errors += 1
    }

    totalNegativeDeltaSkipped += result.negativeDeltaSkipped
  }

  return {
    processed: results.length,
    applied,
    unchanged,
    skipped,
    errors,
    totalPositiveDeltaApplied,
    totalNegativeDeltaSkipped,
    results,
  }
}

/**
 * Loads NDJSON shadow artifact records from disk for gated apply.
 */
export async function loadHistoricalReconcileShadowArtifact(
  inputPath: string
): Promise<HistoricalReconcileShadowRecord[]> {
  const file = Bun.file(inputPath)
  if (!(await file.exists())) {
    throw new Error(`Shadow artifact not found: ${inputPath}`)
  }

  const text = await file.text()
  const records: HistoricalReconcileShadowRecord[] = []

  for (const line of text.split('\n')) {
    const record = parseHistoricalReconcileShadowRecord(line)
    if (record) {
      records.push(record)
    }
  }

  return records
}

/** Maximum apply batch size treated as a pilot scope without `--confirm-production`. */
export const HISTORICAL_RECONCILE_PILOT_MAX_RECORDS = 100

export type HistoricalReconcileRolloutPhase = 'pilot' | 'production'

export interface HistoricalReconcileRolloutStep {
  step: number
  name: string
  description: string
  command: string
}

/**
 * Ordered ops rollout sequence for historical workflow cost reconciliation.
 * Run each step in order; do not skip straight to production apply.
 */
export const HISTORICAL_RECONCILE_ROLLOUT_STEPS: HistoricalReconcileRolloutStep[] = [
  {
    step: 1,
    name: 'baseline_audit',
    description:
      'Measure current ledger vs cost_total drift and inventory usage_log health across all history.',
    command:
      'bun --env-file=apps/sim/.env run scripts/phase0-arena-cost-audit.ts --days=9999 --limit=100000 --export-drift',
  },
  {
    step: 2,
    name: 'evidence_audit',
    description:
      'Classify terminal workflow runs by reconciliation evidence, confidence, and apply eligibility.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --audit --since=2020-01-01 --batch-size=1000',
  },
  {
    step: 3,
    name: 'staging_shadow',
    description:
      'Compute shadow target ledger lines and export an NDJSON artifact for human review on staging.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --dry-run --since=2020-01-01 --batch-size=1000 --export=reconcile-shadow.ndjson',
  },
  {
    step: 4,
    name: 'delta_review',
    description:
      'Review positive/negative deltas by workspace, workflow, model, and tool before any writes.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --dry-run --since=2020-01-01 --batch-size=1000 --export=reconcile-shadow.ndjson --review-deltas',
  },
  {
    step: 5,
    name: 'pilot_apply',
    description:
      'Apply append-only adjustments for one workspace or narrow date range, then verify projection.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --apply --input=reconcile-shadow.ndjson --workspace-id=<workspace-id> --batch-size=100',
  },
  {
    step: 6,
    name: 'post_pilot_verify',
    description:
      'Re-run drift audit and ledger projection verification for the pilot workspace.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --verify --workspace-id=<workspace-id> --batch-size=1000',
  },
  {
    step: 7,
    name: 'production_apply',
    description:
      'Apply in small production batches only after pilot verification passes.',
    command:
      'bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --apply --input=reconcile-shadow.ndjson --batch-size=500 --confirm-production',
  },
  {
    step: 8,
    name: 'final_verify',
    description: 'Confirm cost_total equals workflow ledger sums after the full rollout.',
    command:
      'bun --env-file=apps/sim/.env run scripts/phase0-arena-cost-audit.ts --days=9999 --limit=100000 --drift-only',
  },
]

export interface LedgerProjectionDriftCase {
  executionId: string
  workflowId: string | null
  workspaceId: string
  startedAt: Date
  status: string
  costTotal: number | null
  ledgerSum: number
  drift: number
}

export interface LedgerProjectionVerification {
  total: number
  drifted: number
  passed: boolean
  driftExamples: LedgerProjectionDriftCase[]
}

export interface ShadowDeltaBucket {
  id: string
  executions: number
  positiveDelta: number
  negativeDelta: number
  applyEligible: number
}

export interface ShadowDeltaAttributionBucket {
  description: string
  category: UsageLogCategory
  positiveDelta: number
  executions: number
}

export interface ShadowDeltaReviewBreakdown {
  totals: {
    executions: number
    applyEligible: number
    positiveDelta: number
    negativeDelta: number
  }
  byWorkspace: ShadowDeltaBucket[]
  byWorkflow: ShadowDeltaBucket[]
  byModel: ShadowDeltaAttributionBucket[]
  byTool: ShadowDeltaAttributionBucket[]
}

export interface ApplyRolloutGateResult {
  allowed: boolean
  phase: HistoricalReconcileRolloutPhase
  blockers: string[]
  warnings: string[]
}

export interface PostApplyVerificationResult {
  executionId: string
  passed: boolean
  costTotal: number | null
  ledgerSum: number
  drift: number
}

export interface PostApplyVerificationSummary {
  total: number
  passed: number
  failed: number
  results: PostApplyVerificationResult[]
}

function ledgerLinesToBilledMap(lines: LedgerLineSummary[]): Map<string, number> {
  return new Map(
    lines.map((line) => [ledgerLineKey(line.category, line.description), line.cost])
  )
}

function upsertShadowDeltaBucket(
  buckets: Map<string, ShadowDeltaBucket>,
  id: string,
  record: HistoricalReconcileShadowRecord
): void {
  const existing = buckets.get(id) ?? {
    id,
    executions: 0,
    positiveDelta: 0,
    negativeDelta: 0,
    applyEligible: 0,
  }

  existing.executions += 1
  existing.positiveDelta += record.positiveDelta
  existing.negativeDelta += record.negativeDelta
  if (record.applyEligible) existing.applyEligible += 1
  buckets.set(id, existing)
}

function upsertAttributionBucket(
  buckets: Map<string, ShadowDeltaAttributionBucket>,
  category: UsageLogCategory,
  description: string,
  positiveDelta: number
): void {
  if (positiveDelta <= RECONCILIATION_EPSILON) return

  const key = ledgerLineKey(category, description)
  const existing = buckets.get(key) ?? {
    description,
    category,
    positiveDelta: 0,
    executions: 0,
  }

  existing.executions += 1
  existing.positiveDelta += positiveDelta
  buckets.set(key, existing)
}

function positiveDeltaForTargetLine(params: {
  executionId: string
  targets: ReconciliationTargetLine[]
  alreadyBilled: Map<string, number>
  pricingMode: HistoricalReconcilePricingMode
  category: UsageLogCategory
  description: string
}): number {
  const target = params.targets.find(
    (line) => line.category === params.category && line.description === params.description
  )
  if (!target) return 0

  const adjustment = buildHistoricalAdjustmentEntries({
    executionId: params.executionId,
    targets: [target],
    alreadyBilled: params.alreadyBilled,
    pricingMode: params.pricingMode,
  })

  return adjustment.positiveDeltaTotal
}

/**
 * Aggregates shadow repricing artifacts for pre-apply review by workspace,
 * workflow, model, and hosted tool attribution.
 */
export function aggregateShadowDeltaReview(
  records: HistoricalReconcileShadowRecord[],
  topN = 20
): ShadowDeltaReviewBreakdown {
  const byWorkspace = new Map<string, ShadowDeltaBucket>()
  const byWorkflow = new Map<string, ShadowDeltaBucket>()
  const byModel = new Map<string, ShadowDeltaAttributionBucket>()
  const byTool = new Map<string, ShadowDeltaAttributionBucket>()

  let applyEligible = 0
  let positiveDelta = 0
  let negativeDelta = 0

  for (const record of records) {
    upsertShadowDeltaBucket(byWorkspace, record.workspaceId, record)
    upsertShadowDeltaBucket(
      byWorkflow,
      record.workflowId ?? '(no-workflow)',
      record
    )

    if (record.applyEligible) applyEligible += 1
    positiveDelta += record.positiveDelta
    negativeDelta += record.negativeDelta

    const alreadyBilled = ledgerLinesToBilledMap(record.ledgerLines ?? [])
    for (const line of record.targets) {
      const linePositiveDelta = positiveDeltaForTargetLine({
        executionId: record.executionId,
        targets: record.targets,
        alreadyBilled,
        pricingMode: record.pricingMode,
        category: line.category,
        description: line.description,
      })
      if (line.category === 'model') {
        upsertAttributionBucket(byModel, 'model', line.description, linePositiveDelta)
      } else if (line.category === 'tool') {
        upsertAttributionBucket(byTool, 'tool', line.description, linePositiveDelta)
      }
    }
  }

  const sortBuckets = (items: ShadowDeltaBucket[]) =>
    [...items].sort((a, b) => b.positiveDelta - a.positiveDelta).slice(0, topN)

  const sortAttribution = (items: ShadowDeltaAttributionBucket[]) =>
    [...items].sort((a, b) => b.positiveDelta - a.positiveDelta).slice(0, topN)

  return {
    totals: {
      executions: records.length,
      applyEligible,
      positiveDelta,
      negativeDelta,
    },
    byWorkspace: sortBuckets([...byWorkspace.values()]),
    byWorkflow: sortBuckets([...byWorkflow.values()]),
    byModel: sortAttribution([...byModel.values()]),
    byTool: sortAttribution([...byTool.values()]),
  }
}

/**
 * Verifies that `workflow_execution_logs.cost_total` matches the workflow ledger
 * projection for the filtered execution sample.
 */
export async function verifyLedgerProjection(
  filter: HistoricalExecutionFilter = {},
  maxDriftExamples = 20
): Promise<LedgerProjectionVerification> {
  const rows = await listHistoricalWorkflowExecutions(filter)
  const drifted = rows.filter((row) => Math.abs(row.drift) > RECONCILIATION_EPSILON)

  return {
    total: rows.length,
    drifted: drifted.length,
    passed: drifted.length === 0,
    driftExamples: drifted.slice(0, maxDriftExamples).map((row) => ({
      executionId: row.executionId,
      workflowId: row.workflowId,
      workspaceId: row.workspaceId,
      startedAt: row.startedAt,
      status: row.status,
      costTotal: row.costTotal,
      ledgerSum: row.ledgerSum,
      drift: row.drift,
    })),
  }
}

/**
 * Evaluates rollout safety gates before applying a shadow artifact.
 * Production-wide apply requires `--confirm-production`; pilot scope is limited
 * to a workspace, execution, or small batch.
 */
export function evaluateApplyRolloutGates(params: {
  recordCount: number
  filter?: ApplyHistoricalReconciliationBatchFilter
  confirmProduction?: boolean
}): ApplyRolloutGateResult {
  const filter = params.filter ?? {}
  const blockers: string[] = []
  const warnings: string[] = []

  if (params.recordCount <= 0) {
    blockers.push('empty_artifact')
  }

  const hasPilotScope =
    Boolean(filter.workspaceId) ||
    Boolean(filter.executionId) ||
    (filter.limit != null && filter.limit > 0 && filter.limit <= HISTORICAL_RECONCILE_PILOT_MAX_RECORDS)

  const effectiveCount =
    filter.limit != null && filter.limit > 0
      ? Math.min(params.recordCount, filter.limit)
      : params.recordCount

  const phase: HistoricalReconcileRolloutPhase = hasPilotScope ? 'pilot' : 'production'

  if (phase === 'production' && !params.confirmProduction) {
    blockers.push('production_apply_requires_confirm_production')
  }

  if (phase === 'production' && effectiveCount > HISTORICAL_RECONCILE_PILOT_MAX_RECORDS) {
    warnings.push(`large_production_batch:${effectiveCount}`)
  }

  return {
    allowed: blockers.length === 0,
    phase,
    blockers,
    warnings,
  }
}

/**
 * Verifies ledger projection for executions after a gated apply batch.
 */
export async function verifyPostApplyReconciliation(
  executionIds: string[]
): Promise<PostApplyVerificationSummary> {
  const results: PostApplyVerificationResult[] = []

  for (const executionId of executionIds) {
    const evidence = await loadExecutionEvidence(executionId)
    if (!evidence) {
      results.push({
        executionId,
        passed: false,
        costTotal: null,
        ledgerSum: 0,
        drift: 0,
      })
      continue
    }

    const drift = (evidence.costTotal ?? 0) - evidence.ledgerSum
    results.push({
      executionId,
      passed: Math.abs(drift) <= RECONCILIATION_EPSILON,
      costTotal: evidence.costTotal,
      ledgerSum: evidence.ledgerSum,
      drift,
    })
  }

  const passed = results.filter((result) => result.passed).length

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  }
}
