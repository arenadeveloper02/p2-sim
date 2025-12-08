import { db, templates, workflow, workflowExecutionLogs, workflowStatsDaily } from '@sim/db'
import { and, count, eq, gte, lte, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { generateRequestId } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'

export const dynamic = 'force-dynamic'

const logger = createLogger('WorkflowStatsDailyAPI')

/**
 * GET /api/workflows/stats/daily
 * Aggregates workflow execution stats for external chat executions from yesterday
 * and updates the workflow_stats_daily table.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  logger.info(
    `[${requestId}] Workflow stats daily aggregation triggered at ${new Date().toISOString()}`
  )

  const authError = verifyCronAuth(request, 'Workflow stats daily aggregation')
  if (authError) {
    return authError
  }

  try {
    // Calculate yesterday's date range
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const endOfYesterday = new Date(yesterday)
    endOfYesterday.setHours(23, 59, 59, 999)

    logger.info(
      `[${requestId}] Fetching external chat executions from ${yesterday.toISOString()} to ${endOfYesterday.toISOString()}`
    )

    // Fetch workflow execution logs for yesterday where is_external_chat is true
    // Group by workflow_id and count executions
    const executionStats = await db
      .select({
        workflowId: workflowExecutionLogs.workflowId,
        executionCount: count(workflowExecutionLogs.id),
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.isExternalChat, true),
          gte(workflowExecutionLogs.startedAt, yesterday),
          lte(workflowExecutionLogs.startedAt, endOfYesterday)
        )
      )
      .groupBy(workflowExecutionLogs.workflowId)

    logger.info(
      `[${requestId}] Found ${executionStats.length} workflows with external chat executions`
    )

    const statsToInsert: Array<{
      id: string
      workflowId: string | null
      workflowName: string | null
      workflowAuthorId: string | null
      category: string | null
      executionCount: number
    }> = []

    // For each workflow, get template info and workflow info
    for (const stat of executionStats) {
      // Check if template exists for this workflow
      const [template] = await db
        .select({
          name: templates.name,
          details: templates.details,
        })
        .from(templates)
        .where(eq(templates.workflowId, stat.workflowId))
        .limit(1)

      // If template doesn't exist, skip this workflow
      if (!template) {
        logger.debug(`[${requestId}] Skipping workflow ${stat.workflowId} - no template found`)
        continue
      }

      // Get workflow info for user_id
      const [workflowRecord] = await db
        .select({
          userId: workflow.userId,
        })
        .from(workflow)
        .where(eq(workflow.id, stat.workflowId))
        .limit(1)

      if (!workflowRecord) {
        logger.warn(`[${requestId}] Workflow ${stat.workflowId} not found, skipping`)
        continue
      }

      // Extract category from template details (JSONB field)
      const category =
        template.details && typeof template.details === 'object' && 'category' in template.details
          ? ((template.details as { category?: string }).category ?? null)
          : null

      statsToInsert.push({
        id: crypto.randomUUID(),
        workflowId: stat.workflowId,
        workflowName: template.name,
        workflowAuthorId: workflowRecord.userId,
        category,
        executionCount: stat.executionCount,
      })
    }

    logger.info(`[${requestId}] Prepared ${statsToInsert.length} stats records to insert`)

    // Insert stats into workflow_stats_daily
    if (statsToInsert.length > 0) {
      await db.insert(workflowStatsDaily).values(
        statsToInsert.map((stat) => ({
          id: stat.id,
          workflowId: stat.workflowId,
          workflowName: stat.workflowName,
          workflowAuthorId: stat.workflowAuthorId,
          category: stat.category,
          executionCount: stat.executionCount,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }))
      )

      logger.info(`[${requestId}] Successfully inserted ${statsToInsert.length} stats records`)
    }

    return NextResponse.json({
      message: 'Workflow stats daily aggregation completed',
      processedWorkflows: statsToInsert.length,
      totalWorkflows: executionStats.length,
      skippedWorkflows: executionStats.length - statsToInsert.length,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error in workflow stats daily aggregation`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
