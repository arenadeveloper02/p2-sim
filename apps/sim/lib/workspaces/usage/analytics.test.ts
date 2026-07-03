/**
 * @vitest-environment node
 */
import { dbChainMock, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db', () => dbChainMock)

import { getWorkspaceUsageAnalytics } from '@/lib/workspaces/usage/analytics'

const WORKSPACE_ID = 'ws-1'

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

describe('getWorkspaceUsageAnalytics reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('rolls up mixed-source ledger costs into summary and bySource buckets', async () => {
    wireTerminalQueue([
      [
        { source: 'workflow', billableCost: '6', rawCost: '5', count: 2 },
        { source: 'workspace-chat', billableCost: '2.5', rawCost: '2.5', count: 1 },
        { source: 'mothership_block', billableCost: '1', rawCost: '0.8', count: 1 },
      ],
      [
        {
          missingChatIdCost: '0',
          missingChatIdCount: 0,
          missingChatIdRawCost: '0',
          missingExecutionIdCost: '0',
          missingExecutionIdCount: 0,
          missingExecutionIdRawCost: '0',
        },
      ],
      [{ total: 2, withProjectedCost: 2, totalProjectedCost: '6' }],
      [{ totalLedgerCost: '6' }],
      [],
      [],
      [{ total: 1, withLedgerCost: 1 }],
      [{ total: 1 }],
      [],
      [],
      [],
      [],
      [],
      [],
    ])

    const analytics = await getWorkspaceUsageAnalytics({
      workspaceId: WORKSPACE_ID,
      period: '30d',
    })

    expect(analytics.summary.billableCost).toBeCloseTo(9.5, 8)
    expect(analytics.summary.rawCost).toBeCloseTo(8.3, 8)
    expect(analytics.summary.ledgerEntryCount).toBe(4)
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
    expect(analytics.workflow.executions.totalProjectedCost).toBe(6)
    expect(analytics.workflow.executions.totalLedgerCost).toBe(6)
  })

  it('surfaces copilot transcripts that lack ledger rows and unattributed mothership cost', async () => {
    wireTerminalQueue([
      [{ source: 'workspace-chat', billableCost: '1.5', rawCost: '1.5', count: 1 }],
      [
        {
          missingChatIdCost: '0.5',
          missingChatIdCount: 1,
          missingChatIdRawCost: '0.5',
          missingExecutionIdCost: '0',
          missingExecutionIdCount: 0,
          missingExecutionIdRawCost: '0',
        },
      ],
      [{ total: 0, withProjectedCost: 0, totalProjectedCost: '0' }],
      [{ totalLedgerCost: '0' }],
      [],
      [],
      [{ total: 4, withLedgerCost: 1 }],
      [{ total: 2 }],
      [],
      [],
      [],
      [],
      [],
      [],
    ])

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

  it('filters mixed-source rollups when a source subset is requested', async () => {
    wireTerminalQueue([
      [{ source: 'workflow', billableCost: '4', rawCost: '4', count: 1 }],
      [
        {
          missingChatIdCost: '0',
          missingChatIdCount: 0,
          missingChatIdRawCost: '0',
          missingExecutionIdCost: '0',
          missingExecutionIdCount: 0,
          missingExecutionIdRawCost: '0',
        },
      ],
      [{ total: 1, withProjectedCost: 1, totalProjectedCost: '4' }],
      [{ totalLedgerCost: '4' }],
      [],
      [],
      [{ total: 0, withLedgerCost: 0 }],
      [{ total: 0 }],
      [],
      [],
      [],
      [],
      [],
      [],
    ])

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
})
