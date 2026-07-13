/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockHasWorkspaceAdminAccess, mockGetWorkspaceUsageAnalytics } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockHasWorkspaceAdminAccess: vi.fn(),
    mockGetWorkspaceUsageAnalytics: vi.fn(),
  })
)

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  hasWorkspaceAdminAccess: mockHasWorkspaceAdminAccess,
}))

vi.mock('@/lib/workspaces/usage/analytics', () => ({
  getWorkspaceUsageAnalytics: mockGetWorkspaceUsageAnalytics,
  parseWorkspaceUsageSources: (sources?: string) =>
    sources
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
}))

import { GET } from '@/app/api/workspaces/[id]/usage/route'

const WORKSPACE_ID = 'ws-1'

const ANALYTICS = {
  period: {
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-02-01T00:00:00.000Z',
  },
  summary: {
    billableCost: 12.5,
    rawCost: 10,
    billableCostCredits: 2500,
    ledgerEntryCount: 4,
    executionCount: 2,
    chatCount: 1,
    runCount: 3,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      invocationCount: 4,
    },
  },
  bySource: [],
  byChargeType: [],
  attribution: {
    missingChatId: { billableCost: 0, rawCost: 0, count: 0 },
    missingExecutionId: { billableCost: 0, rawCost: 0, count: 0 },
  },
  workflow: {
    executions: {
      total: 2,
      withProjectedCost: 2,
      totalProjectedCost: 8,
      totalLedgerCost: 8,
    },
    byTrigger: [],
    byWorkflow: [],
  },
  copilot: {
    chats: { total: 1, withLedgerCost: 1 },
    runs: { total: 3 },
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
  byUser: [],
  byActor: [],
  byModel: [],
  byProvider: [],
  byTool: [],
  byVendor: [],
  timeSeries: [],
  lineage: { roots: [] },
  dataHealth: { limitedAttribution: false, warnings: [] },
}

function buildParams() {
  return { params: Promise.resolve({ id: WORKSPACE_ID }) }
}

async function callGet(query = '') {
  const request = createMockRequest(
    'GET',
    undefined,
    {},
    `http://localhost:3000/api/workspaces/${WORKSPACE_ID}/usage${query}`
  )
  const response = await GET(request, buildParams())
  return { status: response.status, body: await response.json() }
}

describe('GET /api/workspaces/[id]/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'u-1' } })
    mockHasWorkspaceAdminAccess.mockResolvedValue(true)
    mockGetWorkspaceUsageAnalytics.mockResolvedValue(ANALYTICS)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const { status } = await callGet()
    expect(status).toBe(401)
    expect(mockGetWorkspaceUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not a workspace admin', async () => {
    mockHasWorkspaceAdminAccess.mockResolvedValue(false)
    const { status, body } = await callGet()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(status).toBe(403)
    expect(mockGetWorkspaceUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns workspace usage analytics for admins', async () => {
    const { status, body } = await callGet('?period=30d')
    expect(status).toBe(200)
    expect(body).toEqual(ANALYTICS)
    expect(mockGetWorkspaceUsageAnalytics).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      startTime: undefined,
      endTime: undefined,
      period: '30d',
      sources: undefined,
      allTime: false,
    })
  })

  it('forwards source filters to analytics', async () => {
    await callGet('?sources=workflow,copilot')
    expect(mockGetWorkspaceUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ['workflow', 'copilot'],
      })
    )
  })
})
