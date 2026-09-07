/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasArenaMaxProductAccess,
  hasArenaTeamProductAccess,
  isArenaStarterProductAccess,
} from '@/lib/billing/arena/access'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: vi.fn(() => true),
}))

describe('arena product access', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('grants starter team and max access for an active org starter month', () => {
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const input = {
      plan: STARTER_PLAN,
      status: 'active',
      periodEnd,
      billingBlocked: false,
      isOrgScoped: true,
      hasPaidEntitlement: false,
    }

    expect(isArenaStarterProductAccess(input)).toBe(true)
    expect(hasArenaTeamProductAccess(input)).toBe(true)
    expect(hasArenaMaxProductAccess(input)).toBe(true)
  })

  it('denies starter access after period end', () => {
    const input = {
      plan: STARTER_PLAN,
      status: 'active',
      periodEnd: new Date(Date.now() - 1),
      billingBlocked: false,
      isOrgScoped: true,
      hasPaidEntitlement: false,
    }

    expect(isArenaStarterProductAccess(input)).toBe(false)
    expect(hasArenaTeamProductAccess(input)).toBe(false)
    expect(hasArenaMaxProductAccess(input)).toBe(false)
  })
})
