/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArenaPlans } from '@/lib/billing/arena/plans'
import { ARENA_MAX_PLAN, ARENA_PRO_PLAN } from '@/lib/billing/arena/tier-config'

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    STRIPE_FREE_PRICE_ID: 'price_free',
    STRIPE_PRICE_TEAM_30_MO: 'price_team_30_mo',
    STRIPE_PRICE_TEAM_30_YR: 'price_team_30_yr',
    STRIPE_PRICE_TEAM_100_MO: 'price_team_100_mo',
    STRIPE_PRICE_TEAM_100_YR: 'price_team_100_yr',
  } as Record<string, string | undefined>,
}))

vi.mock('@/lib/core/config/env', () => ({
  env: mockEnv,
}))

vi.mock('@/lib/billing/subscriptions/utils', () => ({
  getFreeTierLimit: () => 5,
}))

describe('getArenaPlans', () => {
  afterEach(() => {
    mockEnv.STRIPE_PRICE_TEAM_30_MO = 'price_team_30_mo'
    mockEnv.STRIPE_PRICE_TEAM_100_MO = 'price_team_100_mo'
  })

  it('registers free, team_1950, team_6500, and enterprise', () => {
    const plans = getArenaPlans()
    expect(plans.map((plan) => plan.name)).toEqual([
      'free',
      ARENA_PRO_PLAN,
      ARENA_MAX_PLAN,
      'enterprise',
    ])
  })

  it('maps Stripe price IDs and flat dollar limits', () => {
    const plans = getArenaPlans()
    const pro = plans.find((plan) => plan.name === ARENA_PRO_PLAN)
    const max = plans.find((plan) => plan.name === ARENA_MAX_PLAN)

    expect(pro).toMatchObject({
      priceId: 'price_team_30_mo',
      annualDiscountPriceId: 'price_team_30_yr',
      limits: { cost: 30 },
    })
    expect(max).toMatchObject({
      priceId: 'price_team_100_mo',
      annualDiscountPriceId: 'price_team_100_yr',
      limits: { cost: 100 },
    })
  })

  it('omits tiers whose monthly Stripe price is unset', () => {
    mockEnv.STRIPE_PRICE_TEAM_30_MO = undefined
    const names = getArenaPlans().map((plan) => plan.name)
    expect(names).toEqual(['free', ARENA_MAX_PLAN, 'enterprise'])
  })
})
