/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockIsOrganizationAdminOrOwner,
  mockGetOrganizationUsageAnalytics,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockIsOrganizationAdminOrOwner: vi.fn(),
  mockGetOrganizationUsageAnalytics: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  isOrganizationAdminOrOwner: mockIsOrganizationAdminOrOwner,
}))

vi.mock('@/lib/workspaces/usage/organization-analytics', () => ({
  getOrganizationUsageAnalytics: mockGetOrganizationUsageAnalytics,
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
  workflow: { byWorkflow: [] },
  copilot: { byChat: [] },
  byActor: [],
  byUser: [],
  bySource: [],
  timeSeries: [],
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

  it('returns 403 when the caller is not an organization admin or owner', async () => {
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
    expect(mockGetOrganizationUsageAnalytics).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      startTime: undefined,
      endTime: undefined,
      period: '30d',
      sources: undefined,
      allTime: false,
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
})
