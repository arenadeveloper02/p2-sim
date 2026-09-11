/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isBlockingOrgSubscription,
  isStripeUpgradeableSubscription,
} from '@/lib/billing/arena/checkout-policy'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import { ARENA_PRO_PLAN } from '@/lib/billing/arena/tier-config'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(() => true),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

describe('arena checkout policy', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockIsArenaBilling.mockReturnValue(true)
  })

  it('excludes starter from stripe upgradeable subscriptions', () => {
    expect(
      isStripeUpgradeableSubscription({
        plan: STARTER_PLAN,
        status: 'active',
        stripeSubscriptionId: null,
      })
    ).toBe(false)

    expect(
      isStripeUpgradeableSubscription({
        plan: ARENA_PRO_PLAN,
        status: 'active',
        stripeSubscriptionId: 'sub_123',
      })
    ).toBe(true)
  })

  it('does not treat starter as a blocking org subscription', () => {
    expect(isBlockingOrgSubscription({ plan: STARTER_PLAN })).toBe(false)
    expect(isBlockingOrgSubscription({ plan: ARENA_PRO_PLAN })).toBe(true)
  })
})
