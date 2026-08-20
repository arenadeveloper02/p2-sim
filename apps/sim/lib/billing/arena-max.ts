/**
 * Arena-facing billing constants and sold Team Max yearly SKU.
 */

/** User-facing name on billing surfaces for Enterprise branding. */
export const ARENA_MAX_DISPLAY_NAME = 'Arena' as const

/** List price on the upgrade page (yearly Team Max). */
export const ARENA_MAX_PRICE_USD_PER_YEAR = 1000

/** Credit-tier suffix for Team Max checkout (`team_25000` → STRIPE_PRICE_TEAM_100_YR). */
export const ARENA_MAX_CREDIT_TIER = 25000

/**
 * Free client-org pooled credits granted at ensure-member org create.
 * Stored as dollars on `organization.org_usage_limit` ($1 = 200 credits).
 */
export const ARENA_CLIENT_ORG_FREE_CREDITS = 1000

/** Public contact form for custom / sales requests. */
export const ARENA_CONTACT_URL = 'https://thearena.ai/contact' as const
