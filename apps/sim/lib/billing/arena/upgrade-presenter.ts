import { STARTER_CREDITS } from '@/lib/billing/arena/constants'
import { ARENA_MAX_TIER, ARENA_PRO_TIER } from '@/lib/billing/arena/tier-config'
import { DEFAULT_BILLING_CONCURRENCY_LIMITS } from '@/lib/billing/concurrency-defaults'

/**
 * Credit line for an Arena upgrade card. `refresh` is omitted — Arena disables
 * daily refresh by default.
 */
export interface ArenaPlanCredits {
  credits: string
  refresh?: undefined
}

export const ARENA_STARTER_PLAN_CREDITS: ArenaPlanCredits = {
  credits: `${STARTER_CREDITS.toLocaleString('en-US')} credits (1 month)`,
}

export const ARENA_PRO_PLAN_CREDITS: ArenaPlanCredits = {
  credits: `${ARENA_PRO_TIER.credits.toLocaleString('en-US')} credits/mo`,
}

export const ARENA_MAX_PLAN_CREDITS: ArenaPlanCredits = {
  credits: `${ARENA_MAX_TIER.credits.toLocaleString('en-US')} credits/mo`,
}

export const ARENA_ENTERPRISE_PLAN_CREDITS: ArenaPlanCredits = {
  credits: 'Custom',
}

/** Starter reuses the Pro limit bucket; Max product features remain via access helpers. */
export const ARENA_STARTER_PLAN_FEATURES: readonly string[] = [
  `${DEFAULT_BILLING_CONCURRENCY_LIMITS.pro.toLocaleString('en-US')} concurrent executions`,
  'Invite teammates',
  'Higher rate limits',
  'Extended run timeouts',
  'More storage & tables',
]

export const ARENA_PRO_PLAN_FEATURES: readonly string[] = [
  `${DEFAULT_BILLING_CONCURRENCY_LIMITS.pro.toLocaleString('en-US')} concurrent executions`,
  'Invite teammates',
  'Higher rate limits',
  'Extended run timeouts',
  'More storage & tables',
]

export const ARENA_MAX_PLAN_FEATURES: readonly string[] = [
  `${DEFAULT_BILLING_CONCURRENCY_LIMITS.team.toLocaleString('en-US')} concurrent executions`,
  'Invite teammates',
  'Sim Mailer & KB Live Sync',
  'Highest rate limits',
  'Expanded storage & tables',
]

export const ARENA_ENTERPRISE_PLAN_FEATURES: readonly string[] = [
  `${DEFAULT_BILLING_CONCURRENCY_LIMITS.enterprise.toLocaleString('en-US')} concurrent executions, customizable`,
  'Custom limits & infrastructure',
  'SSO & SOC2 compliance',
  'Access control & self-hosting',
  'Dedicated support',
]

/** Flat org pricing copy (not per-seat). */
export function getArenaPriceSubtext(isAnnual: boolean): string {
  return isAnnual ? 'per org/month, billed annually' : 'per org/month, billed monthly'
}
