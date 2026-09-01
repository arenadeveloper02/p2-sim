/**
 * @vitest-environment node
 */
import { queueTableRows, resetDbChainMock, schemaMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(() => true),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

import { db } from '@sim/db'
import {
  hasArenaMaxProductAccess,
  hasArenaTeamProductAccess,
  isArenaStarterProductAccess,
} from '@/lib/billing/arena/access'
import { presentOrganizationSubscription } from '@/lib/billing/arena/billing-presenter'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import { applyArenaOrganizationSubscriptionPolicy } from '@/lib/billing/arena/subscription-resolution'
import { resolveArenaStarterOrgUsageLimit } from '@/lib/billing/arena/usage-limit'
import { getSubscriptionAccessState } from '@/lib/billing/client/utils'

describe('expired starter integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockIsArenaBilling.mockReturnValue(true)
  })

  const expiredPeriodEnd = new Date(Date.now() - 86_400_000)
  const activePeriodEnd = new Date(Date.now() + 86_400_000 * 30)

  it('expired starter yields zero usage limit, no access, and starter_expired presentation', async () => {
    const expiredStarterRow = {
      plan: STARTER_PLAN,
      status: 'active',
      periodEnd: expiredPeriodEnd,
    }

    expect(applyArenaOrganizationSubscriptionPolicy(expiredStarterRow)).toBeNull()

    queueTableRows(schemaMock.subscription, [expiredStarterRow])
    const usageLimit = await resolveArenaStarterOrgUsageLimit('org_1', STARTER_PLAN, 100, db)
    expect(usageLimit).toEqual({ limit: 0, minimum: 0 })

    const accessInput = {
      plan: STARTER_PLAN,
      status: 'active' as const,
      periodEnd: expiredPeriodEnd,
      billingBlocked: false,
      isOrgScoped: true,
      hasPaidEntitlement: false,
    }
    expect(isArenaStarterProductAccess(accessInput)).toBe(false)
    expect(hasArenaTeamProductAccess(accessInput)).toBe(false)
    expect(hasArenaMaxProductAccess(accessInput)).toBe(false)

    const accessState = getSubscriptionAccessState(null)
    expect(accessState.hasUsablePaidAccess).toBe(false)
    expect(accessState.hasUsableMaxAccess).toBe(false)
    expect(accessState.hasUsableTeamAccess).toBe(false)

    const presentation = presentOrganizationSubscription({
      entitledSubscription: null,
      latestSubscription: { plan: STARTER_PLAN, status: 'active' },
    })
    expect(presentation.subscriptionState).toBe('starter_expired')
    expect(presentation.activeStarter).toBe(false)
  })

  it('active starter retains usage limit and max product access', async () => {
    const activeStarterRow = {
      plan: STARTER_PLAN,
      status: 'active',
      periodEnd: activePeriodEnd,
    }

    expect(applyArenaOrganizationSubscriptionPolicy(activeStarterRow)).toEqual(activeStarterRow)

    queueTableRows(schemaMock.subscription, [activeStarterRow])
    queueTableRows(schemaMock.organization, [{ orgUsageLimit: '100' }])

    const usageLimit = await resolveArenaStarterOrgUsageLimit('org_1', STARTER_PLAN, null, db)
    expect(usageLimit).toEqual({ limit: 100, minimum: 100 })

    const accessInput = {
      plan: STARTER_PLAN,
      status: 'active' as const,
      periodEnd: activePeriodEnd,
      billingBlocked: false,
      isOrgScoped: true,
      hasPaidEntitlement: false,
    }
    expect(isArenaStarterProductAccess(accessInput)).toBe(true)
    expect(hasArenaMaxProductAccess(accessInput)).toBe(true)

    const accessState = getSubscriptionAccessState({
      plan: STARTER_PLAN,
      status: 'active',
      periodEnd: activePeriodEnd,
      isOrgScoped: true,
      isPaid: false,
    })
    expect(accessState.hasUsablePaidAccess).toBe(true)
    expect(accessState.hasUsableMaxAccess).toBe(true)
    expect(accessState.hasUsableTeamAccess).toBe(true)

    const presentation = presentOrganizationSubscription({
      entitledSubscription: { plan: STARTER_PLAN, status: 'active' },
      latestSubscription: activeStarterRow,
    })
    expect(presentation.subscriptionState).toBe('active')
    expect(presentation.activeStarter).toBe(true)
  })
})
