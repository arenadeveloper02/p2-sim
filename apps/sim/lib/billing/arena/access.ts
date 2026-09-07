import { isArenaBilling } from '@/lib/billing/arena/env'
import { isStarterActive, isStarterPlan } from '@/lib/billing/arena/starter-plan'
import { isArenaMaxPlan } from '@/lib/billing/arena/tier-config'
import { isMaxTier } from '@/lib/billing/plan-helpers'
import { hasUsableSubscriptionStatus } from '@/lib/billing/subscriptions/utils'

export interface ArenaProductAccessInput {
  plan: string
  status: string | null
  periodEnd: Date | string | null | undefined
  billingBlocked?: boolean
  isOrgScoped?: boolean
  hasPaidEntitlement?: boolean
}

/**
 * Active Starter month — grants org product access without a Stripe subscription.
 */
export function isArenaStarterProductAccess({
  plan,
  status,
  periodEnd,
  billingBlocked = false,
}: ArenaProductAccessInput): boolean {
  if (!isArenaBilling() || billingBlocked) return false
  const periodEndDate =
    periodEnd instanceof Date ? periodEnd : periodEnd ? new Date(periodEnd) : null
  return (
    isStarterPlan(plan) &&
    hasUsableSubscriptionStatus(status) &&
    isStarterActive({ plan, status, periodStart: null, periodEnd: periodEndDate })
  )
}

/**
 * Team-management and org collaboration surfaces (invites, org settings, etc.).
 */
export function hasArenaTeamProductAccess(input: ArenaProductAccessInput): boolean {
  const starter = isArenaStarterProductAccess(input)
  if (starter && input.isOrgScoped) return true
  if (!input.hasPaidEntitlement) return false
  return Boolean(input.isOrgScoped)
}

/**
 * Max-tier product surfaces (Sim Mailer, KB Live Sync, Max connectors, etc.).
 * Starter includes Max features for its active month.
 */
export function hasArenaMaxProductAccess(input: ArenaProductAccessInput): boolean {
  if (isArenaStarterProductAccess(input)) return true
  if (!input.hasPaidEntitlement) return false
  return isMaxTier(input.plan) || isArenaMaxPlan(input.plan)
}

/**
 * Workspace quota helper — Starter and Arena Max orgs receive the Max workspace cap.
 */
export function isArenaMaxWorkspacePlan(plan: string | null | undefined): boolean {
  if (!isArenaBilling()) return false
  return isStarterPlan(plan) || isArenaMaxPlan(plan)
}
