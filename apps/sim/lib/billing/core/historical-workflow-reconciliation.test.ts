/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeTraceSpans,
  classifyExecutionEvidence,
  aggregateClassificationResults,
  snapshotStateHasCostBlocks,
  type ExecutionEvidence,
  type TraceEvidenceSummary,
} from '@/lib/billing/core/historical-workflow-reconciliation'

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
    modelsUsed: null,
    ...overrides,
  }
}

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
    expect(summary.byClass.span_cost_legacy).toBe(1)
    expect(summary.byClass.reconciled).toBe(1)
    expect(summary.applyEligible).toBe(1)
    expect(summary.topRiskExamples[0]?.executionId).toBe('exec-a')
  })
})
