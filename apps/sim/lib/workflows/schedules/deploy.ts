import { db, workflowSchedule } from '@sim/db'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/lib/db/types'
import { cleanupWebhooksForWorkflow } from '@/lib/webhooks/deploy'
import type { BlockState } from '@/lib/workflows/schedules/utils'
import { findScheduleBlocks, validateScheduleBlock } from '@/lib/workflows/schedules/validation'

const logger = createLogger('ScheduleDeployUtils')

/**
 * Result of schedule creation during deploy
 */
export interface ScheduleDeployResult {
  success: boolean
  error?: string
  scheduleId?: string
  cronExpression?: string
  nextRunAt?: Date
  timezone?: string
}

/**
 * Create or update schedule records for a workflow during deployment.
 * Uses a transaction to ensure atomicity - all schedules are created or none are.
 */
export async function createSchedulesForDeploy(
  workflowId: string,
  blocks: Record<string, BlockState>,
  _tx: DbOrTx,
  deploymentVersionId?: string
): Promise<ScheduleDeployResult> {
  const scheduleBlocks = findScheduleBlocks(blocks)

  if (scheduleBlocks.length === 0) {
    logger.info(`No schedule blocks found in workflow ${workflowId}`)
    return { success: true }
  }

  // Phase 1: Validate ALL blocks before making any DB changes
  const validatedBlocks: Array<{
    blockId: string
    cronExpression: string
    nextRunAt: Date
    timezone: string
  }> = []

  for (const block of scheduleBlocks) {
    const blockId = block.id as string
    const validation = validateScheduleBlock(block)
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      }
    }
    validatedBlocks.push({
      blockId,
      cronExpression: validation.cronExpression!,
      nextRunAt: validation.nextRunAt!,
      timezone: validation.timezone!,
    })
  }

  // Phase 2: All validations passed - now do DB operations in a transaction
  let lastScheduleInfo: {
    scheduleId: string
    cronExpression?: string
    nextRunAt?: Date
    timezone?: string
  } | null = null

  try {
    await db.transaction(async (tx) => {
      const currentBlockIds = new Set(validatedBlocks.map((b) => b.blockId))

      /**
       * Deploy-owned rows use `source_type = 'workflow'`. Match all active rows for this workflow
       * so redeploys with a new `deployment_version_id` still find the previous schedule row.
       * `ON CONFLICT` on the partial unique index is brittle (migration / PG inference mismatches).
       */
      const existingSchedules = await tx
        .select({ id: workflowSchedule.id, blockId: workflowSchedule.blockId })
        .from(workflowSchedule)
        .where(
          and(
            eq(workflowSchedule.workflowId, workflowId),
            isNull(workflowSchedule.archivedAt),
            eq(workflowSchedule.sourceType, 'workflow')
          )
        )

      const orphanedScheduleIds = existingSchedules
        .filter((s) => s.blockId && !currentBlockIds.has(s.blockId))
        .map((s) => s.id)

      if (orphanedScheduleIds.length > 0) {
        logger.info(
          `Deleting ${orphanedScheduleIds.length} orphaned schedule(s) for workflow ${workflowId}`
        )
        await tx.delete(workflowSchedule).where(inArray(workflowSchedule.id, orphanedScheduleIds))
      }

      const keptIds = new Set(
        existingSchedules.filter((s) => !orphanedScheduleIds.includes(s.id)).map((s) => s.id)
      )

      for (const validated of validatedBlocks) {
        const { blockId, cronExpression, nextRunAt, timezone } = validated
        const now = new Date()

        const rowsForBlock = existingSchedules.filter(
          (s) => s.blockId === blockId && keptIds.has(s.id)
        )
        const duplicateIds = rowsForBlock.slice(1).map((s) => s.id)
        if (duplicateIds.length > 0) {
          logger.warn(
            `Removing ${duplicateIds.length} duplicate workflow_schedule row(s) for workflow ${workflowId} block ${blockId}`
          )
          await tx.delete(workflowSchedule).where(inArray(workflowSchedule.id, duplicateIds))
          for (const id of duplicateIds) {
            keptIds.delete(id)
          }
        }

        const primaryRow = rowsForBlock[0]

        const setValues = {
          deploymentVersionId: deploymentVersionId ?? null,
          blockId,
          cronExpression,
          updatedAt: now,
          nextRunAt,
          timezone,
          status: 'active' as const,
          failedCount: 0,
        }

        if (primaryRow) {
          await tx
            .update(workflowSchedule)
            .set(setValues)
            .where(eq(workflowSchedule.id, primaryRow.id))

          logger.info(`Schedule updated for workflow ${workflowId}, block ${blockId}`, {
            scheduleId: primaryRow.id,
            cronExpression,
            nextRunAt: nextRunAt?.toISOString(),
          })

          lastScheduleInfo = {
            scheduleId: primaryRow.id,
            cronExpression,
            nextRunAt,
            timezone,
          }
        } else {
          const scheduleId = crypto.randomUUID()
          await tx.insert(workflowSchedule).values({
            id: scheduleId,
            workflowId,
            deploymentVersionId: deploymentVersionId ?? null,
            blockId,
            cronExpression,
            triggerType: 'schedule',
            createdAt: now,
            updatedAt: now,
            nextRunAt,
            timezone,
            status: 'active',
            failedCount: 0,
            sourceType: 'workflow',
          })

          logger.info(`Schedule created for workflow ${workflowId}, block ${blockId}`, {
            scheduleId,
            cronExpression,
            nextRunAt: nextRunAt?.toISOString(),
          })

          lastScheduleInfo = { scheduleId, cronExpression, nextRunAt, timezone }
        }
      }
    })
  } catch (error) {
    logger.error(`Failed to create schedules for workflow ${workflowId}`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create schedules',
    }
  }

  return {
    success: true,
    ...(lastScheduleInfo ?? {}),
  }
}

/**
 * Delete all schedules for a workflow
 * This should be called within a database transaction during undeploy
 */
export async function deleteSchedulesForWorkflow(
  workflowId: string,
  tx: DbOrTx,
  deploymentVersionId?: string
): Promise<void> {
  await tx
    .delete(workflowSchedule)
    .where(
      deploymentVersionId
        ? and(
            eq(workflowSchedule.workflowId, workflowId),
            eq(workflowSchedule.deploymentVersionId, deploymentVersionId),
            isNull(workflowSchedule.archivedAt)
          )
        : and(eq(workflowSchedule.workflowId, workflowId), isNull(workflowSchedule.archivedAt))
    )

  logger.info(
    deploymentVersionId
      ? `Deleted schedules for workflow ${workflowId} deployment ${deploymentVersionId}`
      : `Deleted all schedules for workflow ${workflowId}`
  )
}

export async function cleanupDeploymentVersion(params: {
  workflowId: string
  workflow: Record<string, unknown>
  requestId: string
  deploymentVersionId: string
  /**
   * If true, skip external subscription cleanup (already done by saveTriggerWebhooksForDeploy).
   * Only deletes DB records.
   */
  skipExternalCleanup?: boolean
}): Promise<void> {
  const {
    workflowId,
    workflow,
    requestId,
    deploymentVersionId,
    skipExternalCleanup = false,
  } = params
  await cleanupWebhooksForWorkflow(
    workflowId,
    workflow,
    requestId,
    deploymentVersionId,
    skipExternalCleanup
  )
  await deleteSchedulesForWorkflow(workflowId, db, deploymentVersionId)
}
