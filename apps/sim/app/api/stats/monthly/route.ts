import { db, workflowStatsDaily, workflowStatsMonthly } from '@sim/db'
import { and, gte, lte, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { generateRequestId } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'

export const dynamic = 'force-dynamic'

const logger = createLogger('WorkflowStatsMonthlyAPI')

/**
 * GET /api/stats/monthly
 * Aggregates workflow stats from workflow_stats_daily for last month
 * and updates the workflow_stats_monthly table.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  logger.info(
    `[${requestId}] Workflow stats monthly aggregation triggered at ${new Date().toISOString()}`
  )

  const authError = verifyCronAuth(request, 'Workflow stats monthly aggregation')
  if (authError) {
    return authError
  }

  try {
    // Calculate last month's date range
    const now = new Date()
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    firstDayOfLastMonth.setHours(0, 0, 0, 0)

    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    lastDayOfLastMonth.setHours(23, 59, 59, 999)

    logger.info(
      `[${requestId}] Fetching daily stats from ${firstDayOfLastMonth.toISOString()} to ${lastDayOfLastMonth.toISOString()}`
    )

    // Fetch and aggregate workflow_stats_daily records from last month
    // Group by workflow_id and sum executionCount
    const monthlyStats = await db
      .select({
        workflowId: workflowStatsDaily.workflowId,
        workflowName: sql<string | null>`MAX(${workflowStatsDaily.workflowName})`,
        workflowAuthorId: sql<string | null>`MAX(${workflowStatsDaily.workflowAuthorId})`,
        category: sql<string | null>`MAX(${workflowStatsDaily.category})`,
        executionCount: sql<number>`SUM(${workflowStatsDaily.executionCount})`,
      })
      .from(workflowStatsDaily)
      .where(
        and(
          gte(workflowStatsDaily.createdAt, firstDayOfLastMonth),
          lte(workflowStatsDaily.createdAt, lastDayOfLastMonth)
        )
      )
      .groupBy(workflowStatsDaily.workflowId)

    logger.info(
      `[${requestId}] Found ${monthlyStats.length} workflows with daily stats to aggregate`
    )

    // Prepare stats to insert into workflow_stats_monthly
    const statsToInsert = monthlyStats
      .filter((stat) => stat.workflowId !== null)
      .map((stat) => ({
        id: crypto.randomUUID(),
        workflowId: stat.workflowId,
        workflowName: stat.workflowName,
        workflowAuthorId: stat.workflowAuthorId,
        category: stat.category,
        executionCount: stat.executionCount,
      }))

    logger.info(`[${requestId}] Prepared ${statsToInsert.length} monthly stats records to insert`)

    // Insert stats into workflow_stats_monthly
    if (statsToInsert.length > 0) {
      await db.insert(workflowStatsMonthly).values(
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

      logger.info(
        `[${requestId}] Successfully inserted ${statsToInsert.length} monthly stats records`
      )
    }

    return NextResponse.json({
      message: 'Workflow stats monthly aggregation completed',
      processedWorkflows: statsToInsert.length,
      totalWorkflows: monthlyStats.length,
      dateRange: {
        start: firstDayOfLastMonth.toISOString(),
        end: lastDayOfLastMonth.toISOString(),
      },
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error in workflow stats monthly aggregation`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
