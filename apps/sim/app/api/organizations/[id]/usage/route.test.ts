/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockIsOrganizationAdminOrOwner,
  mockGetOrganizationUsageAnalytics,
  InvalidOrganizationWorkspaceError,
} = vi.hoisted(() => {
  class InvalidOrganizationWorkspaceError extends Error {
    constructor(public readonly workspaceId: string) {
      super(`Workspace ${workspaceId} is not an active workspace in this organization`)
      this.name = 'InvalidOrganizationWorkspaceError'
    }
  }

  return {
    mockGetSession: vi.fn(),
    mockIsOrganizationAdminOrOwner: vi.fn(),
    mockGetOrganizationUsageAnalytics: vi.fn(),
    InvalidOrganizationWorkspaceError,
  }
})

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  isOrganizationAdminOrOwner: mockIsOrganizationAdminOrOwner,
}))

vi.mock('@/lib/workspaces/usage/organization-analytics', () => ({
  getOrganizationUsageAnalytics: mockGetOrganizationUsageAnalytics,
  InvalidOrganizationWorkspaceError,
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

import { GET } from '@/app/api/organizations/[id]/usage/route'

const ORGANIZATION_ID = 'org-1'

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
    billableCost: 42.5,
    rawCost: 40,
    billableCostCredits: 8500,
    ledgerEntryCount: 10,
    executionCount: 5,
    chatCount: 2,
    runCount: 4,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      invocationCount: 10,
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
  byActor: [],
  byUser: [],
  bySource: [],
  byModel: [],
  byProvider: [],
  byTool: [],
  byVendor: [],
  timeSeries: [],
  lineage: { roots: [] },
  dataHealth: { limitedAttribution: false, warnings: [] },
}

function buildParams() {
  return { params: Promise.resolve({ id: ORGANIZATION_ID }) }
}

async function callGet(query = '') {
  const request = createMockRequest(
    'GET',
    undefined,
    {},
    `http://localhost:3000/api/organizations/${ORGANIZATION_ID}/usage${query}`
  )
  const response = await GET(request, buildParams())
  return { status: response.status, body: await response.json() }
}

describe('GET /api/organizations/[id]/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'u-1' } })
    mockIsOrganizationAdminOrOwner.mockResolvedValue(true)
    mockGetOrganizationUsageAnalytics.mockResolvedValue(ANALYTICS)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const { status } = await callGet()
    expect(status).toBe(401)
    expect(mockGetOrganizationUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not an organization member', async () => {
    mockIsOrganizationAdminOrOwner.mockResolvedValue(false)
    const { status, body } = await callGet()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(status).toBe(403)
    expect(mockIsOrganizationAdminOrOwner).toHaveBeenCalledWith('u-1', ORGANIZATION_ID)
    expect(mockGetOrganizationUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is an organization member but not an admin or owner', async () => {
    mockIsOrganizationAdminOrOwner.mockResolvedValue(false)
    const { status, body } = await callGet()
    expect(body).toEqual({ error: 'Forbidden' })
    expect(status).toBe(403)
    expect(mockGetOrganizationUsageAnalytics).not.toHaveBeenCalled()
  })

  it('returns organization usage analytics for org admins', async () => {
    const { status, body } = await callGet('?period=30d')
    expect(status).toBe(200)
    expect(body).toEqual(ANALYTICS)
    expect(mockIsOrganizationAdminOrOwner).toHaveBeenCalledWith('u-1', ORGANIZATION_ID)
    expect(mockGetOrganizationUsageAnalytics).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      startTime: undefined,
      endTime: undefined,
      period: '30d',
      sources: undefined,
      allTime: false,
      workspaceId: undefined,
    })
  })

  it('forwards source filters to analytics', async () => {
    await callGet('?sources=workflow,copilot')
    expect(mockGetOrganizationUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ['workflow', 'copilot'],
      })
    )
  })

  it('forwards optional workspaceId filter to analytics', async () => {
    await callGet('?workspaceId=ws-2')
    expect(mockGetOrganizationUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-2',
      })
    )
  })

  it('returns 400 when workspaceId is not in the organization', async () => {
    mockGetOrganizationUsageAnalytics.mockRejectedValue(
      new InvalidOrganizationWorkspaceError('ws-foreign')
    )

    const { status, body } = await callGet('?workspaceId=ws-foreign')
    expect(status).toBe(400)
    expect(body.error).toMatch(/not an active workspace/i)
  })
})
