import { createLogger } from '@sim/logger'

const logger = createLogger('UsageSkipMetrics')

/** Reasons a usage_log write was skipped or degraded. */
export type UsageSkipReason =
  | 'missing_billing_user'
  | 'deleted_workflow'
  | 'workflow_not_found'
  | 'no_cost_to_record'
  | 'all_entries_zero_cost'
  | 'duplicate_event_key'
  | 'advisory_lock_timeout'
  | 'record_usage_failed'

const counters = new Map<UsageSkipReason, number>()

/**
 * Increments the skip counter and emits a structured warn/error log.
 * Use at every silent-skip path so billing gaps are observable in logs/metrics.
 */
export function logUsageSkip(
  reason: UsageSkipReason,
  details: Record<string, unknown>,
  level: 'warn' | 'error' = 'warn'
): void {
  const count = (counters.get(reason) ?? 0) + 1
  counters.set(reason, count)

  const payload = { reason, count, ...details }
  if (level === 'error') {
    logger.error('Usage write skipped or failed', payload)
  } else {
    logger.warn('Usage write skipped', payload)
  }
}

/** Returns a snapshot of skip counters (for tests and diagnostics). */
export function getUsageSkipCounts(): Readonly<Record<UsageSkipReason, number>> {
  const snapshot = {} as Record<UsageSkipReason, number>
  for (const [reason, count] of counters) {
    snapshot[reason] = count
  }
  return snapshot
}

/** Resets skip counters (tests only). */
export function resetUsageSkipCounts(): void {
  counters.clear()
}
