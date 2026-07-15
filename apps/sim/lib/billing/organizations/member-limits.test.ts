/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbState,
  mockInsert,
  mockInsertValues,
  mockOnConflictDoUpdate,
  mockDelete,
  mockDeleteWhere,
  mockGetOrganizationSubscription,
  mockGetOrgWorkspaceUsageCostForUser,
  mockGetOrgUsageLimit,
} = vi.hoisted(() => ({
  mockDbState: { selectResults: [] as unknown[] },
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockGetOrganizationSubscription: vi.fn(),
  mockGetOrgWorkspaceUsageCostForUser: vi.fn(),
  mockGetOrgUsageLimit: vi.fn(),
}))

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {}
      chain.from = vi.fn(() => chain)
      chain.where = vi.fn(() => chain)
      chain.limit = vi.fn(() => Promise.resolve(mockDbState.selectResults.shift() ?? []))
      chain.then = (cb: (rows: unknown) => unknown) =>
        Promise.resolve(cb(mockDbState.selectResults.shift() ?? []))
      return chain
    }),
    insert: mockInsert,
    delete: mockDelete,
  },
}))

vi.mock('@sim/db/schema', () => ({
  organizationMemberUsageLimit: {
    id: 'oml.id',
    organizationId: 'oml.organizationId',
    userId: 'oml.userId',
    usageLimit: 'oml.usageLimit',
    setBy: 'oml.setBy',
    createdAt: 'oml.createdAt',
    updatedAt: 'oml.updatedAt',
  },
  workspace: { id: 'workspace.id', organizationId: 'workspace.organizationId' },
}))

vi.mock('@/lib/billing/core/billing', () => ({
  getOrganizationSubscription: mockGetOrganizationSubscription,
}))

vi.mock('@/lib/billing/core/usage', () => ({
  getOrgUsageLimit: mockGetOrgUsageLimit,
}))

vi.mock('@/lib/billing/core/usage-log', () => ({
  getOrgWorkspaceUsageCostForUser: mockGetOrgWorkspaceUsageCostForUser,
}))

import { defaultBillingPeriod } from '@/lib/billing/core/billing-period'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import {
  getOrgMemberUsageLimit,
  getOrgMemberWorkspaceUsage,
  setOrgMemberUsageLimit,
  validateOrgMemberAllocationWithinPool,
} from '@/lib/billing/organizations/member-limits'

beforeEach(() => {
  vi.clearAllMocks()
  mockDbState.selectResults = []
  mockInsert.mockReturnValue({ values: mockInsertValues })
  mockInsertValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
  mockOnConflictDoUpdate.mockResolvedValue(undefined)
  mockDelete.mockReturnValue({ where: mockDeleteWhere })
  mockDeleteWhere.mockResolvedValue(undefined)
  mockGetOrgUsageLimit.mockResolvedValue({ limit: 2000 })
  mockGetOrganizationSubscription.mockResolvedValue({ plan: 'enterprise', seats: 1 })
})

describe('getOrgMemberUsageLimit', () => {
  it('returns null when no row exists', async () => {
    mockDbState.selectResults = [[]]
    await expect(getOrgMemberUsageLimit('org-1', 'user-2')).resolves.toBeNull()
  })

  it('returns the stored dollar limit as a number', async () => {
    mockDbState.selectResults = [[{ usageLimit: '2' }]]
    await expect(getOrgMemberUsageLimit('org-1', 'user-2')).resolves.toBe(2)
  })
})

describe('setOrgMemberUsageLimit', () => {
  it('upserts when given a dollar amount', async () => {
    await setOrgMemberUsageLimit('org-1', 'user-2', 2, 'admin-1')
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockDelete).not.toHaveBeenCalled()
    const values = mockInsertValues.mock.calls[0][0]
    expect(values).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-2',
      usageLimit: '2',
      setBy: 'admin-1',
    })
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
  })

  it('deletes the row when limit is null', async () => {
    await setOrgMemberUsageLimit('org-1', 'user-2', null, 'admin-1')
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('validateOrgMemberAllocationWithinPool', () => {
  it('passes when the new allocation total is within the org pool', async () => {
    mockDbState.selectResults = [
      [
        { userId: 'user-3', usageLimit: '500' },
        { userId: 'user-2', usageLimit: '300' },
      ],
    ]

    await expect(
      validateOrgMemberAllocationWithinPool('org-1', 'user-2', 500)
    ).resolves.toEqual({ ok: true })
  })

  it('replaces the target member limit instead of double-counting it', async () => {
    mockDbState.selectResults = [[{ userId: 'user-2', usageLimit: '1500' }]]

    await expect(
      validateOrgMemberAllocationWithinPool('org-1', 'user-2', 500)
    ).resolves.toEqual({ ok: true })
  })

  it('fails when allocated credits would exceed the org pool', async () => {
    mockDbState.selectResults = [[{ userId: 'user-3', usageLimit: '1500' }]]

    const result = await validateOrgMemberAllocationWithinPool('org-1', 'user-2', 600)

    expect(result).toEqual({
      ok: false,
      allocatedCredits: dollarsToCredits(2100),
      orgPoolCredits: dollarsToCredits(2000),
    })
  })

  it('skips validation for on-demand unlimited org pools', async () => {
    mockGetOrgUsageLimit.mockResolvedValue({ limit: ON_DEMAND_UNLIMITED })

    await expect(
      validateOrgMemberAllocationWithinPool('org-1', 'user-2', 600)
    ).resolves.toEqual({ ok: true })
  })
})

describe('getOrgMemberWorkspaceUsage', () => {
  it("returns the member's usage within the org subscription window", async () => {
    const periodStart = new Date('2026-06-01T00:00:00.000Z')
    const periodEnd = new Date('2026-07-01T00:00:00.000Z')
    mockGetOrganizationSubscription.mockResolvedValue({ periodStart, periodEnd })
    mockGetOrgWorkspaceUsageCostForUser.mockResolvedValue(5)

    const result = await getOrgMemberWorkspaceUsage('org-1', 'user-2')

    expect(result).toBe(5)
    expect(mockGetOrgWorkspaceUsageCostForUser).toHaveBeenCalledWith('org-1', 'user-2', {
      start: periodStart,
      end: periodEnd,
    })
  })

  it('falls back to the all-time window when the org has no subscription', async () => {
    mockGetOrganizationSubscription.mockResolvedValue(null)
    mockGetOrgWorkspaceUsageCostForUser.mockResolvedValue(7)

    const result = await getOrgMemberWorkspaceUsage('org-1', 'user-2')

    expect(result).toBe(7)
    expect(mockGetOrgWorkspaceUsageCostForUser).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      defaultBillingPeriod()
    )
  })

  it('falls back to the all-time window when the subscription is missing periodEnd', async () => {
    mockGetOrganizationSubscription.mockResolvedValue({
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: null,
    })
    mockGetOrgWorkspaceUsageCostForUser.mockResolvedValue(3)

    const result = await getOrgMemberWorkspaceUsage('org-1', 'user-2')

    expect(result).toBe(3)
    expect(mockGetOrgWorkspaceUsageCostForUser).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      defaultBillingPeriod()
    )
  })
})
