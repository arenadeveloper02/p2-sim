import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'

const logger = createLogger('ExecutionCancellation')

/**
 * Mark an execution as cancelled in the database.
 * Updates the workflow_execution_logs status to 'cancelled'.
 * Returns true if the update was successful, false otherwise.
 */
export async function markExecutionCancelled(executionId: string): Promise<boolean> {
  try {
    const result = await db
      .update(workflowExecutionLogs)
      .set({
        status: 'cancelled',
        endedAt: new Date(),
      })
      .where(eq(workflowExecutionLogs.executionId, executionId))

    logger.info('Marked execution as cancelled in database', { executionId })
    return true
  } catch (error) {
    logger.error('Failed to mark execution as cancelled', { executionId, error })
    return false
  }
}

/**
 * Check if an execution has been cancelled by querying the database.
 * Uses indexed lookup on executionId for fast queries.
 * Returns false if the execution is not found or not cancelled.
 */
export async function isExecutionCancelled(executionId: string): Promise<boolean> {
  try {
    const [execution] = await db
      .select({ status: workflowExecutionLogs.status })
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .limit(1)

    if (!execution) {
      return false
    }

    return execution.status === 'cancelled'
  } catch (error) {
    logger.error('Failed to check execution cancellation', { executionId, error })
    return false
  }
}

/**
 * Clear the cancellation flag for an execution.
 * Note: This is typically not needed as the status is managed by the execution lifecycle.
 * The status will be updated to 'completed' or 'failed' when execution finishes.
 */
export async function clearExecutionCancellation(executionId: string): Promise<void> {
  // No-op: Status is managed by execution completion
  // The execution will be marked as 'completed' or 'failed' when it finishes
  logger.debug('clearExecutionCancellation called (no-op)', { executionId })
}
