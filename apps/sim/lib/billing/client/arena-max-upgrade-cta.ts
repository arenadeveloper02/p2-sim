import { ARENA_MAX_CREDIT_TIER } from '@/lib/billing/arena-max'
import { getPlanTierCredits, isEnterprise, isFree, isTeam } from '@/lib/billing/plan-helpers'

export interface ArenaMaxUpgradeCardState {
  onPaidPlan: boolean
  buttonText: string
  buttonDisabled: boolean
  highlighted: boolean
  bannerText: string | undefined
}

export interface ArenaFreeUpgradeCardState {
  onFree: boolean
  hideButton: boolean
  buttonText: string
  buttonDisabled: boolean
  highlighted: boolean
  bannerText: string | undefined
}

/**
 * True when the org is already on Arena's sold Team Max yearly SKU (or Enterprise).
 */
export function isArenaPaidUpgradePlan(plan: string | null | undefined): boolean {
  if (isEnterprise(plan)) return true
  if (!isTeam(plan)) return false
  return getPlanTierCredits(plan) >= ARENA_MAX_CREDIT_TIER
}

/**
 * Paid upgrade card: Get started starts Team Max yearly checkout.
 * Current Plan when already on Team Max / Enterprise.
 */
export function getArenaMaxUpgradeCardState(
  plan: string | null | undefined
): ArenaMaxUpgradeCardState {
  const onPaidPlan = isArenaPaidUpgradePlan(plan)

  return {
    onPaidPlan,
    buttonText: onPaidPlan ? 'Current Plan' : 'Get started',
    buttonDisabled: onPaidPlan,
    highlighted: !onPaidPlan,
    bannerText: onPaidPlan ? 'Your plan' : undefined,
  }
}

/**
 * Free-plan card: Current Plan only when the user is actually on free.
 * Paid users get no downgrade action on this card.
 */
export function getArenaFreeUpgradeCardState(
  plan: string | null | undefined
): ArenaFreeUpgradeCardState {
  const onFree = isFree(plan)

  return {
    onFree,
    hideButton: !onFree,
    buttonText: 'Current Plan',
    buttonDisabled: true,
    highlighted: false,
    bannerText: onFree ? 'Your plan' : undefined,
  }
}
