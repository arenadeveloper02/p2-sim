/**
 * Categories that record usage Sim does not charge for. Their `cost` is always `0`
 * and their value is the token counts in `metadata`, so usage reporting can show
 * volume that the billing ledger has no reason to know about.
 *
 * These are the only categories exempt from `recordUsage`'s `cost > 0` filter.
 * Every billing aggregate over usage_log is `SUM(cost)`, so zero-cost rows leave
 * every existing total unchanged.
 *
 * Kept in a leaf module so the run cost ledger can import it without initializing
 * `usage-log.ts`.
 */
export const UNBILLED_USAGE_CATEGORIES = ['model_unbilled'] as const
