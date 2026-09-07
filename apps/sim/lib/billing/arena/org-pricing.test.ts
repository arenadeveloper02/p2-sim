/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import {
  getFlatOrgPriceDollars,
  isFlatOrgPlan,
  resolveFlatOrgUsageLimit,
  shouldReconcileOrganizationSeats,
} from '@/lib/billing/arena/org-pricing'
import { ARENA_MAX_PLAN, ARENA_PRO_PLAN } from '@/lib/billing/arena/tier-config'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(() => true),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

describe('arena flat org pricing', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockIsArenaBilling.mockReturnValue(true)
  })

  it('treats starter and arena paid team plans as flat org plans', () => {
    expect(isFlatOrgPlan(STARTER_PLAN)).toBe(true)
    expect(isFlatOrgPlan(ARENA_PRO_PLAN)).toBe(true)
    expect(isFlatOrgPlan(ARENA_MAX_PLAN)).toBe(true)
    expect(isFlatOrgPlan('team_6000')).toBe(false)
  })

  it('returns flat dollars independent of seats', () => {
    expect(getFlatOrgPriceDollars(ARENA_PRO_PLAN)).toBe(30)
    expect(getFlatOrgPriceDollars(ARENA_MAX_PLAN)).toBe(100)
    expect(getFlatOrgPriceDollars(STARTER_PLAN)).toBe(100)
  })

  it('resolves paid flat usage limit without multiplying seats', () => {
    expect(resolveFlatOrgUsageLimit(ARENA_PRO_PLAN, null)).toEqual({
      limit: 30,
      minimum: 30,
    })
    expect(resolveFlatOrgUsageLimit(ARENA_MAX_PLAN, 150)).toEqual({
      limit: 150,
      minimum: 100,
    })
    expect(resolveFlatOrgUsageLimit(STARTER_PLAN, null)).toBeNull()
  })

  it('skips seat reconciliation for flat org plans', () => {
    expect(shouldReconcileOrganizationSeats(ARENA_PRO_PLAN)).toBe(false)
    expect(shouldReconcileOrganizationSeats(ARENA_MAX_PLAN)).toBe(false)
    expect(shouldReconcileOrganizationSeats('team_6000')).toBe(true)
  })

  it('returns nulls when arena billing is disabled', () => {
    mockIsArenaBilling.mockReturnValue(false)
    expect(isFlatOrgPlan(ARENA_PRO_PLAN)).toBe(false)
    expect(getFlatOrgPriceDollars(ARENA_PRO_PLAN)).toBeNull()
    expect(shouldReconcileOrganizationSeats(ARENA_PRO_PLAN)).toBe(true)
  })
})
