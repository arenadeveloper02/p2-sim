import { isArenaBilling } from '@/lib/billing/arena/env'
import { getStarterUsageLimitDollars, isStarterPlan } from '@/lib/billing/arena/starter-plan'
import {
  ARENA_MAX_PLAN,
  ARENA_PRO_PLAN,
  getArenaPlanTierDollars,
} from '@/lib/billing/arena/tier-config'
import type { OrgUsageLimitResult } from '@/lib/billing/core/usage'

/**
 * True when Arena billing charges a flat org price instead of price × seats.
 * Covers Starter and the Arena paid team plans.
 */
export function isFlatOrgPlan(plan: string | null | undefined): boolean {
  if (!isArenaBilling() || !plan) return false
  return isStarterPlan(plan) || plan === ARENA_PRO_PLAN || plan === ARENA_MAX_PLAN
}

/**
 * Flat org subscription dollars for Arena plans, or null when upstream per-seat
 * pricing should apply.
 */
export function getFlatOrgPriceDollars(plan: string | null | undefined): number | null {
  if (!isArenaBilling() || !plan) return null
  if (isStarterPlan(plan)) return getStarterUsageLimitDollars()
  return getArenaPlanTierDollars(plan)
}

/**
 * Usage-limit floor for a flat org plan. Starter expiry is handled separately by
 * {@link resolveArenaStarterOrgUsageLimit}.
 */
export function resolveFlatOrgUsageLimit(
  plan: string,
  configuredLimit: number | null
): OrgUsageLimitResult | null {
  if (!isArenaBilling() || isStarterPlan(plan)) return null
  const minimum = getFlatOrgPriceDollars(plan)
  if (minimum == null) return null

  if (configuredLimit !== null) {
    return { limit: Math.max(configuredLimit, minimum), minimum }
  }
  return { limit: minimum, minimum }
}

/**
 * Included subscription amount for overage math — flat dollars, never × seats.
 */
export function getFlatOrgSubscriptionAmount(plan: string | null | undefined): number | null {
  return getFlatOrgPriceDollars(plan)
}

/**
 * False when Arena flat org pricing should keep Stripe quantity fixed at 1.
 */
export function shouldReconcileOrganizationSeats(plan: string | null | undefined): boolean {
  return !isFlatOrgPlan(plan)
}
