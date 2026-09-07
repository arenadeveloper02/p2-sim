/**
 * @vitest-environment node
 */
import { dbChainMockFns, queueTableRows, resetDbChainMock, schemaMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(() => true),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

import { db } from '@sim/db'
import {
  isBlockingOrgSubscription,
  isStripeUpgradeableSubscription,
} from '@/lib/billing/arena/checkout-policy'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import {
  onlyStarterEntitlementsRemain,
  supersedeStarterSubscriptions,
} from '@/lib/billing/arena/supersede-starter'
import { ARENA_PRO_PLAN } from '@/lib/billing/arena/tier-config'
import { isPaid } from '@/lib/billing/plan-helpers'
import { hasPaidSubscriptionStatus } from '@/lib/billing/subscriptions/utils'

type SubscriptionRow = {
  id?: string
  plan?: string | null
  status?: string | null
  referenceId?: string
  stripeSubscriptionId?: string | null
}

/** Mirrors org checkout gate in {@link useSubscriptionUpgrade}. */
function findBlockingOrgSubscription(subscriptions: SubscriptionRow[], organizationId: string) {
  return subscriptions.find(
    (sub) =>
      hasPaidSubscriptionStatus(sub.status) &&
      sub.referenceId === organizationId &&
      isPaid(sub.plan) &&
      isBlockingOrgSubscription(sub)
  )
}

/** Mirrors Stripe upgradeable lookup in {@link useSubscriptionUpgrade}. */
function findStripeUpgradeableSubscription(subscriptions: SubscriptionRow[], referenceId: string) {
  return subscriptions.find(
    (sub) =>
      hasPaidSubscriptionStatus(sub.status) &&
      sub.referenceId === referenceId &&
      isStripeUpgradeableSubscription(sub)
  )
}

describe('starter checkout and supersede integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockIsArenaBilling.mockReturnValue(true)
  })

  const orgId = 'org_1'
  const starterSubId = 'sub_starter'
  const paidSubId = 'sub_paid'

  const activeStarter: SubscriptionRow = {
    id: starterSubId,
    plan: STARTER_PLAN,
    status: 'active',
    referenceId: orgId,
    stripeSubscriptionId: null,
  }

  it('allows paid checkout from active starter without stripe upgrade collision', () => {
    const subscriptions = [activeStarter]

    expect(findBlockingOrgSubscription(subscriptions, orgId)).toBeUndefined()
    expect(findStripeUpgradeableSubscription(subscriptions, orgId)).toBeUndefined()
    expect(onlyStarterEntitlementsRemain([{ plan: STARTER_PLAN }])).toBe(true)
  })

  it('supersedes starter after paid subscription is created', async () => {
    queueTableRows(schemaMock.subscription, [{ id: starterSubId, plan: STARTER_PLAN }])

    const result = await supersedeStarterSubscriptions(orgId, paidSubId, db)

    expect(result.canceledIds).toEqual([starterSubId])
    expect(dbChainMockFns.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        cancelAtPeriodEnd: false,
      })
    )
  })

  it('blocks checkout when org already has a paid arena plan', () => {
    const subscriptions = [
      activeStarter,
      {
        id: 'sub_pro',
        plan: ARENA_PRO_PLAN,
        status: 'active',
        referenceId: orgId,
        stripeSubscriptionId: 'stripe_pro',
      },
    ]

    expect(findBlockingOrgSubscription(subscriptions, orgId)).toBeDefined()
    expect(
      isStripeUpgradeableSubscription({
        plan: ARENA_PRO_PLAN,
        status: 'active',
        stripeSubscriptionId: 'stripe_pro',
      })
    ).toBe(true)
  })

  it('does not treat empty entitlements as starter-only for usage reset', () => {
    expect(onlyStarterEntitlementsRemain([])).toBe(false)
  })
})
