/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/billing/arena/daily-refresh-policy', () => ({
  isDailyRefreshEnabled: vi.fn(() => true),
}))

import {
  addStarterDurationMonths,
  buildStarterSubscriptionMetadata,
  getStarterUsageLimitDollars,
  isStarterActive,
  isStarterExpired,
  isStarterPlan,
} from '@/lib/billing/arena/starter-plan'

describe('isStarterPlan', () => {
  it('matches the starter plan name only', () => {
    expect(isStarterPlan('starter')).toBe(true)
    expect(isStarterPlan('free')).toBe(false)
    expect(isStarterPlan('team_6500')).toBe(false)
    expect(isStarterPlan(null)).toBe(false)
  })
})

describe('addStarterDurationMonths', () => {
  it('adds one calendar month', () => {
    const start = new Date('2026-03-15T10:00:00.000Z')
    const end = addStarterDurationMonths(start)
    expect(end.getUTCMonth()).toBe(3)
    expect(end.getUTCDate()).toBe(15)
  })
})

describe('Starter active / expired', () => {
  const base = {
    plan: 'starter' as const,
    status: 'active' as const,
    periodStart: new Date('2026-03-01T00:00:00.000Z'),
  }

  it('is active before period end', () => {
    expect(
      isStarterActive({
        ...base,
        periodEnd: new Date(Date.now() + 86_400_000),
      })
    ).toBe(true)
  })

  it('is expired after period end', () => {
    expect(
      isStarterExpired({
        ...base,
        periodEnd: new Date('2020-01-01T00:00:00.000Z'),
      })
    ).toBe(true)
    expect(
      isStarterActive({
        ...base,
        periodEnd: new Date('2020-01-01T00:00:00.000Z'),
      })
    ).toBe(false)
  })
})

describe('Starter limits and metadata', () => {
  it('uses a $100 org usage limit', () => {
    expect(getStarterUsageLimitDollars()).toBe(100)
  })

  it('records client-organization metadata', () => {
    expect(buildStarterSubscriptionMetadata('client-abc')).toEqual({
      source: 'client-organization',
      starter: true,
      clientId: 'client-abc',
    })
  })
})
