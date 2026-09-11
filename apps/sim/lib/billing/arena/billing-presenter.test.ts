/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { presentOrganizationSubscription } from '@/lib/billing/arena/billing-presenter'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'

describe('presentOrganizationSubscription', () => {
  it('shows active starter as active subscription state', () => {
    const result = presentOrganizationSubscription({
      entitledSubscription: { plan: STARTER_PLAN, status: 'active' },
      latestSubscription: { plan: STARTER_PLAN, status: 'active' },
    })

    expect(result.subscriptionState).toBe('active')
    expect(result.activeStarter).toBe(true)
    expect(result.displayedSubscription?.plan).toBe(STARTER_PLAN)
  })

  it('shows expired starter as starter_expired when no entitled row', () => {
    const result = presentOrganizationSubscription({
      entitledSubscription: null,
      latestSubscription: { plan: STARTER_PLAN, status: 'active' },
    })

    expect(result.subscriptionState).toBe('starter_expired')
    expect(result.activeStarter).toBe(false)
  })
})
