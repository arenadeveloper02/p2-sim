/**
 * @vitest-environment node
 */
import { dbChainMock, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db', () => dbChainMock)

import {
  getOrganizationUsageAnalytics,
  InvalidOrganizationWorkspaceError,
} from '@/lib/workspaces/usage/organization-analytics'

const ORGANIZATION_ID = 'org-1'
const WS_A = { id: 'ws-a', name: 'Alpha' }
const WS_B = { id: 'ws-b', name: 'Beta' }

/**
 * Query terminals consumed by getOrganizationUsageAnalytics with a fixed period
 * (no all-time bounds probes):
 * 0 workspaces list (orderBy)
 * 1–28 Promise.all aggregations
 * 29 model metadata (embedded tool split)
 */
const ORG_ANALYTICS_QUERY_COUNT = 30

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
}

function emptyTail(count: number) {
  return Array.from({ length: count }, () => [])
}

function buildOrgAnalyticsQueue(
  overrides: Record<number, unknown[]>,
  count = ORG_ANALYTICS_QUERY_COUNT
) {
  const results = emptyTail(count)
  for (const [index, value] of Object.entries(overrides)) {
    results[Number(index)] = value
  }
  return results
}

const DATA_HEALTH_LEDGER_OK = [{ totalRows: 4, nullWorkspaceRows: 0, missingActorRows: 0 }]
const DATA_HEALTH_EXECUTION_OK = [{ executionsWithCostNoLedger: 0, costTotalDriftCount: 0 }]
const WORKFLOW_SUMMARY = [{ total: 4, withProjectedCost: 2, totalProjectedCost: '8' }]
const WORKFLOW_LEDGER = [{ totalLedgerCost: '7' }]
const CHAT_SUMMARY = [{ total: 2, withLedgerCost: 1 }]
const RUN_SUMMARY = [{ total: 3 }]
const ATTRIBUTION_EMPTY = [
  {
    missingChatIdCost: '0',
    missingChatIdCount: 0,
    missingChatIdRawCost: '0',
    missingExecutionIdCost: '0',
    missingExecutionIdCount: 0,
    missingExecutionIdRawCost: '0',
  },
]

/**
 * Wires where / groupBy / orderBy terminals to a shared FIFO queue so org
 * analytics Promise.all results resolve in declaration order.
 */
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

  dbChainMockFns.orderBy.mockImplementation(() => {
    const thenable: {
      limit: ReturnType<typeof vi.fn>
      then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>
    } = {
      limit: dbChainMockFns.limit,
      then: (onfulfilled) => next().then(onfulfilled),
    }
    return thenable
  })
}

function baseHappyPathOverrides(extra: Record<number, unknown[]> = {}) {
  return {
    0: [WS_A, WS_B],
    4: ATTRIBUTION_EMPTY,
    6: WORKFLOW_SUMMARY,
    7: WORKFLOW_LEDGER,
    10: CHAT_SUMMARY,
    11: RUN_SUMMARY,
    27: DATA_HEALTH_LEDGER_OK,
    28: DATA_HEALTH_EXECUTION_OK,
    29: [],
    ...extra,
  }
}

describe('getOrganizationUsageAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('returns empty analytics when the organization has no active workspaces', async () => {
    wireTerminalQueue(buildOrgAnalyticsQueue({ 0: [] }))

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.workspaces).toEqual([])
    expect(analytics.summary.billableCost).toBe(0)
    expect(analytics.byWorkspace).toEqual([])
    expect(analytics.workflow.byWorkflow).toEqual([])
    expect(analytics.copilot.byChat).toEqual([])
    expect(analytics.byChargeType).toEqual([])
    expect(analytics.lineage.roots).toEqual([])
  })

  it('rolls up costs across multiple org workspaces and sorts byWorkspace by spend', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          1: [
            {
              source: 'workflow',
              billableCost: '10',
              rawCost: '9',
              count: 3,
              ...EMPTY_USAGE,
              invocationCount: 3,
            },
            {
              source: 'workspace-chat',
              billableCost: '5',
              rawCost: '5',
              count: 2,
              ...EMPTY_USAGE,
              invocationCount: 2,
            },
          ],
          3: [{ ...EMPTY_USAGE, totalTokens: 900, invocationCount: 5 }],
          5: [
            {
              workspaceId: WS_A.id,
              billableCost: '4',
              rawCost: '4',
              count: 2,
              ...EMPTY_USAGE,
              invocationCount: 2,
            },
            {
              workspaceId: WS_B.id,
              billableCost: '11',
              rawCost: '10',
              count: 3,
              ...EMPTY_USAGE,
              invocationCount: 3,
            },
          ],
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.workspaces).toEqual([WS_A, WS_B])
    expect(analytics.summary.billableCost).toBeCloseTo(15, 8)
    expect(analytics.summary.rawCost).toBeCloseTo(14, 8)
    expect(analytics.summary.ledgerEntryCount).toBe(5)
    expect(analytics.summary.executionCount).toBe(4)
    expect(analytics.summary.chatCount).toBe(2)
    expect(analytics.summary.runCount).toBe(3)
    expect(analytics.workflow.executions.total).toBe(4)
    expect(analytics.byWorkspace).toEqual([
      expect.objectContaining({
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        billableCost: 11,
        rawCost: 10,
        count: 3,
      }),
      expect.objectContaining({
        workspaceId: WS_A.id,
        workspaceName: WS_A.name,
        billableCost: 4,
        rawCost: 4,
        count: 2,
      }),
    ])
  })

  it('excludes personal (non-org) workspace spend from byWorkspace even if present in rollup rows', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          1: [
            {
              source: 'workflow',
              billableCost: '7',
              rawCost: '7',
              count: 2,
              ...EMPTY_USAGE,
              invocationCount: 2,
            },
          ],
          3: [{ ...EMPTY_USAGE, invocationCount: 2 }],
          5: [
            {
              workspaceId: WS_A.id,
              billableCost: '3',
              rawCost: '3',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
            {
              workspaceId: WS_B.id,
              billableCost: '4',
              rawCost: '4',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
            {
              workspaceId: 'ws-personal',
              billableCost: '999',
              rawCost: '999',
              count: 50,
              ...EMPTY_USAGE,
              invocationCount: 50,
            },
          ],
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.workspaces.map((ws) => ws.id)).toEqual([WS_A.id, WS_B.id])
    expect(analytics.byWorkspace.map((row) => row.workspaceId)).toEqual([WS_B.id, WS_A.id])
    expect(analytics.byWorkspace.some((row) => row.workspaceId === 'ws-personal')).toBe(false)
    expect(analytics.summary.billableCost).toBe(7)
  })

  it('ranks expensive workflows and chats org-wide with owning workspaceId', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          9: [
            {
              workspaceId: WS_A.id,
              workspaceName: WS_A.name,
              workflowId: 'wf-cheap',
              workflowName: 'Cheap flow',
              executionCount: 10,
              billableCost: '2',
              rawCost: '2',
              count: 10,
            },
            {
              workspaceId: WS_B.id,
              workspaceName: WS_B.name,
              workflowId: 'wf-expensive',
              workflowName: 'Expensive flow',
              executionCount: 3,
              billableCost: '40',
              rawCost: '38',
              count: 12,
            },
          ],
          14: [
            {
              workspaceId: WS_B.id,
              workspaceName: WS_B.name,
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
              workspaceId: WS_A.id,
              workspaceName: WS_A.name,
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
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.workflow.byWorkflow).toEqual([
      expect.objectContaining({
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        workflowId: 'wf-expensive',
        workflowName: 'Expensive flow',
        billableCost: 40,
        executionCount: 3,
      }),
      expect.objectContaining({
        workspaceId: WS_A.id,
        workspaceName: WS_A.name,
        workflowId: 'wf-cheap',
        billableCost: 2,
      }),
    ])

    expect(analytics.copilot.byChat).toEqual([
      expect.objectContaining({
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        chatId: 'chat-expensive',
        title: 'Heavy research',
        chatType: 'mothership',
        userId: 'user-alice',
        runCount: 4,
        billableCost: 12.5,
      }),
      expect.objectContaining({
        workspaceId: WS_A.id,
        workspaceName: WS_A.name,
        chatId: 'chat-cheaper',
        userId: 'user-bob',
        billableCost: 1.25,
      }),
    ])
  })

  it('surfaces null workspaceId ledger rows as data-health only', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          0: [WS_A],
          1: [
            {
              source: 'workflow',
              billableCost: '3',
              rawCost: '3',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
          ],
          3: [{ ...EMPTY_USAGE, invocationCount: 1 }],
          5: [
            {
              workspaceId: WS_A.id,
              billableCost: '3',
              rawCost: '3',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
            {
              workspaceId: null,
              billableCost: '1',
              rawCost: '1',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
          ],
          27: [{ totalRows: 10, nullWorkspaceRows: 2, missingActorRows: 1 }],
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.byWorkspace).toEqual([
      expect.objectContaining({
        workspaceId: WS_A.id,
        billableCost: 3,
        count: 1,
      }),
    ])
    expect(analytics.dataHealth.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'null-workspace-id',
          severity: 'error',
          count: 2,
        }),
        expect.objectContaining({
          id: 'missing-actor-attribution',
          severity: 'warning',
          count: 1,
        }),
      ])
    )
    expect(analytics.dataHealth.limitedAttribution).toBe(false)
  })

  it('subsets analytics to an optional workspaceId while keeping full workspaces list', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          1: [
            {
              source: 'workflow',
              billableCost: '4',
              rawCost: '4',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
          ],
          3: [{ ...EMPTY_USAGE, invocationCount: 1 }],
          5: [
            {
              workspaceId: WS_B.id,
              billableCost: '4',
              rawCost: '4',
              count: 1,
              ...EMPTY_USAGE,
              invocationCount: 1,
            },
          ],
          6: [{ total: 1, withProjectedCost: 1, totalProjectedCost: '4' }],
          10: [{ total: 0, withLedgerCost: 0 }],
          11: [{ total: 0 }],
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
      workspaceId: WS_B.id,
    })

    expect(analytics.workspaces).toEqual([WS_A, WS_B])
    expect(analytics.byWorkspace).toEqual([
      expect.objectContaining({
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        billableCost: 4,
      }),
    ])
    expect(analytics.summary.billableCost).toBe(4)
  })

  it('rejects workspaceId that is not an active org workspace', async () => {
    wireTerminalQueue(buildOrgAnalyticsQueue({ 0: [WS_A, WS_B] }))

    await expect(
      getOrganizationUsageAnalytics({
        organizationId: ORGANIZATION_ID,
        period: '30d',
        workspaceId: 'ws-foreign',
      })
    ).rejects.toBeInstanceOf(InvalidOrganizationWorkspaceError)
  })

  it('returns charge-type, model, and lineage roots with workspace attribution', async () => {
    wireTerminalQueue(
      buildOrgAnalyticsQueue(
        baseHappyPathOverrides({
          2: [
            {
              chargeType: 'provider',
              billableCost: '6',
              rawCost: '5',
              count: 2,
            },
            {
              chargeType: 'tool',
              billableCost: '1',
              rawCost: '1',
              count: 1,
            },
          ],
          8: [
            {
              trigger: 'api',
              executionCount: 2,
              billableCost: '3',
              rawCost: '3',
              count: 2,
            },
          ],
          12: [
            {
              chatType: 'mothership',
              chatCount: 1,
              runCount: 2,
              billableCost: '2',
              rawCost: '2',
              count: 2,
            },
          ],
          17: [
            {
              model: 'gpt-4o',
              billableCost: '5',
              rawCost: '5',
              count: 2,
            },
          ],
          25: [
            {
              rootExecutionId: 'root-1',
              workspaceId: WS_B.id,
              executionCount: 3,
              inclusiveBillableCost: '9',
              inclusiveRawCost: '8',
            },
          ],
          26: [
            {
              triggeringChatId: 'chat-1',
              workspaceId: WS_A.id,
              executionCount: 2,
              billableCost: '1.5',
              rawCost: '1.5',
            },
          ],
        })
      )
    )

    const analytics = await getOrganizationUsageAnalytics({
      organizationId: ORGANIZATION_ID,
      period: '30d',
    })

    expect(analytics.byChargeType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chargeType: 'provider', billableCost: 6 }),
        expect.objectContaining({ chargeType: 'tool', billableCost: 1 }),
      ])
    )
    expect(analytics.workflow.byTrigger).toEqual([
      expect.objectContaining({ trigger: 'api', executionCount: 2, billableCost: 3 }),
    ])
    expect(analytics.copilot.byChatType).toEqual([
      expect.objectContaining({ chatType: 'mothership', chatCount: 1, runCount: 2 }),
    ])
    expect(analytics.byModel).toEqual([
      expect.objectContaining({ model: 'gpt-4o', billableCost: 5 }),
    ])
    expect(analytics.lineage.roots).toEqual([
      expect.objectContaining({
        rootExecutionId: 'root-1',
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        inclusiveBillableCost: 9,
        executionCount: 3,
      }),
    ])
    expect(analytics.copilot.triggeredWorkflows).toEqual(
      expect.objectContaining({
        executionCount: 2,
        billableCost: 1.5,
        byChat: [
          expect.objectContaining({
            triggeringChatId: 'chat-1',
            workspaceId: WS_A.id,
            workspaceName: WS_A.name,
          }),
        ],
      })
    )
    expect(analytics).not.toHaveProperty('lineage.drillDown')
  })
})
