/**
 * @vitest-environment node
 */
import { dbChainMock, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db', () => dbChainMock)

import {
  getWorkspaceUsageAnalytics,
  InvalidUsageSourcesError,
  parseWorkspaceUsageSources,
} from '@/lib/workspaces/usage/analytics'

const WORKSPACE_ID = 'ws-1'

const ANALYTICS_QUERY_COUNT = 27
const ANALYTICS_QUERY_COUNT_WITH_DRILLDOWN = 29

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
}

function emptyTail(count: number) {
  return Array.from({ length: count }, () => [])
}

function buildAnalyticsQueue(overrides: Record<number, unknown[]>, count = ANALYTICS_QUERY_COUNT) {
  const results = emptyTail(count)
  for (const [index, value] of Object.entries(overrides)) {
    results[Number(index)] = value
  }
  return results
}

const ATTRIBUTION_OK = [
  {
    missingChatIdCost: '0',
    missingChatIdCount: 0,
    missingChatIdRawCost: '0',
    missingExecutionIdCost: '0',
    missingExecutionIdCount: 0,
    missingExecutionIdRawCost: '0',
  },
]

const DATA_HEALTH_OK = [
  [{ totalRows: 4, nullWorkspaceRows: 0, missingActorRows: 0 }],
  [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }],
]

function wireTerminalQueue(results: unknown[][]) {
  let index = 0
  const next = () => Promise.resolve(results[index++] ?? [])

  dbChainMockFns.groupBy.mockImplementation(() => {
    const builder: {
      having: ReturnType<typeof vi.fn>
      then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>
    } = {
      having: vi.fn(() => next()),
      then: (onfulfilled) => next().then(onfulfilled),
    }
    return builder
  })

  dbChainMockFns.where.mockImplementation(() => {
    const thenable: {
      limit: ReturnType<typeof vi.fn>
      orderBy: ReturnType<typeof vi.fn>
      returning: ReturnType<typeof vi.fn>
      groupBy: ReturnType<typeof vi.fn>
      for: ReturnType<typeof vi.fn>
      then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>
    } = {
      limit: dbChainMockFns.limit,
      orderBy: dbChainMockFns.orderBy,
      returning: dbChainMockFns.returning,
      groupBy: dbChainMockFns.groupBy,
      for: dbChainMockFns.for,
      then: (onfulfilled) => next().then(onfulfilled),
    }
    return thenable
  })
}

describe('parseWorkspaceUsageSources', () => {
  it('rejects unknown source tokens', () => {
    expect(() => parseWorkspaceUsageSources('workflow,not-a-source')).toThrow(
      InvalidUsageSourcesError
    )
  })

  it('accepts valid comma-separated sources', () => {
    expect(parseWorkspaceUsageSources('workflow,copilot')).toEqual(['workflow', 'copilot'])
  })
})

describe('getWorkspaceUsageAnalytics reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('rolls up mixed-source ledger costs into summary and bySource buckets', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        0: [
          {
            source: 'workflow',
            billableCost: '6',
            rawCost: '5',
            count: 2,
            ...EMPTY_USAGE,
            totalTokens: 1200,
            invocationCount: 2,
          },
          {
            source: 'workspace-chat',
            billableCost: '2.5',
            rawCost: '2.5',
            count: 1,
            ...EMPTY_USAGE,
            invocationCount: 1,
          },
          {
            source: 'mothership_block',
            billableCost: '1',
            rawCost: '0.8',
            count: 1,
            ...EMPTY_USAGE,
            invocationCount: 1,
          },
        ],
        1: [
          { chargeType: 'base_run', billableCost: '0.5', rawCost: '0.5', count: 1 },
          { chargeType: 'provider', billableCost: '5.5', rawCost: '4.5', count: 1 },
          { chargeType: 'cost_block', billableCost: '1', rawCost: '0.8', count: 1 },
          { chargeType: 'mothership', billableCost: '2.5', rawCost: '2.5', count: 1 },
        ],
        2: [{ ...EMPTY_USAGE, totalTokens: 1200, invocationCount: 4 }],
        3: ATTRIBUTION_OK,
        4: [{ total: 2, withProjectedCost: 2, totalProjectedCost: '6' }],
        5: [{ totalLedgerCost: '6' }],
        8: [{ total: 1, withLedgerCost: 1 }],
        9: [{ total: 1 }],
        25: DATA_HEALTH_OK[0],
        26: DATA_HEALTH_OK[1],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
    })

    expect(analytics.summary.billableCost).toBeCloseTo(9.5, 8)
    expect(analytics.summary.rawCost).toBeCloseTo(8.3, 8)
    expect(analytics.summary.ledgerEntryCount).toBe(4)
    expect(analytics.summary.usage.totalTokens).toBe(1200)
    expect(analytics.bySource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'workflow', billableCost: 6, rawCost: 5, count: 2 }),
        expect.objectContaining({
          source: 'workspace-chat',
          billableCost: 2.5,
          rawCost: 2.5,
          count: 1,
        }),
        expect.objectContaining({
          source: 'mothership_block',
          billableCost: 1,
          rawCost: 0.8,
          count: 1,
        }),
      ])
    )
    expect(analytics.byChargeType).toEqual([
      expect.objectContaining({ chargeType: 'base_run', billableCost: 0.5, count: 1 }),
      expect.objectContaining({ chargeType: 'provider', billableCost: 5.5, count: 1 }),
      expect.objectContaining({ chargeType: 'cost_block', billableCost: 1, count: 1 }),
      expect.objectContaining({ chargeType: 'mothership', billableCost: 2.5, count: 1 }),
    ])
    expect(analytics.workflow.executions.totalProjectedCost).toBe(6)
    expect(analytics.workflow.executions.totalLedgerCost).toBe(6)
    expect(analytics.dataHealth.limitedAttribution).toBe(false)
    expect(analytics.copilot.triggeredWorkflows.executionCount).toBe(0)
  })

  it('surfaces mothership charge-type cost with 94 chats / 282 runs but zero per-chat credits when ledger chat_id is absent', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        0: [
          {
            source: 'workspace-chat',
            billableCost: '140.17',
            rawCost: '140.17',
            count: 160,
            ...EMPTY_USAGE,
            invocationCount: 160,
          },
        ],
        1: [{ chargeType: 'mothership', billableCost: '140.17', rawCost: '140.17', count: 160 }],
        2: [{ ...EMPTY_USAGE, invocationCount: 160 }],
        3: [
          {
            missingChatIdCost: '140.17',
            missingChatIdCount: 160,
            missingChatIdRawCost: '140.17',
            missingExecutionIdCost: '0',
            missingExecutionIdCount: 0,
            missingExecutionIdRawCost: '0',
          },
        ],
        4: [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
        5: [{ totalLedgerCost: '0' }],
        8: [{ total: 94, withLedgerCost: 0 }],
        9: [{ total: 282 }],
        12: [],
        25: [{ totalRows: 160, nullWorkspaceRows: 0, missingActorRows: 0 }],
        26: [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
    })

    expect(analytics.byChargeType).toEqual([
      expect.objectContaining({ chargeType: 'mothership', billableCost: 140.17, count: 160 }),
    ])
    expect(analytics.copilot.chats.total).toBe(94)
    expect(analytics.copilot.chats.withLedgerCost).toBe(0)
    expect(analytics.copilot.runs.total).toBe(282)
    expect(analytics.copilot.byChat).toEqual([])
    expect(analytics.attribution.missingChatId).toEqual({
      billableCost: 140.17,
      rawCost: 140.17,
      count: 160,
    })
    expect(analytics.summary.chatCount).toBe(94)
    expect(analytics.summary.billableCost).toBeCloseTo(140.17, 8)
  })

  it('surfaces copilot transcripts that lack ledger rows and unattributed mothership cost', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        0: [
          {
            source: 'workspace-chat',
            billableCost: '1.5',
            rawCost: '1.5',
            count: 1,
            ...EMPTY_USAGE,
            invocationCount: 1,
          },
        ],
        1: [{ chargeType: 'provider', billableCost: '1.5', rawCost: '1.5', count: 1 }],
        2: [{ ...EMPTY_USAGE, invocationCount: 1 }],
        3: [
          {
            missingChatIdCost: '0.5',
            missingChatIdCount: 1,
            missingChatIdRawCost: '0.5',
            missingExecutionIdCost: '0',
            missingExecutionIdCount: 0,
            missingExecutionIdRawCost: '0',
          },
        ],
        4: [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
        5: [{ totalLedgerCost: '0' }],
        8: [{ total: 4, withLedgerCost: 1 }],
        9: [{ total: 2 }],
        25: [{ totalRows: 1, nullWorkspaceRows: 0, missingActorRows: 0 }],
        26: [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '7d',
    })

    expect(analytics.copilot.chats.total).toBe(4)
    expect(analytics.copilot.chats.withLedgerCost).toBe(1)
    expect(analytics.attribution.missingChatId).toEqual({
      billableCost: 0.5,
      rawCost: 0.5,
      count: 1,
    })
    expect(analytics.summary.chatCount).toBe(4)
    expect(analytics.summary.billableCost).toBeCloseTo(1.5, 8)
  })

  it('resolves all-time bounds when postgres returns ISO date strings', async () => {
    wireTerminalQueue([
      [{ minAt: '2025-01-01T00:00:00.000Z', maxAt: '2025-06-01T00:00:00.000Z' }],
      [{ minAt: '2025-02-01T00:00:00.000Z', maxAt: '2025-06-15T00:00:00.000Z' }],
      [{ minAt: '2025-03-01T00:00:00.000Z', maxAt: '2025-06-10T00:00:00.000Z' }],
      [{ minAt: '2025-04-01T00:00:00.000Z', maxAt: '2025-06-20T00:00:00.000Z' }],
      ...buildAnalyticsQueue({
        0: [
          {
            source: 'workflow',
            billableCost: '4',
            rawCost: '4',
            count: 1,
            ...EMPTY_USAGE,
            invocationCount: 1,
          },
        ],
        1: [{ chargeType: 'provider', billableCost: '4', rawCost: '4', count: 1 }],
        2: [{ ...EMPTY_USAGE, invocationCount: 1 }],
        3: ATTRIBUTION_OK,
        4: [{ total: 1, withProjectedCost: 1, totalProjectedCost: '4' }],
        5: [{ totalLedgerCost: '4' }],
        8: [{ total: 0, withLedgerCost: 0 }],
        9: [{ total: 0 }],
        25: [{ totalRows: 1, nullWorkspaceRows: 0, missingActorRows: 0 }],
        26: [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }],
      }),
    ])

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      allTime: true,
    })

    expect(analytics.period.startTime).toBe('2025-01-01T00:00:00.000Z')
    expect(new Date(analytics.period.endTime).getTime()).toBeGreaterThanOrEqual(
      new Date('2025-06-20T00:00:00.000Z').getTime()
    )
    expect(analytics.summary.billableCost).toBe(4)
    expect(analytics.workflow.executions.total).toBe(1)
  })

  it('filters mixed-source rollups when a source subset is requested', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        0: [
          {
            source: 'workflow',
            billableCost: '4',
            rawCost: '4',
            count: 1,
            ...EMPTY_USAGE,
            invocationCount: 1,
          },
        ],
        1: [{ chargeType: 'provider', billableCost: '4', rawCost: '4', count: 1 }],
        2: [{ ...EMPTY_USAGE, invocationCount: 1 }],
        3: ATTRIBUTION_OK,
        4: [{ total: 1, withProjectedCost: 1, totalProjectedCost: '4' }],
        5: [{ totalLedgerCost: '4' }],
        8: [{ total: 0, withLedgerCost: 0 }],
        9: [{ total: 0 }],
        25: [{ totalRows: 1, nullWorkspaceRows: 0, missingActorRows: 0 }],
        26: [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
      sources: ['workflow'],
    })

    expect(analytics.bySource).toEqual([
      expect.objectContaining({ source: 'workflow', billableCost: 4, rawCost: 4, count: 1 }),
    ])
    expect(analytics.summary.billableCost).toBe(4)
  })

  it('returns top mothership chats with owning user ids', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        3: ATTRIBUTION_OK,
        4: [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
        5: [{ totalLedgerCost: '0' }],
        8: [{ total: 2, withLedgerCost: 2 }],
        9: [{ total: 3 }],
        12: [
          {
            chatId: 'chat-expensive',
            title: 'Heavy research',
            chatType: 'mothership',
            userId: 'user-alice',
            runCount: 4,
            billableCost: '12.5',
            rawCost: '10',
            count: 8,
          },
          {
            chatId: 'chat-cheaper',
            title: null,
            chatType: 'copilot',
            userId: 'user-bob',
            runCount: 1,
            billableCost: '1.25',
            rawCost: '1.25',
            count: 2,
          },
        ],
        25: DATA_HEALTH_OK[0],
        26: DATA_HEALTH_OK[1],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
    })

    expect(analytics.copilot.byChat).toEqual([
      expect.objectContaining({
        chatId: 'chat-expensive',
        title: 'Heavy research',
        chatType: 'mothership',
        userId: 'user-alice',
        runCount: 4,
        billableCost: 12.5,
        rawCost: 10,
        count: 8,
      }),
      expect.objectContaining({
        chatId: 'chat-cheaper',
        title: null,
        chatType: 'copilot',
        userId: 'user-bob',
        runCount: 1,
        billableCost: 1.25,
      }),
    ])
  })

  it('returns lineage drill-down when rootExecutionId is provided', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue(
        {
          3: ATTRIBUTION_OK,
          4: [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
          5: [{ totalLedgerCost: '0' }],
          24: [
            {
              executionId: 'exec-child',
              parentExecutionId: 'exec-root',
              workflowId: 'wf-1',
              workflowName: 'Child',
              startedAt: new Date('2026-01-02T00:00:00.000Z'),
              trigger: 'api',
              actorUserId: 'user-1',
              actorType: 'user',
              billableCost: '2',
              rawCost: '2',
            },
          ],
          25: [{ inclusiveBillableCost: '5', inclusiveRawCost: '4' }],
          27: DATA_HEALTH_OK[0],
          28: DATA_HEALTH_OK[1],
        },
        ANALYTICS_QUERY_COUNT_WITH_DRILLDOWN
      )
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
      rootExecutionId: 'exec-root',
    })

    expect(analytics.lineage.drillDown).toEqual(
      expect.objectContaining({
        rootExecutionId: 'exec-root',
        inclusiveBillableCost: 5,
        executions: [
          expect.objectContaining({
            executionId: 'exec-child',
            parentExecutionId: 'exec-root',
            billableCost: 2,
          }),
        ],
      })
    )
  })

  it('virtually splits embedded agent tools from provider into tool buckets', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue(
        {
          0: [
            {
              source: 'workflow',
              billableCost: '0.11',
              rawCost: '0.09',
              count: 2,
              ...EMPTY_USAGE,
            },
          ],
          1: [
            { chargeType: 'provider', billableCost: '0.10', rawCost: '0.08', count: 1 },
            { chargeType: 'tool', billableCost: '0.01', rawCost: '0.01', count: 1 },
          ],
          2: [EMPTY_USAGE],
          3: ATTRIBUTION_OK,
          4: [{ total: 1, withProjectedCost: 1, totalProjectedCost: '0.11' }],
          5: [{ totalLedgerCost: '0.11' }],
          15: [{ model: 'gpt-4o', billableCost: '0.10', rawCost: '0.08', count: 1 }],
          17: [{ toolId: 'exa_search', billableCost: '0.01', rawCost: '0.01', count: 1 }],
          25: DATA_HEALTH_OK[0],
          26: DATA_HEALTH_OK[1],
          27: [
            {
              executionId: 'exec-1',
              description: 'gpt-4o',
              provider: 'openai',
              cost: '0.10',
              rawCost: '0.08',
              metadata: {
                inputTokens: 1000,
                outputTokens: 100,
                toolCost: 0.04,
                embeddedToolCosts: { 'gpt-image-1.5': 0.04 },
              },
            },
          ],
        },
        28
      )
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
      sources: ['workflow'],
    })

    expect(analytics.summary.billableCost).toBeCloseTo(0.11, 8)
    expect(analytics.byChargeType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chargeType: 'provider',
          billableCost: expect.closeTo(0.06, 8),
        }),
        expect.objectContaining({ chargeType: 'tool', billableCost: expect.closeTo(0.05, 8) }),
      ])
    )
    expect(analytics.byModel).toEqual([
      expect.objectContaining({
        model: 'gpt-4o',
        billableCost: expect.closeTo(0.06, 8),
        rawCost: expect.closeTo(0.048, 8),
      }),
    ])
    expect(analytics.byTool).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolId: 'gpt-image-1.5', billableCost: 0.04 }),
        expect.objectContaining({ toolId: 'exa_search', billableCost: 0.01 }),
      ])
    )

    const chargeTypeTotal = analytics.byChargeType.reduce((sum, row) => sum + row.billableCost, 0)
    expect(chargeTypeTotal).toBeCloseTo(analytics.summary.billableCost, 8)
  })

  it('merges active-user buckets into timeSeries and exposes period total', async () => {
    wireTerminalQueue(
      buildAnalyticsQueue({
        3: ATTRIBUTION_OK,
        4: [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
        5: [{ totalLedgerCost: '0' }],
        8: [{ total: 0, withLedgerCost: 0 }],
        9: [{ total: 0 }],
        19: [
          {
            bucketStart: new Date('2026-07-01T00:00:00.000Z'),
            billableCost: '1.5',
            rawCost: '1.5',
            count: 2,
            ...EMPTY_USAGE,
            invocationCount: 2,
          },
        ],
        20: [
          {
            bucketStart: new Date('2026-07-01T00:00:00.000Z'),
            executionCount: 4,
          },
          {
            bucketStart: new Date('2026-07-02T00:00:00.000Z'),
            executionCount: 1,
          },
        ],
        21: [
          {
            bucketStart: new Date('2026-07-01T00:00:00.000Z'),
            activeUserCount: 3,
          },
          {
            bucketStart: new Date('2026-07-03T00:00:00.000Z'),
            activeUserCount: 2,
          },
        ],
        22: [{ activeUserCount: 4 }],
        25: DATA_HEALTH_OK[0],
        26: DATA_HEALTH_OK[1],
      })
    )

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
    })

    expect(analytics.summary.activeUserCount).toBe(4)
    expect(analytics.timeSeries).toEqual([
      expect.objectContaining({
        bucketStart: '2026-07-01T00:00:00.000Z',
        billableCost: 1.5,
        executionCount: 4,
        activeUserCount: 3,
      }),
      expect.objectContaining({
        bucketStart: '2026-07-02T00:00:00.000Z',
        billableCost: 0,
        executionCount: 1,
        activeUserCount: 0,
      }),
      expect.objectContaining({
        bucketStart: '2026-07-03T00:00:00.000Z',
        billableCost: 0,
        executionCount: 0,
        activeUserCount: 2,
      }),
    ])
  })
})
