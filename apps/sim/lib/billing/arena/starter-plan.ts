import type { subscription } from '@sim/db/schema'
import {
  STARTER_DURATION_MONTHS,
  STARTER_METADATA_SOURCE,
  STARTER_PLAN,
  STARTER_USAGE_LIMIT_DOLLARS,
} from '@/lib/billing/arena/constants'
import { hasUsableSubscriptionStatus } from '@/lib/billing/subscriptions/utils'

type StarterSubscriptionRow = Pick<
  typeof subscription.$inferSelect,
  'plan' | 'status' | 'periodEnd'
> & {
  periodStart?: Date | null
}

/**
 * True when the plan name is the Arena Starter entitlement.
 */
export function isStarterPlan(plan: string | null | undefined): boolean {
  return plan === STARTER_PLAN
}

/**
 * Adds one calendar month to `start`, preserving day-of-month when possible.
 */
export function addStarterDurationMonths(start: Date): Date {
  const end = new Date(start)
  end.setMonth(end.getMonth() + STARTER_DURATION_MONTHS)
  return end
}

/**
 * Starter is active only while status is usable and the entitlement window has not ended.
 */
export function isStarterActive(sub: StarterSubscriptionRow | null | undefined): boolean {
  if (!sub || !isStarterPlan(sub.plan)) return false
  if (!hasUsableSubscriptionStatus(sub.status)) return false
  if (!sub.periodEnd) return false
  return sub.periodEnd.getTime() > Date.now()
}

/**
 * Starter row whose entitlement window has ended (time-based expiry).
 */
export function isStarterExpired(sub: StarterSubscriptionRow | null | undefined): boolean {
  if (!sub || !isStarterPlan(sub.plan)) return false
  if (!sub.periodEnd) return true
  return sub.periodEnd.getTime() <= Date.now()
}

/**
 * Dollar usage limit written to `organization.orgUsageLimit` for a new Starter org.
 */
export function getStarterUsageLimitDollars(): number {
  return STARTER_USAGE_LIMIT_DOLLARS
}

/**
 * Metadata persisted on Starter subscription rows created via client-organization provisioning.
 */
export function buildStarterSubscriptionMetadata(clientId: string): Record<string, unknown> {
  return {
    source: STARTER_METADATA_SOURCE,
    starter: true,
    clientId,
  }
}
