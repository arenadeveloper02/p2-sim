import { describe, expect, it } from 'vitest'
import {
  ARENA_CLIENT_ORG_FREE_CREDITS,
  ARENA_MAX_CREDIT_TIER,
  ARENA_MAX_DISPLAY_NAME,
  ARENA_MAX_PRICE_USD_PER_YEAR,
} from '@/lib/billing/arena-max'
import {
  getArenaFreeUpgradeCardState,
  getArenaMaxUpgradeCardState,
  isArenaPaidUpgradePlan,
} from '@/lib/billing/client/arena-max-upgrade-cta'
import { creditsToDollars } from '@/lib/billing/credits/conversion'
import { getDisplayPlanName } from '@/lib/billing/plan-helpers'

describe('arena team yearly upgrade helpers', () => {
  it('brands Enterprise as Arena and keeps Team Max yearly list price', () => {
    expect(getDisplayPlanName('enterprise')).toBe(ARENA_MAX_DISPLAY_NAME)
    expect(ARENA_MAX_PRICE_USD_PER_YEAR).toBe(1000)
    expect(ARENA_MAX_CREDIT_TIER).toBe(25000)
    expect(creditsToDollars(ARENA_CLIENT_ORG_FREE_CREDITS)).toBe(5)
  })

  it('treats Team Max and Enterprise as the paid upgrade plan', () => {
    expect(isArenaPaidUpgradePlan('team_25000')).toBe(true)
    expect(isArenaPaidUpgradePlan('enterprise')).toBe(true)
    expect(isArenaPaidUpgradePlan('team_6000')).toBe(false)
    expect(isArenaPaidUpgradePlan('free')).toBe(false)
  })

  it('shows Current Plan on Team Max and Get started otherwise', () => {
    expect(getArenaMaxUpgradeCardState('team_25000')).toMatchObject({
      onPaidPlan: true,
      buttonText: 'Current Plan',
      buttonDisabled: true,
      bannerText: 'Your plan',
    })
    expect(getArenaMaxUpgradeCardState('free')).toMatchObject({
      buttonText: 'Get started',
      buttonDisabled: false,
      highlighted: true,
    })
  })

  it('shows Current Plan on Free and hides the Free CTA for paid plans', () => {
    expect(getArenaFreeUpgradeCardState('free')).toMatchObject({
      onFree: true,
      hideButton: false,
      buttonText: 'Current Plan',
      buttonDisabled: true,
      bannerText: 'Your plan',
    })
    expect(getArenaFreeUpgradeCardState('team_25000')).toMatchObject({
      onFree: false,
      hideButton: true,
    })
  })
})
