import { isArenaBilling } from '@/lib/billing/arena/env'
import { isStarterPlan } from '@/lib/billing/arena/starter-plan'

/**
 * True when a subscription row can participate in Stripe upgrade / switch-plan.
 * Starter rows are org entitlements without a Stripe subscription ID.
 */
export function isStripeUpgradeableSubscription(sub: {
  plan?: string | null
  status?: string | null
  stripeSubscriptionId?: string | null
}): boolean {
  if (!sub) return false
  if (isArenaBilling() && isStarterPlan(sub.plan)) return false
  return Boolean(sub.stripeSubscriptionId)
}

/**
 * True when an entitled subscription should block creating another paid org plan.
 * Starter does not block — it is superseded on successful checkout.
 */
export function isBlockingOrgSubscription(sub: { plan?: string | null }): boolean {
  if (!sub?.plan) return false
  if (isArenaBilling() && isStarterPlan(sub.plan)) return false
  return true
}
