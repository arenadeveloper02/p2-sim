import { db } from '@sim/db'
import { workflowSchedule } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'

const logger = createLogger('ScheduleUnlock')

/**
 * Unlocks a stuck schedule so it fires again on the next cron tick.
 *
 * When an execution crashes or is killed mid-run, `last_queued_at` on
 * `workflow_schedule` is never cleared.  The scheduler's due-filter
 * requires `last_queued_at IS NULL OR last_queued_at < next_run_at`,
 * so a non-null `last_queued_at` permanently blocks future runs for
 * that slot.  Resetting it to `NULL` is the minimal fix — the existing
 * `next_run_at` (a past timestamp) satisfies `next_run_at <= now`
 * immediately, so the schedule fires on the very next cron tick without
 * any additional changes.
 *
 * @param scheduleId - The `workflow_schedule.id` to unlock.
 * @param context - Optional string for log attribution (e.g. executionId).
 * @returns `true` if the schedule was unlocked, `false` on error.
 */
export async function unlockStaleSchedule(scheduleId: string, context?: string): Promise<boolean> {
  try {
    await db
      .update(workflowSchedule)
      .set({ lastQueuedAt: null, updatedAt: new Date() })
      .where(eq(workflowSchedule.id, scheduleId))

    logger.info('Unlocked stale schedule for next run', { scheduleId, context })
    return true
  } catch (error) {
    logger.error('Failed to unlock stale schedule', {
      scheduleId,
      context,
      error: toError(error).message,
    })
    return false
  }
}

/**
 * Extracts the `scheduleId` from a `workflow_execution_logs.execution_data`
 * JSONB value.  Returns `undefined` when the correlation object is absent or
 * the field is not a non-empty string.
 */
export function extractScheduleId(executionData: unknown): string | undefined {
  if (!executionData || typeof executionData !== 'object') return undefined
  const data = executionData as Record<string, unknown>
  const correlation = data.correlation
  if (!correlation || typeof correlation !== 'object') return undefined
  const id = (correlation as Record<string, unknown>).scheduleId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}
