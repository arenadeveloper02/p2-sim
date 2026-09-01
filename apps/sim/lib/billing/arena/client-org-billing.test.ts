/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockValues = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockWhere = vi.fn()
const mockLimit = vi.fn()
const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockSet = vi.fn()

vi.mock('@sim/db/schema', () => ({
  organization: { id: 'organization.id', orgUsageLimit: 'organization.orgUsageLimit' },
  subscription: { id: 'subscription.id', referenceId: 'subscription.referenceId' },
}))

vi.mock('@sim/utils/id', () => ({
  generateId: vi.fn(() => 'sub_generated'),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ a, b })),
}))

import { provisionClientOrgStarterBilling } from '@/lib/billing/arena/client-org-billing'

describe('provisionClientOrgStarterBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValues.mockResolvedValue(undefined)
    mockInsert.mockReturnValue({ values: mockValues })
    mockLimit.mockResolvedValue([])
    mockWhere.mockReturnValue({ limit: mockLimit })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    mockUpdate.mockReturnValue({ set: mockSet })
  })

  it('inserts a Starter subscription and sets org usage limit', async () => {
    const tx = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }

    const result = await provisionClientOrgStarterBilling(tx as never, {
      organizationId: 'org_1',
      clientId: 'client_1',
    })

    expect(result.subscriptionId).toBe('sub_generated')
    expect(result.orgUsageLimitDollars).toBe(100)
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockValues).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledOnce()

    const insertedRow = mockValues.mock.calls[0][0]
    expect(insertedRow.plan).toBe('starter')
    expect(insertedRow.referenceId).toBe('org_1')
    expect(insertedRow.status).toBe('active')
    expect(insertedRow.stripeSubscriptionId).toBeNull()
    expect(insertedRow.metadata).toEqual({
      source: 'client-organization',
      starter: true,
      clientId: 'client_1',
    })
  })

  it('refuses duplicate provisioning when a subscription already exists', async () => {
    mockLimit.mockResolvedValueOnce([{ id: 'existing_sub' }])

    const tx = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }

    await expect(
      provisionClientOrgStarterBilling(tx as never, {
        organizationId: 'org_1',
        clientId: 'client_1',
      })
    ).rejects.toThrow(/already has a subscription/)
  })
})
