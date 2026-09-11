/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getPlanTypeForLimits, hasOrganizationSeatEntitlement } from '@/lib/billing/plan-helpers'

describe('getPlanTypeForLimits', () => {
  it.each([
    ['pro_6000', 'pro'],
    ['team_6000', 'pro'],
    ['pro_25000', 'team'],
    ['team_25000', 'team'],
  ] as const)('buckets modern plan %s by paid tier into %s', (plan, expected) => {
    expect(getPlanTypeForLimits(plan)).toBe(expected)
  })

  it('keeps legacy pro and team plan names in their original categories', () => {
    expect(getPlanTypeForLimits('pro')).toBe('pro')
    expect(getPlanTypeForLimits('team')).toBe('team')
  })

  it('maps enterprise, free, and unknown plans unchanged', () => {
    expect(getPlanTypeForLimits('enterprise')).toBe('enterprise')
    expect(getPlanTypeForLimits('free')).toBe('free')
    expect(getPlanTypeForLimits(undefined)).toBe('free')
    expect(getPlanTypeForLimits('unrecognized')).toBe('free')
  })
})

describe('hasOrganizationSeatEntitlement', () => {
  it('allows Stripe-paid org plans', () => {
    expect(hasOrganizationSeatEntitlement({ plan: 'team_6500', status: 'active' })).toBe(true)
    expect(hasOrganizationSeatEntitlement({ plan: 'enterprise', status: 'active' })).toBe(true)
  })

  it('allows active Starter within its entitlement window', () => {
    expect(
      hasOrganizationSeatEntitlement({
        plan: 'starter',
        status: 'active',
        periodEnd: new Date(Date.now() + 86_400_000),
      })
    ).toBe(true)
  })

  it('rejects expired or free org plans', () => {
    expect(
      hasOrganizationSeatEntitlement({
        plan: 'starter',
        status: 'active',
        periodEnd: new Date('2020-01-01T00:00:00.000Z'),
      })
    ).toBe(false)
    expect(hasOrganizationSeatEntitlement({ plan: 'free', status: 'active' })).toBe(false)
    expect(hasOrganizationSeatEntitlement({ plan: null })).toBe(false)
  })
})
