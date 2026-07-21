/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockTransaction,
  mockExecute,
  mockSelect,
  mockUpdate,
  mockRecordUsage,
  mockGetHighestPrioritySubscription,
  mockCostBlockExecute,
  mockMaterializeExecutionData,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockGetHighestPrioritySubscription: vi.fn(),
  mockCostBlockExecute: vi.fn(),
  mockMaterializeExecutionData: vi.fn(),
}))

vi.mock('@sim/db', () => ({
  db: {
    transaction: mockTransaction,
    select: mockSelect,
    execute: mockExecute,
    update: mockUpdate,
  },
}))

vi.mock('@/lib/billing/core/usage-log', () => ({
  deriveBillingContext: vi.fn(() => ({
    billingEntity: { type: 'user', id: 'user-1' },
    billingPeriod: {
      start: new Date('2026-05-01T00:00:00.000Z'),
      end: new Date('2026-06-01T00:00:00.000Z'),
    },
  })),
  recordUsage: mockRecordUsage,
  stableEventKey: vi.fn((parts: Record<string, unknown>) =>
    Object.keys(parts)
      .sort()
      .map((key) => `${key}:${String(parts[key] ?? '')}`)
      .join('|')
  ),
  getUsageLogCostMultiplier: () => {
    const raw = process.env.USAGE_LOG_COST_MULTIPLIER ?? process.env.COST_MULTIPLIER
    const parsed = raw != null ? Number(raw) : 1
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  },
  scaleUsageLogCost: (cost: number) => {
    if (cost <= 0) return cost
    const raw = process.env.USAGE_LOG_COST_MULTIPLIER ?? process.env.COST_MULTIPLIER
    const parsed = raw != null ? Number(raw) : 1
    const multiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    return multiplier === 1 ? cost : cost * multiplier
  },
  billableReconciliationAmount: (
    category: 'model' | 'fixed' | 'tool' | 'external',
    rawAmount: number
  ) => {
    if (rawAmount <= 0) return rawAmount
    if (category === 'external') return rawAmount
    const raw = process.env.USAGE_LOG_COST_MULTIPLIER ?? process.env.COST_MULTIPLIER
    const parsed = raw != null ? Number(raw) : 1
    const multiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    return multiplier === 1 ? rawAmount : rawAmount * multiplier
  },
  rawUsageAmountFromBillable: (
    category: 'model' | 'fixed' | 'tool' | 'external',
    billableAmount: number
  ) => {
    if (billableAmount <= 0) return billableAmount
    if (category === 'external') return billableAmount
    const raw = process.env.USAGE_LOG_COST_MULTIPLIER ?? process.env.COST_MULTIPLIER
    const parsed = raw != null ? Number(raw) : 1
    const multiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    return multiplier === 1 ? billableAmount : billableAmount / multiplier
  },
}))

vi.mock('@/lib/billing/core/plan', () => ({
  getHighestPrioritySubscription: mockGetHighestPrioritySubscription,
}))

vi.mock('@/executor/handlers/cost/cost-handler', () => ({
  CostBlockHandler: class MockCostBlockHandler {
    executeWithNode = mockCostBlockExecute
  },
}))

vi.mock('@/lib/logs/execution/trace-store', () => ({
  materializeExecutionData: mockMaterializeExecutionData,
  TRACE_STORE_REF_KEY: 'traceStoreRef',
}))

import {
  analyzeTraceSpans,
  applyHistoricalReconciliation,
  aggregateShadowDeltaReview,
  buildHistoricalAdjustmentEntries,
  classifyExecutionEvidence,
  aggregateClassificationResults,
  computeTargetLedgerLines,
  dryRunHistoricalWorkflowReprices,
  enrichTraceSpansForReprice,
  evaluateApplyRolloutGates,
  HISTORICAL_RECONCILE_DEFAULT_BATCH_SIZE,
  HISTORICAL_RECONCILE_DEFAULT_CONCURRENCY,
  HISTORICAL_RECONCILE_DEFAULT_EXECUTION_TIMEOUT_MS,
  HISTORICAL_RECONCILE_PILOT_MAX_RECORDS,
  HISTORICAL_RECONCILE_PRICING_MODE,
  HISTORICAL_RECONCILE_PROGRESS_INTERVAL,
  HISTORICAL_RECONCILE_ROLLOUT_STEPS,
  HISTORICAL_RECONCILE_VERSION,
  isReconcilePricedToolId,
  parseHistoricalReconcileShadowRecord,
  repairLedgerProjections,
  resolveShadowArtifactWorkspaceScope,
  shadowRecordHasPricedToolEvidence,
  snapshotStateHasCostBlocks,
  verifyLedgerProjection,
  type ExecutionClassification,
  type ExecutionEvidence,
  type HistoricalReconcileShadowRecord,
  type TraceEvidenceSummary,
} from '@/lib/billing/core/historical-workflow-reconciliation'
import { calculateCostSummary } from '@/lib/logs/execution/logging-factory'
import { BASE_EXECUTION_CHARGE } from '@/lib/billing/constants'
import {
  FALAI_HOSTED_KEY_MARKUP_MULTIPLIER,
  FALAI_IMAGE_FALLBACK_PROVIDER_COST_DOLLARS,
  FALAI_VIDEO_FALLBACK_PROVIDER_COST_DOLLARS,
} from '@/lib/tools/falai-pricing'
import { EXA_FALLBACK_COST_USD } from '@/tools/exa/hosting'

function baseEvidence(overrides: Partial<ExecutionEvidence> = {}): ExecutionEvidence {
  const trace: TraceEvidenceSummary = {
    hasTraceSpans: false,
    traceSpanCount: 0,
    traceStoreExternalized: false,
    traceStoreMaterialized: false,
    traceStoreExpired: false,
    spansWithInlineCost: 0,
    spansWithTokensNoCost: 0,
    spansWithHostedToolMetadata: 0,
    spansWithEmbeddedToolCost: 0,
    spansWithCostBlockType: 0,
    modelsInSpans: [],
    hostedToolSignals: [],
    ...overrides.trace,
  }

  return {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    workspaceId: 'ws-1',
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    status: 'completed',
    trigger: 'api',
    stateSnapshotId: 'snap-1',
    costTotal: 0,
    ledgerSum: 0,
    drift: 0,
    billingReconciliationPending: false,
    billingReconciliationReason: null,
    ledgerLines: [],
    mothershipLedgerSum: 0,
    trace,
    hasSnapshot: true,
    snapshotHasCostBlocks: false,
    snapshotState: null,
    traceSpans: undefined,
    modelsUsed: null,
    ...overrides,
  }
}

describe('isReconcilePricedToolId', () => {
  it('recognizes image model ids used as standalone tool descriptions', () => {
    expect(isReconcilePricedToolId('image_generate')).toBe(true)
    expect(isReconcilePricedToolId('gpt-image-1.5')).toBe(true)
    expect(isReconcilePricedToolId('flux-2-pro')).toBe(true)
    expect(isReconcilePricedToolId('video_falai')).toBe(true)
    expect(isReconcilePricedToolId('unknown_tool')).toBe(false)
  })
})

describe('analyzeTraceSpans', () => {
  it('detects legacy inline span costs', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'agent',
        model: 'gpt-4o',
        cost: { total: 0.02, input: 0.01, output: 0.01 },
        tokens: { input: 100, output: 50, total: 150 },
      },
    ])

    expect(summary.spansWithInlineCost).toBe(1)
    expect(summary.spansWithTokensNoCost).toBe(0)
    expect(summary.modelsInSpans).toEqual(['gpt-4o'])
  })

  it('detects cost-stripped model spans with tokens', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'model',
        model: 'gpt-4o',
        tokens: { input: 200, output: 80, total: 280 },
      },
    ])

    expect(summary.spansWithInlineCost).toBe(0)
    expect(summary.spansWithTokensNoCost).toBe(1)
  })

  it('detects firecrawl and image hosted-tool metadata', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'tool',
        name: 'firecrawl_scrape',
        output: { metadata: { creditsUsed: 12 } },
      },
      {
        type: 'tool',
        name: 'image_generate',
        output: { __falaiCostDollars: 0.05 },
      },
    ])

    expect(summary.spansWithHostedToolMetadata).toBe(2)
    expect(summary.hostedToolSignals).toEqual(
      expect.arrayContaining(['firecrawl_credits', 'falai_cost_dollars'])
    )
  })

  it('detects top-level firecrawl credits and Exa costDollars signals', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'tool',
        name: 'firecrawl_crawl',
        output: { creditsUsed: 8 },
      },
      {
        type: 'tool',
        name: 'exa_search',
        output: { __costDollars: 0.007 },
      },
    ])

    expect(summary.spansWithHostedToolMetadata).toBe(2)
    expect(summary.hostedToolSignals).toEqual(
      expect.arrayContaining(['firecrawl_credits', 'exa_cost_dollars'])
    )
  })

  it('detects browser_use __totalCostUsd hosted-tool signal', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'tool',
        name: 'browser_use_run_task',
        output: { __totalCostUsd: 0.15 },
      },
    ])

    expect(summary.spansWithHostedToolMetadata).toBe(1)
    expect(summary.hostedToolSignals).toContain('browser_use_cost')
  })

  it('detects agent embedded tool costs', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'agent',
        model: 'gpt-4o',
        cost: { total: 0.03, toolCost: 0.01 },
        children: [
          {
            type: 'tool',
            name: 'exa_search',
            output: { cost: { total: 0.01 } },
          },
        ],
      },
    ])

    expect(summary.spansWithEmbeddedToolCost).toBe(1)
  })

  it('detects cost block spans', () => {
    const summary = analyzeTraceSpans([
      {
        type: 'cost',
        name: 'Twilio Cost',
        output: { raw: { vendor: 'Twilio' } },
      },
    ])

    expect(summary.spansWithCostBlockType).toBe(1)
  })
})

describe('snapshotStateHasCostBlocks', () => {
  it('returns true when snapshot contains a cost block', () => {
    expect(
      snapshotStateHasCostBlocks({
        blocks: {
          cost1: {
            id: 'cost1',
            name: 'Partner Cost',
            type: 'cost',
            position: { x: 0, y: 0 },
            subBlocks: {},
            outputs: {},
            enabled: true,
            horizontalHandles: true,
            advancedMode: false,
            height: 0,
          },
        },
        edges: [],
        loops: {},
        parallels: {},
      })
    ).toBe(true)
  })
})

describe('classifyExecutionEvidence', () => {
  it('classifies reconciled executions with no drift', () => {
    const result = classifyExecutionEvidence(baseEvidence())
    expect(result.primaryClass).toBe('reconciled')
    expect(result.applyEligible).toBe(false)
    expect(result.confidence).toBe('high')
  })

  it('classifies ledger projection drift when only cost_total differs', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0.05,
        ledgerSum: 0.05,
        drift: 0.01,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('ledger_projection_drift')
    expect(result.applyEligible).toBe(false)
  })

  it('classifies span_cost_legacy when inline costs are present', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.02,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 1,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('span_cost_legacy')
    expect(result.confidence).toBe('high')
    expect(result.applyEligible).toBe(true)
    expect(result.evidenceSources).toContain('legacy_span_cost')
  })

  it('classifies cost_stripped_needs_reprice for token-only spans', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.01,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 1,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('cost_stripped_needs_reprice')
    expect(result.secondaryClasses).not.toContain('span_cost_legacy')
  })

  it('flags mothership_risk when both workflow and mothership ledgers have cost', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0.1,
        ledgerSum: 0.08,
        drift: 0.02,
        mothershipLedgerSum: 0.03,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 1,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('mothership_risk')
    expect(result.blockers).toContain('manual_mothership_review_required')
    expect(result.applyEligible).toBe(false)
  })

  it('reports missing_trace_data when trace store is expired and drift exists', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0.05,
        ledgerSum: 0,
        drift: 0.05,
        trace: {
          hasTraceSpans: false,
          traceSpanCount: 4,
          traceStoreExternalized: true,
          traceStoreMaterialized: false,
          traceStoreExpired: true,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('missing_trace_data')
    expect(result.blockers).toContain('trace_store_unavailable')
    expect(result.evidenceSources).toContain('unrecoverable')
  })

  it('lowers confidence for BYOK ambiguity on repriced model spans', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.01,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 1,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['deepseek-v3'],
          hostedToolSignals: [],
        },
      })
    )

    expect(result.primaryClass).toBe('cost_stripped_needs_reprice')
    expect(result.confidence).toBe('low')
    expect(result.warnings.some((warning) => warning.startsWith('byok_ambiguity'))).toBe(true)
    expect(result.applyEligible).toBe(false)
  })

  it('classifies out_of_scope when onlyPricedTools and no allowlisted tool signal', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.02,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 1,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
        traceSpans: [
          {
            type: 'agent',
            name: 'Agent',
            model: 'gpt-4o',
            cost: { total: 0.02 },
          },
        ],
      }),
      { onlyPricedTools: true }
    )

    expect(result.primaryClass).toBe('out_of_scope')
    expect(result.applyEligible).toBe(false)
    expect(result.confidence).toBe('high')
    expect(result.secondaryClasses).toEqual([])
    expect(result.warnings).toContain('only_priced_tools_gate')
  })

  it('keeps priced-tool executions in scope when onlyPricedTools is set', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.01,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 1,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: ['exa_cost_dollars'],
        },
        traceSpans: [
          {
            type: 'tool',
            name: 'exa_search',
            output: { __costDollars: 0.007 },
          },
        ],
      }),
      { onlyPricedTools: true }
    )

    expect(result.primaryClass).toBe('hosted_tool')
    expect(result.primaryClass).not.toBe('out_of_scope')
  })

  it('keeps missing priced-tool costs eligible when cost_total already matches the ledger', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: BASE_EXECUTION_CHARGE,
        ledgerSum: BASE_EXECUTION_CHARGE,
        drift: 0,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 2,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 1,
          spansWithHostedToolMetadata: 1,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: ['exa_cost_dollars'],
        },
        traceSpans: [
          {
            type: 'model',
            model: 'gpt-4o',
            tokens: { input: 1000, output: 500, total: 1500 },
          },
          {
            type: 'tool',
            name: 'exa_search',
            output: { __costDollars: 0.007 },
          },
        ],
      }),
      { onlyPricedTools: true }
    )

    expect(result.primaryClass).toBe('cost_stripped_needs_reprice')
    expect(result.applyEligible).toBe(true)
  })

  it('treats cost blocks as in-scope under onlyPricedTools', () => {
    const result = classifyExecutionEvidence(
      baseEvidence({
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.05,
        snapshotHasCostBlocks: true,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 1,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
      }),
      { onlyPricedTools: true }
    )

    expect(result.primaryClass).toBe('cost_block')
    expect(result.applyEligible).toBe(true)
  })
})

describe('aggregateClassificationResults', () => {
  it('counts classes and selects top risk examples by drift', () => {
    const summary = aggregateClassificationResults([
      {
        executionId: 'exec-a',
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        startedAt: new Date(),
        status: 'completed',
        primaryClass: 'span_cost_legacy',
        secondaryClasses: [],
        confidence: 'high',
        blockers: [],
        warnings: [],
        evidenceSources: ['legacy_span_cost'],
        applyEligible: true,
        costTotal: 0,
        ledgerSum: 0,
        drift: -0.5,
      },
      {
        executionId: 'exec-b',
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        startedAt: new Date(),
        status: 'completed',
        primaryClass: 'reconciled',
        secondaryClasses: [],
        confidence: 'high',
        blockers: [],
        warnings: [],
        evidenceSources: [],
        applyEligible: false,
        costTotal: 0.01,
        ledgerSum: 0.01,
        drift: 0,
      },
    ])

    expect(summary.total).toBe(2)
    expect(summary.attempted).toBe(2)
    expect(summary.skipped).toBe(0)
    expect(summary.failed).toBe(0)
    expect(summary.byClass.span_cost_legacy).toBe(1)
    expect(summary.byClass.reconciled).toBe(1)
    expect(summary.applyEligible).toBe(1)
    expect(summary.topRiskExamples[0]?.executionId).toBe('exec-a')
  })

  it('preserves attempted/skipped/failed accounting from the batch runner', () => {
    const classifications: ExecutionClassification[] = [
      {
        executionId: 'exec-ok',
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        startedAt: new Date(),
        status: 'completed',
        primaryClass: 'reconciled',
        secondaryClasses: [],
        confidence: 'high',
        blockers: [],
        warnings: [],
        evidenceSources: [],
        applyEligible: false,
        costTotal: 0.01,
        ledgerSum: 0.01,
        drift: 0,
      },
    ]

    const summary = aggregateClassificationResults(classifications, 20, {
      attempted: 5,
      skipped: 1,
      failed: 3,
      failures: [
        {
          executionId: 'exec-fail',
          error: 'Failed query: select ...',
          cause: { name: 'Error', message: 'connection reset' },
          postgresCode: '08006',
        },
      ],
    })

    expect(summary.total).toBe(1)
    expect(summary.attempted).toBe(5)
    expect(summary.skipped).toBe(1)
    expect(summary.failed).toBe(3)
    expect(summary.failures).toHaveLength(1)
    expect(summary.failures[0]?.postgresCode).toBe('08006')
  })
})

describe('throughput defaults', () => {
  it('exposes bounded page size, concurrency, and progress interval defaults', () => {
    expect(HISTORICAL_RECONCILE_DEFAULT_BATCH_SIZE).toBe(1000)
    expect(HISTORICAL_RECONCILE_DEFAULT_CONCURRENCY).toBe(8)
    expect(HISTORICAL_RECONCILE_DEFAULT_EXECUTION_TIMEOUT_MS).toBe(120_000)
    expect(HISTORICAL_RECONCILE_PROGRESS_INTERVAL).toBe(100)
  })
})

describe('dryRunHistoricalWorkflowReprices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue([{ '?column?': 1 }])
    mockMaterializeExecutionData.mockImplementation(
      async (executionData: Record<string, unknown>, context: { executionId: string }) => {
        if (context.executionId === 'exec-stuck') {
          return new Promise<Record<string, unknown>>(() => {})
        }
        return executionData
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('streams completed records and times out a stalled execution without blocking the page', async () => {
    vi.useFakeTimers()
    const pageRows = [
      {
        executionId: 'exec-fast',
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        startedAt: new Date('2026-07-17T10:00:00.000Z'),
        status: 'completed',
        trigger: 'api',
        stateSnapshotId: 'snap-1',
        costTotal: '0',
        modelsUsed: null,
        ledgerSum: '0',
      },
      {
        executionId: 'exec-stuck',
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
        startedAt: new Date('2026-07-17T09:00:00.000Z'),
        status: 'completed',
        trigger: 'api',
        stateSnapshotId: 'snap-2',
        costTotal: '0',
        modelsUsed: null,
        ledgerSum: '0',
      },
    ]
    const evidenceRows = pageRows.map((row) => ({
      ...row,
      executionData: {},
      snapshotStateData: null,
    }))
    let selectCall = 0
    mockSelect.mockImplementation(() => {
      selectCall += 1
      if (selectCall === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(pageRows),
              }),
            }),
          }),
        }
      }
      if (selectCall === 2 || selectCall === 3) {
        const evidenceRow = evidenceRows[selectCall - 2]
        return {
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([evidenceRow]),
              }),
            }),
          }),
        }
      }
      if (selectCall === 4) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ cost: '0' }]),
        }),
      }
    })

    const onRecord = vi.fn()
    let runSettled = false
    const run = dryRunHistoricalWorkflowReprices(
      { limit: 2, batchSize: 2, concurrency: 2 },
      { executionTimeoutMs: 10, onRecord }
    ).finally(() => {
      runSettled = true
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(onRecord).toHaveBeenCalledTimes(1)
    expect(runSettled).toBe(false)

    await vi.advanceTimersByTimeAsync(10)
    const summary = await run
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ executionId: 'exec-fast' }))
    expect(summary).toMatchObject({
      attempted: 2,
      total: 1,
      failed: 1,
      skipped: 0,
    })
    expect(summary.failures[0]).toMatchObject({
      executionId: 'exec-stuck',
      cause: { name: 'HistoricalReconcileExecutionTimeoutError' },
    })
  })

  it('exports an eligible priced-tool adjustment when the projection already matches its ledger', async () => {
    const pageRow = {
      executionId: 'exec-missing-cost',
      workflowId: 'wf-1',
      workspaceId: 'ws-1',
      startedAt: new Date('2026-07-17T10:00:00.000Z'),
      status: 'completed',
      trigger: 'api',
      stateSnapshotId: 'snap-1',
      costTotal: BASE_EXECUTION_CHARGE.toString(),
      modelsUsed: ['gpt-4o'],
      ledgerSum: BASE_EXECUTION_CHARGE.toString(),
    }
    const evidenceRow = {
      ...pageRow,
      executionData: {
        traceSpans: [
          {
            type: 'model',
            model: 'gpt-4o',
            tokens: { input: 1000, output: 500, total: 1500 },
          },
          {
            type: 'tool',
            name: 'exa_search',
            output: { __costDollars: 0.007 },
          },
        ],
      },
      snapshotStateData: null,
    }
    let selectCall = 0
    mockSelect.mockImplementation(() => {
      selectCall += 1
      if (selectCall === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([pageRow]),
              }),
            }),
          }),
        }
      }
      if (selectCall === 2) {
        return {
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([evidenceRow]),
              }),
            }),
          }),
        }
      }
      if (selectCall === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }
      }
      const cost = selectCall === 5 ? BASE_EXECUTION_CHARGE.toString() : '0'
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ cost }]),
        }),
      }
    })

    const summary = await dryRunHistoricalWorkflowReprices(
      { limit: 1, batchSize: 2, concurrency: 1, onlyPricedTools: true },
      { onlyPricedTools: true }
    )

    expect(summary.records[0]).toMatchObject({
      executionId: 'exec-missing-cost',
      applyEligible: true,
      pricedToolScope: true,
    })
    expect(summary.records[0]?.positiveDelta).toBeGreaterThan(0)
  })
})

function shadowRecord(
  overrides: Partial<HistoricalReconcileShadowRecord> = {}
): HistoricalReconcileShadowRecord {
  return {
    executionId: 'exec-apply-1',
    workflowId: 'wf-1',
    workspaceId: 'ws-1',
    startedAt: '2024-01-01T00:00:00.000Z',
    status: 'completed',
    ledgerSum: 0,
    ledgerLines: [],
    costTotal: 0,
    targetSum: 0.02,
    positiveDelta: 0.02,
    negativeDelta: 0,
    confidence: 'high',
    applyEligible: true,
    pricedToolScope: true,
    primaryClass: 'span_cost_legacy',
    warnings: [],
    blockers: [],
    targets: [
      {
        category: 'model',
        description: 'gpt-4o',
        target: 0.02,
        metadata: { inputTokens: 100, outputTokens: 50 },
      },
    ],
    pricingMode: HISTORICAL_RECONCILE_PRICING_MODE,
    ...overrides,
  }
}

describe('enrichTraceSpansForReprice', () => {
  it('reprices cost-stripped hosted model spans from current catalog', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'model',
        model: 'gpt-4o',
        tokens: { input: 1000, output: 500, total: 1500 },
      },
    ])

    expect(enriched?.[0]?.cost?.total).toBeGreaterThan(0)
    expect(enriched?.[0]?.cost?.input).toBeGreaterThan(0)
    expect(enriched?.[0]?.cost?.output).toBeGreaterThan(0)
  })

  it('adds standalone firecrawl tool costs from output metadata', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'firecrawl_scrape',
        output: { metadata: { creditsUsed: 10 } },
      },
    ])

    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.01, 8)
  })

  it('adds standalone firecrawl tool costs from top-level creditsUsed', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'firecrawl_crawl',
        output: { creditsUsed: 15 },
      },
    ])

    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.015, 8)
  })

  it('prefers Exa __costDollars over tool_output_cost', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'exa_search',
        output: {
          __costDollars: { total: 0.021 },
          cost: { total: 0.007 },
        },
      },
    ])

    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.021, 8)
  })

  it('folds agent-embedded tool costs into the parent model span', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'agent',
        model: 'gpt-4o',
        tokens: { input: 1000, output: 500, total: 1500 },
        children: [
          {
            type: 'tool',
            name: 'exa_search',
            output: { cost: { total: 0.01 } },
          },
        ],
      },
    ])

    expect(enriched?.[0]?.cost?.toolCost).toBeCloseTo(0.01, 8)
    expect(enriched?.[0]?.cost?.total ?? 0).toBeGreaterThan(0.01)
  })

  it('catalog-reprices successful agent-embedded image_generate without __imageBilling', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'agent',
        model: 'gpt-5.5',
        output: {
          cost: { input: 0.08, output: 0.02, total: 0.1 },
        },
        children: [
          {
            type: 'tool',
            name: 'image_generate',
            status: 'success',
            input: {
              provider: 'openai',
              model: 'gpt-image-2',
              quality: 'auto',
              size: 'auto',
              numImages: 1,
            },
            output: {
              imageUrl: 'https://example.com/image.png',
              model: 'gpt-image-2',
              metadata: {
                provider: 'openai',
                model: 'gpt-image-2',
                count: 1,
              },
            },
          },
        ],
      },
    ])

    expect(enriched?.[0]?.cost?.toolCost).toBeCloseTo(0.053, 8)
    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.153, 8)
    expect(enriched?.[0]?.children?.[0]?.output?.cost).toEqual(
      expect.objectContaining({ total: 0.053 })
    )
  })

  it('does not catalog-reprice failed agent-embedded image_generate spans', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'agent',
        model: 'gpt-5.5',
        output: {
          cost: { input: 0.08, output: 0.02, total: 0.1 },
        },
        children: [
          {
            type: 'tool',
            name: 'image_generate',
            status: 'success',
            input: {
              provider: 'openai',
              model: 'gpt-image-2',
              quality: 'auto',
              numImages: 1,
            },
            output: {
              error: true,
              message: 'No image data found in response',
              tool: 'image_generate',
            },
          },
        ],
      },
    ])

    expect(enriched?.[0]?.cost?.toolCost ?? 0).toBe(0)
    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.1, 8)
  })

  it('catalog-reprices stripped Exa standalone and under-agent spans to fallback', () => {
    const standalone = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'exa_search',
        output: { results: [{ url: 'https://example.com' }] },
      },
    ])
    expect(standalone?.[0]?.cost?.total).toBeCloseTo(EXA_FALLBACK_COST_USD, 8)

    const underAgent = enrichTraceSpansForReprice([
      {
        type: 'agent',
        model: 'gpt-4o',
        output: { cost: { input: 0.01, output: 0.01, total: 0.02 } },
        children: [
          {
            type: 'tool',
            name: 'exa_search',
            output: { results: [{ url: 'https://example.com' }] },
          },
        ],
      },
    ])
    expect(underAgent?.[0]?.cost?.toolCost).toBeCloseTo(EXA_FALLBACK_COST_USD, 8)
    expect(underAgent?.[0]?.children?.[0]?.output?.cost).toEqual(
      expect.objectContaining({ total: EXA_FALLBACK_COST_USD })
    )
  })

  it('catalog-reprices Serper from searchResults + num credits', () => {
    const oneCredit = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'serper_search',
        input: { num: 10 },
        output: { searchResults: [{ title: 'a' }] },
      },
    ])
    expect(oneCredit?.[0]?.cost?.total).toBeCloseTo(0.001, 8)

    const twoCredits = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'serper_search',
        input: { num: 20 },
        output: { searchResults: [{ title: 'a' }] },
      },
    ])
    expect(twoCredits?.[0]?.cost?.total).toBeCloseTo(0.002, 8)

    const missingResults = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'serper_search',
        input: { num: 10 },
        output: { organic: [] },
      },
    ])
    expect(missingResults?.[0]?.cost?.total ?? 0).toBe(0)
  })

  it('catalog-reprices successful Semrush to placeholder rate', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'semrush_query',
        output: { data: { result: 'ok' } },
      },
    ])
    expect(enriched?.[0]?.cost?.total).toBeCloseTo(0.01, 8)
  })

  it('catalog-reprices Browser Use from steps or API total', () => {
    const fromApi = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'browser_use_run_task',
        output: { __totalCostUsd: 0.042 },
      },
    ])
    expect(fromApi?.[0]?.cost?.total).toBeCloseTo(0.042, 8)

    const fromSteps = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'browser_use_run_task',
        output: { steps: [{}, {}, {}] },
      },
    ])
    // $0.01 init + $0.006 × 3 steps
    expect(fromSteps?.[0]?.cost?.total).toBeCloseTo(0.028, 8)
  })

  it('does not invent Firecrawl cost without credits', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'firecrawl_scrape',
        output: { markdown: '# hello' },
      },
    ])
    expect(enriched?.[0]?.cost?.total ?? 0).toBe(0)
  })

  it('rebuilds LLM-on-tool cost from retained llmUsage', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'development_generate_app',
        output: {
          llmUsage: { 'gpt-4o': { inputTokens: 1000, outputTokens: 500 } },
        },
      },
    ])
    expect(enriched?.[0]?.cost?.total).toBeGreaterThan(0)
  })

  it('prefers video_falai __falaiCostDollars and floors stripped successful video', () => {
    const withMeta = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'video_falai',
        output: {
          videoUrl: 'https://example.com/v.mp4',
          __falaiCostDollars: 0.2,
        },
      },
    ])
    expect(withMeta?.[0]?.cost?.total).toBeCloseTo(0.2 * FALAI_HOSTED_KEY_MARKUP_MULTIPLIER, 8)

    const stripped = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'video_falai',
        output: { videoUrl: 'https://example.com/v.mp4' },
      },
    ])
    expect(stripped?.[0]?.cost?.total).toBeCloseTo(
      FALAI_VIDEO_FALLBACK_PROVIDER_COST_DOLLARS * FALAI_HOSTED_KEY_MARKUP_MULTIPLIER,
      8
    )

    const failed = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'video_falai',
        output: { error: true, message: 'generation failed', videoUrl: '' },
      },
    ])
    expect(failed?.[0]?.cost?.total ?? 0).toBe(0)
  })

  it('floors Fal image_generate when billing events were stripped', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'image_generate',
        input: { provider: 'falai', model: 'flux-2-pro' },
        output: {
          imageUrl: 'https://example.com/image.png',
          provider: 'falai',
          model: 'flux-2-pro',
        },
      },
    ])
    expect(enriched?.[0]?.cost?.total).toBeCloseTo(
      FALAI_IMAGE_FALLBACK_PROVIDER_COST_DOLLARS * FALAI_HOSTED_KEY_MARKUP_MULTIPLIER,
      8
    )
  })

  it('does not catalog-charge failed hosted tools', () => {
    const enriched = enrichTraceSpansForReprice([
      {
        type: 'tool',
        name: 'exa_search',
        output: { error: true, message: 'timeout' },
      },
    ])
    expect(enriched?.[0]?.cost?.total ?? 0).toBe(0)
  })
})

describe('computeTargetLedgerLines', () => {
  beforeEach(() => {
    mockCostBlockExecute.mockReset()
  })

  it('matches calculateCostSummary for legacy inline span costs', async () => {
    const traceSpans = [
      {
        type: 'agent',
        model: 'gpt-4o',
        cost: { input: 0.01, output: 0.02, total: 0.03 },
        tokens: { input: 100, output: 200, total: 300 },
      },
    ]
    const summary = calculateCostSummary(traceSpans)
    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 1,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
        traceSpans,
      })
    )

    const modelTarget = targets.find((line) => line.category === 'model')
    const fixedTarget = targets.find((line) => line.category === 'fixed')

    expect(modelTarget?.target).toBeCloseTo(summary.models['gpt-4o']?.total ?? 0, 8)
    expect(fixedTarget?.target).toBeCloseTo(BASE_EXECUTION_CHARGE, 8)
    expect(modelTarget?.evidenceSource).toBe('legacy_span_cost')
  })

  it('reprices token-only model spans using the current catalog', async () => {
    const traceSpans = [
      {
        type: 'model',
        model: 'gpt-4o',
        tokens: { input: 1000, output: 500, total: 1500 },
      },
    ]

    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 1,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: ['gpt-4o'],
          hostedToolSignals: [],
        },
        traceSpans,
      })
    )

    const modelTarget = targets.find((line) => line.category === 'model')
    expect(modelTarget?.target).toBeGreaterThan(0)
    expect(modelTarget?.evidenceSource).toBe('tokens_repriced')
  })

  it('creates hosted tool rows for firecrawl and fal.ai image metadata', async () => {
    const traceSpans = [
      {
        type: 'tool',
        name: 'firecrawl_scrape',
        output: { metadata: { creditsUsed: 8 } },
      },
      {
        type: 'tool',
        name: 'image_generate',
        output: { model: 'flux-2-pro', __falaiCostDollars: 0.04 },
      },
    ]

    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 2,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 2,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: ['firecrawl_credits', 'falai_cost_dollars'],
        },
        traceSpans,
      })
    )

    const firecrawl = targets.find((line) => line.description === 'firecrawl_scrape')
    const image = targets.find((line) => line.description === 'flux-2-pro')

    expect(firecrawl?.target).toBeCloseTo(0.008, 8)
    expect(image?.target).toBeCloseTo(0.04 * FALAI_HOSTED_KEY_MARKUP_MULTIPLIER, 8)
  })

  it('uses snapshot state for cost block external targets when trace costs are missing', async () => {
    mockCostBlockExecute.mockResolvedValue({
      recorded: true,
      cost: { total: 2.5 },
      raw: { vendor: 'Twilio', label: 'SMS Cost' },
      units: 5,
    })

    const snapshotState = {
      blocks: {
        cost1: {
          id: 'cost1',
          name: 'SMS Cost',
          type: 'cost',
          position: { x: 0, y: 0 },
          subBlocks: {
            mode: { id: 'mode', type: 'short-input', value: 'fixed' },
            amount: { id: 'amount', type: 'short-input', value: 2.5 },
          },
          outputs: {},
          enabled: true,
          horizontalHandles: true,
          advancedMode: false,
          height: 0,
        },
      },
      edges: [],
      loops: {},
      parallels: {},
    }

    const traceSpans = [
      {
        type: 'cost',
        blockId: 'cost1',
        name: 'SMS Cost',
        status: 'success' as const,
        output: { raw: { vendor: 'Twilio' } },
      },
    ]

    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        workflowId: 'wf-1',
        snapshotHasCostBlocks: true,
        snapshotState,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 1,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
        traceSpans,
      })
    )

    const external = targets.find((line) => line.category === 'external')
    expect(external?.target).toBeCloseTo(2.5, 8)
    expect(external?.evidenceSource).toBe('cost_block_snapshot')
    expect(mockCostBlockExecute).toHaveBeenCalled()
  })

  it('includes snapshot cost block and stripped Exa tool in the same target set', async () => {
    mockCostBlockExecute.mockResolvedValue({
      recorded: true,
      cost: { total: 2.5 },
      raw: { vendor: 'Twilio', label: 'SMS Cost' },
      units: 5,
    })

    const snapshotState = {
      blocks: {
        cost1: {
          id: 'cost1',
          name: 'SMS Cost',
          type: 'cost',
          position: { x: 0, y: 0 },
          subBlocks: {
            mode: { id: 'mode', type: 'short-input', value: 'fixed' },
            amount: { id: 'amount', type: 'short-input', value: 2.5 },
          },
          outputs: {},
          enabled: true,
          horizontalHandles: true,
          advancedMode: false,
          height: 0,
        },
      },
      edges: [],
      loops: {},
      parallels: {},
    }

    const traceSpans = [
      {
        type: 'cost',
        blockId: 'cost1',
        name: 'SMS Cost',
        status: 'success' as const,
        output: { raw: { vendor: 'Twilio' } },
      },
      {
        type: 'tool',
        name: 'exa_search',
        output: { results: [{ url: 'https://example.com' }] },
      },
    ]

    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        workflowId: 'wf-1',
        snapshotHasCostBlocks: true,
        snapshotState,
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 2,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 1,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
        traceSpans,
      })
    )

    const external = targets.find((line) => line.category === 'external')
    const exa = targets.find(
      (line) => line.category === 'tool' && line.description === 'exa_search'
    )
    expect(external?.target).toBeCloseTo(2.5, 8)
    expect(external?.evidenceSource).toBe('cost_block_snapshot')
    expect(exa?.target).toBeCloseTo(EXA_FALLBACK_COST_USD, 8)
  })

  it('reports unrecoverable evidence when trace store is expired and no snapshot cost blocks exist', async () => {
    const { targets, warnings } = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: false,
          traceSpanCount: 3,
          traceStoreExternalized: true,
          traceStoreMaterialized: false,
          traceStoreExpired: true,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 0,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: [],
        },
        traceSpans: undefined,
      })
    )

    expect(targets).toHaveLength(0)
    expect(warnings).toContain('trace_store_unavailable')
  })
})

describe('buildHistoricalAdjustmentEntries', () => {
  it('emits positive deltas with deterministic historical reconcile event keys', () => {
    const result = buildHistoricalAdjustmentEntries({
      executionId: 'exec-1',
      targets: [
        { category: 'fixed', description: 'execution_fee', target: 0.005 },
        {
          category: 'model',
          description: 'gpt-4o',
          target: 0.02,
          metadata: { inputTokens: 100, outputTokens: 50 },
        },
      ],
      alreadyBilled: new Map([['fixed::execution_fee', 0.005]]),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      category: 'model',
      description: 'gpt-4o',
      cost: 0.02,
      source: 'workflow',
    })
    expect(result.entries[0]?.eventKey).toContain(HISTORICAL_RECONCILE_VERSION)
    expect(result.positiveDeltaTotal).toBeCloseTo(0.02, 8)
    expect(result.negativeDeltaTotal).toBe(0)
  })

  it('reports negative deltas without emitting adjustment rows', () => {
    const result = buildHistoricalAdjustmentEntries({
      executionId: 'exec-1',
      targets: [{ category: 'model', description: 'gpt-4o', target: 0.01 }],
      alreadyBilled: new Map([['model::gpt-4o', 0.03]]),
    })

    expect(result.entries).toHaveLength(0)
    expect(result.negativeDeltaTotal).toBeCloseTo(0.02, 8)
    expect(result.skippedNegativeLines).toHaveLength(1)
    expect(result.skippedNegativeLines[0]?.delta).toBeCloseTo(-0.02, 8)
  })

  it('is idempotent when the ledger already matches targets', () => {
    const result = buildHistoricalAdjustmentEntries({
      executionId: 'exec-1',
      targets: [{ category: 'tool', description: 'firecrawl_scrape', target: 0.012 }],
      alreadyBilled: new Map([['tool::firecrawl_scrape', 0.012]]),
    })

    expect(result.entries).toHaveLength(0)
    expect(result.positiveDeltaTotal).toBe(0)
  })

  it('compares billable targets to billable ledger rows when a cost multiplier is set', () => {
    const previousMultiplier = process.env.USAGE_LOG_COST_MULTIPLIER
    process.env.USAGE_LOG_COST_MULTIPLIER = '2'

    try {
      const result = buildHistoricalAdjustmentEntries({
        executionId: 'exec-1',
        targets: [
          { category: 'fixed', description: 'execution_fee', target: 0.005 },
          { category: 'model', description: 'grok-4-latest', target: 0.065 },
        ],
        alreadyBilled: new Map([
          ['fixed::execution_fee', 0.01],
          ['model::grok-4-latest', 0.13],
        ]),
      })

      expect(result.entries).toHaveLength(0)
      expect(result.positiveDeltaTotal).toBe(0)
      expect(result.negativeDeltaTotal).toBe(0)
    } finally {
      if (previousMultiplier === undefined) {
        delete process.env.USAGE_LOG_COST_MULTIPLIER
      } else {
        process.env.USAGE_LOG_COST_MULTIPLIER = previousMultiplier
      }
    }
  })
})

describe('parseHistoricalReconcileShadowRecord', () => {
  it('parses valid NDJSON shadow lines', () => {
    const record = parseHistoricalReconcileShadowRecord(
      JSON.stringify({
        executionId: 'exec-1',
        workspaceId: 'ws-1',
        startedAt: '2024-01-01T00:00:00.000Z',
        targets: [],
      })
    )

    expect(record).toMatchObject({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      pricingMode: HISTORICAL_RECONCILE_PRICING_MODE,
      applyEligible: false,
      pricedToolScope: false,
      warnings: ['priced_tool_scope_missing_regenerate_artifact'],
    })
  })
})

describe('applyHistoricalReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetHighestPrioritySubscription.mockResolvedValue({
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-01T00:00:00.000Z'),
      referenceId: 'user-1',
    })
    mockRecordUsage.mockResolvedValue(undefined)
  })

  function setupTx(
    alreadyBilled: Array<{ category: string; description: string; cost: string }>,
    ledgerSumAfter?: number
  ) {
    const ledgerSumBefore = alreadyBilled.reduce(
      (sum, row) => sum + Number.parseFloat(row.cost),
      0
    )
    const ledgerSumFinal = ledgerSumAfter ?? ledgerSumBefore

    const groupBy = vi.fn().mockResolvedValue(alreadyBilled)
    const billedWhere = vi.fn().mockReturnValue({ groupBy })
    const billedFrom = vi.fn().mockReturnValue({ where: billedWhere })

    let selectCall = 0
    const txSelect = vi.fn(() => {
      selectCall += 1
      if (selectCall === 1) {
        return { from: billedFrom }
      }

      const sumValue = selectCall === 2 ? ledgerSumBefore : ledgerSumFinal
      const sumWhere = vi.fn().mockResolvedValue([{ cost: sumValue.toString() }])
      const sumFrom = vi.fn().mockReturnValue({ where: sumWhere })
      return { from: sumFrom }
    })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const txUpdate = vi.fn().mockReturnValue({ set: updateSet })
    const txExecute = vi.fn().mockResolvedValue(undefined)

    const tx = {
      execute: txExecute,
      select: txSelect,
      update: txUpdate,
    }
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))

    return { updateSet, ledgerSumBefore, ledgerSumFinal }
  }

  it('skips ineligible shadow records without writing', async () => {
    const result = await applyHistoricalReconciliation({
      record: shadowRecord({ applyEligible: false }),
      userId: 'user-1',
    })

    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('not_apply_eligible')
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('requires regenerating artifacts that predate persisted priced-tool scope', async () => {
    const result = await applyHistoricalReconciliation({
      record: shadowRecord({
        applyEligible: false,
        pricedToolScope: false,
        warnings: ['priced_tool_scope_missing_regenerate_artifact'],
      }),
      userId: 'user-1',
    })

    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('artifact_missing_priced_tool_scope')
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('writes positive deltas and refreshes cost_total from the ledger', async () => {
    const { updateSet } = setupTx([], 0.02)

    const result = await applyHistoricalReconciliation({
      record: shadowRecord(),
      userId: 'user-1',
    })

    expect(result.status).toBe('applied')
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    expect(mockRecordUsage.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      executionId: 'exec-apply-1',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
    })
    expect(updateSet).toHaveBeenCalledWith({ costTotal: '0.02' })
    expect(result.costTotalAfter).toBe(0.02)
  })

  it('does not double-charge when targets are already billed', async () => {
    setupTx([{ category: 'model', description: 'gpt-4o', cost: '0.02' }])

    const result = await applyHistoricalReconciliation({
      record: shadowRecord(),
      userId: 'user-1',
    })

    expect(result.status).toBe('unchanged')
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(result.entriesInserted).toBe(0)
  })

  it('does not apply negative deltas but still refreshes cost_total', async () => {
    const { updateSet } = setupTx([{ category: 'model', description: 'gpt-4o', cost: '0.05' }])

    const result = await applyHistoricalReconciliation({
      record: shadowRecord({
        targets: [{ category: 'model', description: 'gpt-4o', target: 0.02 }],
        positiveDelta: 0,
        negativeDelta: 0.03,
      }),
      userId: 'user-1',
    })

    expect(result.status).toBe('unchanged')
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(result.negativeDeltaSkipped).toBeCloseTo(0.03, 8)
    expect(updateSet).toHaveBeenCalledWith({ costTotal: '0.05' })
  })
})

describe('computeTargetLedgerLines hosted tools', () => {
  it('creates firecrawl parse tool rows from credits metadata', async () => {
    const traceSpans = [
      {
        type: 'tool',
        name: 'firecrawl_parse',
        output: { metadata: { creditsUsed: 5 } },
      },
    ]

    const { targets } = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 1,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: ['firecrawl_credits'],
        },
        traceSpans,
      })
    )

    const parseTarget = targets.find((line) => line.description === 'firecrawl_parse')
    expect(parseTarget?.category).toBe('tool')
    expect(parseTarget?.target).toBeCloseTo(0.005, 8)
  })

  it('creates OpenAI and Gemini image tool rows from __imageBilling metadata', async () => {
    const openAiSpans = [
      {
        type: 'tool',
        name: 'openai_image',
        output: {
          __imageBilling: {
            provider: 'openai',
            model: 'gpt-image-1.5',
            size: '1024x1024',
            quality: 'medium',
            numImages: 1,
          },
        },
      },
    ]
    const geminiSpans = [
      {
        type: 'tool',
        name: 'gemini_image',
        output: {
          __imageBilling: {
            provider: 'gemini',
            model: 'gemini-3.1-flash-image-preview',
            resolution: '4K',
            numImages: 1,
          },
        },
      },
    ]

    const openAiResult = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 1,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: ['image_billing'],
        },
        traceSpans: openAiSpans,
      })
    )

    const geminiResult = await computeTargetLedgerLines(
      baseEvidence({
        trace: {
          hasTraceSpans: true,
          traceSpanCount: 1,
          traceStoreExternalized: false,
          traceStoreMaterialized: true,
          traceStoreExpired: false,
          spansWithInlineCost: 0,
          spansWithTokensNoCost: 0,
          spansWithHostedToolMetadata: 1,
          spansWithEmbeddedToolCost: 0,
          spansWithCostBlockType: 0,
          modelsInSpans: [],
          hostedToolSignals: ['image_billing'],
        },
        traceSpans: geminiSpans,
      })
    )

    const openAiTarget = openAiResult.targets.find((line) => line.category === 'tool')
    const geminiTarget = geminiResult.targets.find((line) => line.category === 'tool')

    expect(openAiTarget?.target).toBeCloseTo(0.034, 8)
    expect(geminiTarget?.target).toBeCloseTo(0.15, 8)
  })
})

describe('aggregateShadowDeltaReview', () => {
  it('aggregates positive deltas by workspace, workflow, model, and tool', () => {
    const review = aggregateShadowDeltaReview([
      shadowRecord({
        workspaceId: 'ws-a',
        workflowId: 'wf-a',
        positiveDelta: 0.03,
        negativeDelta: 0,
        ledgerLines: [],
        targets: [
          { category: 'model', description: 'gpt-4o', target: 0.02 },
          { category: 'tool', description: 'firecrawl_scrape', target: 0.01 },
        ],
      }),
      shadowRecord({
        executionId: 'exec-apply-2',
        workspaceId: 'ws-a',
        workflowId: 'wf-b',
        positiveDelta: 0.01,
        negativeDelta: 0.01,
        ledgerLines: [{ category: 'model', description: 'gpt-4o', cost: 0.01 }],
        targets: [{ category: 'model', description: 'gpt-4o', target: 0.02 }],
      }),
      shadowRecord({
        executionId: 'exec-out-of-scope',
        workspaceId: 'ws-b',
        workflowId: 'wf-c',
        positiveDelta: 0.5,
        applyEligible: false,
        pricedToolScope: false,
        primaryClass: 'out_of_scope',
        targets: [{ category: 'model', description: 'gpt-4o', target: 0.5 }],
      }),
    ])

    expect(review.totals.executions).toBe(3)
    expect(review.totals.positiveDelta).toBeCloseTo(0.54, 8)
    expect(review.totals.negativeDelta).toBeCloseTo(0.01, 8)
    expect(review.totals.eligiblePositiveDelta).toBeCloseTo(0.04, 8)
    expect(review.totals.eligibleNegativeDelta).toBeCloseTo(0.01, 8)
    expect(review.totals.outOfScopePositiveDelta).toBeCloseTo(0.5, 8)
    expect(review.byWorkspace[0]?.id).toBe('ws-a')
    expect(review.byWorkflow).toHaveLength(2)
    expect(review.byModel[0]?.description).toBe('gpt-4o')
    expect(review.byTool[0]?.description).toBe('firecrawl_scrape')
  })
})

describe('shadowRecordHasPricedToolEvidence', () => {
  it('preserves the dry-run scope decision when targets only contain model costs', () => {
    const record = shadowRecord({
      primaryClass: 'cost_stripped_needs_reprice',
      targets: [{ category: 'model', description: 'gpt-4o', target: 0.02 }],
      ledgerLines: [],
      pricedToolScope: true,
    })

    expect(shadowRecordHasPricedToolEvidence(record)).toBe(true)
  })
})

describe('evaluateApplyRolloutGates', () => {
  it('allows pilot apply when scoped to a workspace', () => {
    const gate = evaluateApplyRolloutGates({
      recordCount: 500,
      filter: { workspaceId: 'ws-1', limit: 100 },
    })

    expect(gate.allowed).toBe(true)
    expect(gate.phase).toBe('pilot')
    expect(gate.blockers).toHaveLength(0)
  })

  it('blocks production apply without confirm-production', () => {
    const gate = evaluateApplyRolloutGates({
      recordCount: 500,
      filter: { limit: 500 },
    })

    expect(gate.allowed).toBe(false)
    expect(gate.phase).toBe('production')
    expect(gate.blockers).toContain('production_apply_requires_confirm_production')
  })

  it('allows production apply when confirm-production is set', () => {
    const gate = evaluateApplyRolloutGates({
      recordCount: 500,
      filter: { limit: 500 },
      confirmProduction: true,
    })

    expect(gate.allowed).toBe(true)
    expect(gate.phase).toBe('production')
  })

  it('treats small limit-only batches as pilot scope', () => {
    const gate = evaluateApplyRolloutGates({
      recordCount: 80,
      filter: { limit: HISTORICAL_RECONCILE_PILOT_MAX_RECORDS },
    })

    expect(gate.allowed).toBe(true)
    expect(gate.phase).toBe('pilot')
  })

  it('allows pilot apply when workspace is inferred from a single-workspace artifact', () => {
    const artifactScope = resolveShadowArtifactWorkspaceScope([
      shadowRecord({ workspaceId: 'ws-pilot' }),
      shadowRecord({ executionId: 'exec-apply-2', workspaceId: 'ws-pilot' }),
    ])

    const gate = evaluateApplyRolloutGates({
      recordCount: 500,
      filter: { workspaceId: artifactScope.singleWorkspaceId, limit: 500 },
    })

    expect(gate.allowed).toBe(true)
    expect(gate.phase).toBe('pilot')
    expect(gate.blockers).toHaveLength(0)
  })
})

describe('resolveShadowArtifactWorkspaceScope', () => {
  it('returns singleWorkspaceId when all records share one workspace', () => {
    const scope = resolveShadowArtifactWorkspaceScope([
      shadowRecord({ workspaceId: 'ws-a' }),
      shadowRecord({ executionId: 'exec-2', workspaceId: 'ws-a' }),
    ])

    expect(scope.workspaceIds).toEqual(['ws-a'])
    expect(scope.singleWorkspaceId).toBe('ws-a')
  })

  it('leaves singleWorkspaceId unset for multi-workspace artifacts', () => {
    const scope = resolveShadowArtifactWorkspaceScope([
      shadowRecord({ workspaceId: 'ws-a' }),
      shadowRecord({ executionId: 'exec-2', workspaceId: 'ws-b' }),
    ])

    expect(scope.workspaceIds).toEqual(['ws-a', 'ws-b'])
    expect(scope.singleWorkspaceId).toBeUndefined()
  })
})

describe('verifyLedgerProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue([{ '?column?': 1 }])
  })

  function mockPagedSelect(pages: Array<Array<Record<string, unknown>>>) {
    let pageIndex = 0
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const page = pages[pageIndex] ?? []
              pageIndex += 1
              return page
            }),
          }),
        }),
      }),
    }))
  }

  it('passes when sampled executions have no projection drift', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-1',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: '0.02',
          modelsUsed: null,
          ledgerSum: '0.02',
        },
      ],
      [],
    ])

    const result = await verifyLedgerProjection({ limit: 1, batchSize: 1 })

    expect(result.passed).toBe(true)
    expect(result.drifted).toBe(0)
    expect(result.total).toBe(1)
  })

  it('fails when cost_total and ledger sums diverge', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-drift',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: '0.05',
          modelsUsed: null,
          ledgerSum: '0.02',
        },
      ],
      [],
    ])

    const result = await verifyLedgerProjection({ limit: 1, batchSize: 1 })

    expect(result.passed).toBe(false)
    expect(result.drifted).toBe(1)
    expect(result.driftExamples[0]?.executionId).toBe('exec-drift')
  })

  it('pages across multiple batches until the total limit is reached', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-1',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-02T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: '0.01',
          modelsUsed: null,
          ledgerSum: '0.01',
        },
      ],
      [
        {
          executionId: 'exec-2',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-2',
          costTotal: '0.02',
          modelsUsed: null,
          ledgerSum: '0.02',
        },
      ],
    ])

    const result = await verifyLedgerProjection({ limit: 2, batchSize: 1 })

    expect(result.total).toBe(2)
    expect(result.passed).toBe(true)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })
})

describe('repairLedgerProjections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue([{ '?column?': 1 }])
  })

  function mockPagedSelect(pages: Array<Array<Record<string, unknown>>>) {
    let pageIndex = 0
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const page = pages[pageIndex] ?? []
              pageIndex += 1
              return page
            }),
          }),
        }),
      }),
    }))
  }

  it('dry-runs without writing when cost_total is null and ledger is positive', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-null',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: null,
          modelsUsed: null,
          ledgerSum: '1.25',
        },
      ],
      [],
    ])

    const result = await repairLedgerProjections({ limit: 1, batchSize: 1 }, { dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(result.scanned).toBe(1)
    expect(result.drifted).toBe(1)
    expect(result.repaired).toBe(0)
    expect(result.examples[0]).toMatchObject({
      executionId: 'exec-null',
      costTotal: null,
      ledgerSum: 1.25,
      costTotalAfter: 1.25,
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('writes cost_total from the ledger when dryRun is false', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-2x',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: '0.0075',
          modelsUsed: null,
          ledgerSum: '0.015',
        },
      ],
      [],
    ])

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mockUpdate.mockReturnValue({ set: updateSet })

    const result = await repairLedgerProjections({ limit: 1, batchSize: 1 }, { dryRun: false })

    expect(result.dryRun).toBe(false)
    expect(result.drifted).toBe(1)
    expect(result.repaired).toBe(1)
    expect(updateSet).toHaveBeenCalledWith({ costTotal: '0.015' })
    expect(updateWhere).toHaveBeenCalled()
  })

  it('skips executions that already match the ledger', async () => {
    mockPagedSelect([
      [
        {
          executionId: 'exec-ok',
          workflowId: 'wf-1',
          workspaceId: 'ws-1',
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          status: 'completed',
          trigger: 'api',
          stateSnapshotId: 'snap-1',
          costTotal: '0.02',
          modelsUsed: null,
          ledgerSum: '0.02',
        },
      ],
      [],
    ])

    const result = await repairLedgerProjections({ limit: 1, batchSize: 1 }, { dryRun: false })

    expect(result.scanned).toBe(1)
    expect(result.drifted).toBe(0)
    expect(result.repaired).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('rollout sequence', () => {
  it('defines the full audit → shadow → pilot → production → verify sequence', () => {
    expect(HISTORICAL_RECONCILE_ROLLOUT_STEPS.map((step) => step.name)).toEqual([
      'baseline_audit',
      'repair_projections',
      'evidence_audit',
      'staging_shadow',
      'delta_review',
      'pilot_apply',
      'post_pilot_verify',
      'production_apply',
      'final_verify',
    ])
    expect(HISTORICAL_RECONCILE_ROLLOUT_STEPS.every((step) => step.command.length > 0)).toBe(true)
  })

  it('includes --only-priced-tools on audit, shadow, and apply steps', () => {
    const gated = HISTORICAL_RECONCILE_ROLLOUT_STEPS.filter((step) =>
      ['evidence_audit', 'staging_shadow', 'delta_review', 'pilot_apply', 'production_apply'].includes(
        step.name
      )
    )
    expect(gated.every((step) => step.command.includes('--only-priced-tools'))).toBe(true)
  })

  it('includes projection repair before evidence audit', () => {
    const repair = HISTORICAL_RECONCILE_ROLLOUT_STEPS.find((step) => step.name === 'repair_projections')
    expect(repair?.command).toContain('--repair-projections')
    expect(repair?.command).toContain('--write')
  })
})
