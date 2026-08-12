/**
 * @vitest-environment node
 */
import { dbChainMock, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockListUserWorkspaces } = vi.hoisted(() => ({
  mockListUserWorkspaces: vi.fn(),
}))

vi.mock('@sim/db', () => dbChainMock)

vi.mock('@/lib/workspaces/utils', () => ({
  listUserWorkspaces: mockListUserWorkspaces,
}))

import {
  getUserUsageAnalytics,
  InvalidUserWorkspaceError,
} from '@/lib/workspaces/usage/user-analytics'

const USER_ID = 'user-1'
const WS_A = { id: 'ws-a', name: 'Alpha' }
const WS_B = { id: 'ws-b', name: 'Beta' }

/**
 * Query terminals for getUserUsageAnalytics with a fixed period
 * (membership mocked; no all-time bounds probes):
 * 0–27 Promise.all aggregations
 * 28 model metadata (embedded tool split)
 */
const USER_ANALYTICS_QUERY_COUNT = 29

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
}

function emptyTail(count: number) {
  return Array.from({ length: count }, () => [])
}

function buildUserAnalyticsQueue(
  overrides: Record<number, unknown[]>,
  count = USER_ANALYTICS_QUERY_COUNT
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

const MEMBERSHIP = [
  { workspaceId: WS_A.id, workspaceName: WS_A.name, role: 'member' as const },
  { workspaceId: WS_B.id, workspaceName: WS_B.name, role: 'admin' as const },
]

/**
 * Wires where / groupBy / orderBy terminals to a shared FIFO queue so user
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
    3: ATTRIBUTION_EMPTY,
    5: WORKFLOW_SUMMARY,
    6: WORKFLOW_LEDGER,
    9: CHAT_SUMMARY,
    10: RUN_SUMMARY,
    26: DATA_HEALTH_LEDGER_OK,
    27: DATA_HEALTH_EXECUTION_OK,
    28: [],
    ...extra,
  }
}

describe('getUserUsageAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockListUserWorkspaces.mockResolvedValue(MEMBERSHIP)
  })

  it('returns empty analytics when the user has no membership workspaces', async () => {
    mockListUserWorkspaces.mockResolvedValue([])

    const analytics = await getUserUsageAnalytics({
      userId: USER_ID,
      period: '30d',
    })

    expect(analytics.workspaces).toEqual([])
    expect(analytics.summary.billableCost).toBe(0)
    expect(analytics.byWorkspace).toEqual([])
    expect(analytics.workflow.byWorkflow).toEqual([])
    expect(analytics.copilot.byChat).toEqual([])
    expect(analytics.byChargeType).toEqual([])
    expect(analytics.lineage.roots).toEqual([])
    expect(analytics).not.toHaveProperty('byUser')
    expect(analytics).not.toHaveProperty('byActor')
  })

  it('rolls up costs across membership workspaces and sorts byWorkspace by spend', async () => {
    wireTerminalQueue(
      buildUserAnalyticsQueue(
        baseHappyPathOverrides({
          0: [
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
          2: [{ ...EMPTY_USAGE, totalTokens: 900, invocationCount: 5 }],
          4: [
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

    const analytics = await getUserUsageAnalytics({
      userId: USER_ID,
      period: '30d',
    })

    expect(mockListUserWorkspaces).toHaveBeenCalledWith(USER_ID)
    expect(analytics.workspaces).toEqual([WS_A, WS_B])
    expect(analytics.summary.billableCost).toBeCloseTo(15, 8)
    expect(analytics.summary.ledgerEntryCount).toBe(5)
    expect(analytics.summary.executionCount).toBe(4)
    expect(analytics.byWorkspace).toEqual([
      expect.objectContaining({
        workspaceId: WS_B.id,
        workspaceName: WS_B.name,
        billableCost: 11,
      }),
      expect.objectContaining({
        workspaceId: WS_A.id,
        workspaceName: WS_A.name,
        billableCost: 4,
      }),
    ])
    expect(analytics).not.toHaveProperty('byUser')
    expect(analytics).not.toHaveProperty('byActor')
  })

  it('scopes analytics to a single membership workspace when workspaceId is set', async () => {
    wireTerminalQueue(
      buildUserAnalyticsQueue(
        baseHappyPathOverrides({
          0: [
            {
              source: 'workflow',
              billableCost: '4',
              rawCost: '4',
              count: 2,
              ...EMPTY_USAGE,
              invocationCount: 2,
            },
          ],
          2: [{ ...EMPTY_USAGE, invocationCount: 2 }],
          4: [
            {
              workspaceId: WS_A.id,
              billableCost: '4',
              rawCost: '4',
              count: 2,
              ...EMPTY_USAGE,
              invocationCount: 2,
            },
          ],
          22: [
            {
              rootExecutionId: 'root-1',
              executionCount: 2,
              inclusiveBillableCost: '4',
              inclusiveRawCost: '4',
            },
          ],
        })
      )
    )

    const analytics = await getUserUsageAnalytics({
      userId: USER_ID,
      period: '30d',
      workspaceId: WS_A.id,
    })

    expect(analytics.workspaces).toEqual([WS_A, WS_B])
    expect(analytics.byWorkspace).toEqual([
      expect.objectContaining({ workspaceId: WS_A.id, billableCost: 4 }),
    ])
    expect(analytics.lineage.roots).toEqual([
      expect.objectContaining({ rootExecutionId: 'root-1', executionCount: 2 }),
    ])
  })

  it('returns empty lineage roots when viewing all membership workspaces', async () => {
    wireTerminalQueue(buildUserAnalyticsQueue(baseHappyPathOverrides()))

    const analytics = await getUserUsageAnalytics({
      userId: USER_ID,
      period: '30d',
    })

    expect(analytics.lineage.roots).toEqual([])
    expect(analytics.lineage.drillDown).toBeUndefined()
  })

  it('rejects workspaceId that is not a membership workspace', async () => {
    await expect(
      getUserUsageAnalytics({
        userId: USER_ID,
        period: '30d',
        workspaceId: 'ws-foreign',
      })
    ).rejects.toBeInstanceOf(InvalidUserWorkspaceError)
  })

  it('returns lineage drill-down when a single workspace and rootExecutionId are provided', async () => {
    wireTerminalQueue(
      buildUserAnalyticsQueue(
        baseHappyPathOverrides({
          23: [
            {
              executionId: 'exec-1',
              parentExecutionId: null,
              workflowId: 'wf-1',
              workflowName: 'Flow',
              startedAt: new Date('2026-01-15T00:00:00.000Z'),
              trigger: 'manual',
              actorUserId: USER_ID,
              actorType: 'user',
              billableCost: '2',
              rawCost: '2',
            },
          ],
          24: [{ inclusiveBillableCost: '2', inclusiveRawCost: '2' }],
        })
      )
    )

    const analytics = await getUserUsageAnalytics({
      userId: USER_ID,
      period: '30d',
      workspaceId: WS_A.id,
      rootExecutionId: 'exec-root',
    })

    expect(analytics.lineage.drillDown).toEqual(
      expect.objectContaining({
        rootExecutionId: 'exec-root',
        inclusiveBillableCost: 2,
        executions: [
          expect.objectContaining({
            executionId: 'exec-1',
            actorUserId: USER_ID,
            billableCost: 2,
          }),
        ],
      })
    )
  })
})
