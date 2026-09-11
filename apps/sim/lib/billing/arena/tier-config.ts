/**
 * Arena paid credit tiers. Kept separate from upstream {@link @/lib/billing/constants}
 * so open-source merges do not conflict on tier definitions.
 *
 * At 65 credits per dollar: Pro = $30 → 1,950 credits; Max = $100 → 6,500 credits.
 */

/** Arena Pro for Teams — flat $30/org/month. */
export const ARENA_PRO_TIER = { credits: 1950, dollars: 30, name: 'Pro' } as const

/** Arena Max for Teams — flat $100/org/month. */
export const ARENA_MAX_TIER = { credits: 6500, dollars: 100, name: 'Max' } as const

export const ARENA_CREDIT_TIERS = [ARENA_PRO_TIER, ARENA_MAX_TIER] as const

export type ArenaCreditTier = (typeof ARENA_CREDIT_TIERS)[number]

/** Canonical plan names for Arena paid org subscriptions. */
export const ARENA_PRO_PLAN = `team_${ARENA_PRO_TIER.credits}` as const
export const ARENA_MAX_PLAN = `team_${ARENA_MAX_TIER.credits}` as const

/**
 * True when the plan is Arena Max (`team_6500` or a future higher Arena team tier).
 * Does not include Starter — Starter Max features go through starter access helpers.
 */
export function isArenaMaxPlan(plan: string | null | undefined): boolean {
  if (!plan) return false
  const match = plan.match(/^team_(\d+)$/)
  if (!match) return false
  return Number.parseInt(match[1], 10) >= ARENA_MAX_TIER.credits
}

/**
 * True when the plan is Arena Pro (`team_1950`).
 */
export function isArenaProPlan(plan: string | null | undefined): boolean {
  return plan === ARENA_PRO_PLAN
}

/**
 * Dollar amount for an Arena paid credit tier, or null when not an Arena tier.
 */
export function getArenaPlanTierDollars(plan: string | null | undefined): number | null {
  if (!plan) return null
  const match = plan.match(/_(\d+)$/)
  if (!match) return null
  const credits = Number.parseInt(match[1], 10)
  const tier = ARENA_CREDIT_TIERS.find((entry) => entry.credits === credits)
  return tier?.dollars ?? null
}
