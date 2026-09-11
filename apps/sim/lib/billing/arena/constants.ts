/**
 * Arena billing constants. Kept separate from upstream {@link @/lib/billing/constants}
 * so open-source merges do not conflict on tier and Starter definitions.
 */

/** Plan name persisted on organization Starter subscriptions. */
export const STARTER_PLAN = 'starter' as const

/** Total Starter allowance in credits (display / documentation). */
export const STARTER_CREDITS = 6_500

/** Starter org usage limit in dollars ($100 at 65 credits per dollar). */
export const STARTER_USAGE_LIMIT_DOLLARS = 100

/** Calendar months included in the Starter entitlement window. */
export const STARTER_DURATION_MONTHS = 1

/** Metadata flag stored on Starter subscription rows. */
export const STARTER_METADATA_SOURCE = 'client-organization' as const
