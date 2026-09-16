/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockGetUserUsageAnalytics, InvalidUserWorkspaceError } = vi.hoisted(() => {
  class InvalidUserWorkspaceError extends Error {
    constructor(public readonly workspaceId: string) {
      super(`Workspace ${workspaceId} is not a workspace you belong to`)
      this.name = 'InvalidUserWorkspaceError'
    }
  }

  return {
    mockGetSession: vi.fn(),
    mockGetUserUsageAnalytics: vi.fn(),
    InvalidUserWorkspaceError,
  }
})

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/workspaces/usage/user-analytics', () => ({
  getUserUsageAnalytics: mockGetUserUsageAnalytics,
  InvalidUserWorkspaceError,
}))

vi.mock('@/lib/workspaces/usage/analytics', () => ({
  InvalidUsageSourcesError: class InvalidUsageSourcesError extends Error {
    constructor(public readonly invalidSources: string[]) {
      super(`Invalid usage sources: ${invalidSources.join(', ')}`)
      this.name = 'InvalidUsageSourcesError'
    }
  },
  parseWorkspaceUsageSources: (sources?: string) =>
    sources
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
}))

import { GET } from '@/app/api/users/me/usage/route'

const ANALYTICS = {
  period: {
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-02-01T00:00:00.000Z',
  },
  workspaces: [
    { id: 'ws-1', name: 'Alpha' },
    { id: 'ws-2', name: 'Beta' },
  ],
  summary: {
    billableCost: 12.5,
    rawCost: 11,
    billableCostCredits: 2500,
    ledgerEntryCount: 8,
    executionCount: 3,
    chatCount: 1,
    runCount: 2,
    activeUserCount: 1,
    usage: {
      inputTokens: 400,
      outputTokens: 200,
      totalTokens: 600,
      invocationCount: 8,
    },
  },
  byWorkspace: [],
  byChargeType: [],
  attribution: {
    missingChatId: { billableCost: 0, rawCost: 0, count: 0 },
    missingExecutionId: { billableCost: 0, rawCost: 0, count: 0 },
  },
  workflow: {
    executions: {
      total: 0,
      withProjectedCost: 0,
      totalProjectedCost: 0,
      totalLedgerCost: 0,
    },
    byTrigger: [],
    byWorkflow: [],
  },
  copilot: {
    chats: { total: 0, withLedgerCost: 0 },
    runs: { total: 0 },
    byChatType: [],
    byChat: [],
    byModel: [],
    triggeredWorkflows: {
      executionCount: 0,
      billableCost: 0,
      rawCost: 0,
      byChat: [],
    },
  },
  bySource: [],
  byModel: [],
  byProvider: [],
  byTool: [],
  byVendor: [],
  timeSeries: [],
  lineage: { roots: [] },
  dataHealth: { limitedAttribution: false, warnings: [] },
}

async function callGet(query = '') {
  const request = createMockRequest(
    'GET',
    undefined,
    {},
    `http://localhost:3000/api/users/me/usage${query}`
  )
  const response = await GET(request)
  return { status: response.status, body: await response.json() }
}

describe('GET /api/users/me/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'u-1' } })
    mockGetUserUsageAnalytics.mockResolvedValue(ANALYTICS)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const { status } = await callGet()
    expect(status).toBe(401)
    expect(mockGetUserUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns user usage analytics for the signed-in user', async () => {
    const { status, body } = await callGet('?period=30d')
    expect(status).toBe(200)
    expect(body).toEqual(ANALYTICS)
    expect(mockGetUserUsageAnalytics).toHaveBeenCalledWith({
      userId: 'u-1',
      startTime: undefined,
      endTime: undefined,
      period: '30d',
      sources: undefined,
      allTime: false,
      workspaceId: undefined,
      rootExecutionId: undefined,
    })
  })

  it('forwards workspaceId and rootExecutionId filters to analytics', async () => {
    await callGet('?workspaceId=ws-2&rootExecutionId=root-1')
    expect(mockGetUserUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        workspaceId: 'ws-2',
        rootExecutionId: 'root-1',
      })
    )
  })

  it('forwards source filters to analytics', async () => {
    await callGet('?sources=workflow,copilot')
    expect(mockGetUserUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ['workflow', 'copilot'],
      })
    )
  })

  it('returns 403 when workspaceId is not a membership workspace', async () => {
    mockGetUserUsageAnalytics.mockRejectedValue(new InvalidUserWorkspaceError('ws-foreign'))

    const { status, body } = await callGet('?workspaceId=ws-foreign')
    expect(status).toBe(403)
    expect(body.error).toMatch(/not a workspace you belong to/i)
  })
})
