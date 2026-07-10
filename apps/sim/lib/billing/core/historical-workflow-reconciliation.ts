import { db } from '@sim/db'
import {
  usageLog,
  workflowExecutionLogs,
  workflowExecutionSnapshots,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { BlockType } from '@/executor/constants'
import { isLargeValueRef } from '@/lib/execution/payloads/large-value-ref'
import { materializeExecutionData, TRACE_STORE_REF_KEY } from '@/lib/logs/execution/trace-store'
import { extractEmbeddedToolCostsFromSpan } from '@/lib/logs/embedded-tool-costs'
import type { WorkflowState } from '@/lib/logs/types'
import { shouldBillModelUsage } from '@/providers/utils'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

const logger = createLogger('HistoricalWorkflowReconciliation')

export const RECONCILIATION_EPSILON = 1e-6

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
  modelsUsed: string[] | null
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
