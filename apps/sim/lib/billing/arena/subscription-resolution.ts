import { isArenaBilling } from '@/lib/billing/arena/env'
import { isStarterActive, isStarterPlan } from '@/lib/billing/arena/starter-plan'
import { hasUsableSubscriptionStatus } from '@/lib/billing/subscriptions/utils'

type OrganizationSubscriptionRow = {
  plan: string
  status: string | null
  periodEnd: Date | null
}

/**
 * Hides expired Starter rows from org subscription reads so they do not grant
 * entitlement or usage limit after the one-month window.
 */
export function applyArenaOrganizationSubscriptionPolicy<
  T extends OrganizationSubscriptionRow | null | undefined,
>(subscription: T): T | null {
  if (!subscription || !isArenaBilling()) return subscription ?? null
  if (isStarterPlan(subscription.plan) && !isStarterActive(subscription)) {
    return null
  }
  return subscription
}

/**
 * Priority pick for {@link getHighestPrioritySubscription} — active Starter only.
 */
export function checkArenaStarterPlan(
  subscription: OrganizationSubscriptionRow | null | undefined
): boolean {
  if (!subscription || !isArenaBilling()) return false
  return (
    isStarterPlan(subscription.plan) &&
    hasUsableSubscriptionStatus(subscription.status) &&
    isStarterActive(subscription)
  )
}
