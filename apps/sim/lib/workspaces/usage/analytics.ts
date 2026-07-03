import { dbReplica } from '@sim/db'
import {
  copilotChats,
  copilotRuns,
  usageLog,
  workflow,
  workflowExecutionLogs,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { and, eq, gte, inArray, isNotNull, lte, or, type SQL, sql } from 'drizzle-orm'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import type { UsageLogSource } from '@/lib/billing/core/usage-log'
import { COPILOT_USAGE_SOURCES } from '@/lib/billing/core/usage-log'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'

const logger = createLogger('WorkspaceUsageAnalytics')

const WORKFLOW_SOURCE: UsageLogSource = 'workflow'

const PERIOD_MS: Record<'1d' | '7d' | '30d' | '90d', number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

export interface WorkspaceUsageAnalyticsOptions {
  workspaceId: string
  startTime?: string
  endTime?: string
  period?: '1d' | '7d' | '30d' | '90d'
  sources?: UsageLogSource[]
  allTime?: boolean
}

interface ResolvedPeriod {
  start: Date
  end: Date
}

function parseDecimal(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function ledgerCostSelect() {
  return {
    billableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
    rawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
    count: sql<number>`count(*)::int`,
  }
}

function buildLedgerConditions(
  workspaceId: string,
  period: ResolvedPeriod,
  sources?: UsageLogSource[]
): SQL[] {
  const conditions: SQL[] = [
    eq(usageLog.workspaceId, workspaceId),
    gte(usageLog.createdAt, period.start),
    lte(usageLog.createdAt, period.end),
  ]
  if (sources && sources.length > 0) {
    conditions.push(inArray(usageLog.source, sources))
  }
  return conditions
}

async function resolvePeriod(
  workspaceId: string,
  options: WorkspaceUsageAnalyticsOptions
): Promise<ResolvedPeriod> {
  if (options.allTime) {
    const [usageBounds, executionBounds] = await Promise.all([
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${usageLog.createdAt})`,
          maxAt: sql<Date | null>`max(${usageLog.createdAt})`,
        })
        .from(usageLog)
        .where(eq(usageLog.workspaceId, workspaceId)),
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${workflowExecutionLogs.startedAt})`,
          maxAt: sql<Date | null>`max(${workflowExecutionLogs.startedAt})`,
        })
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.workspaceId, workspaceId)),
    ])

    const candidates = [
      usageBounds[0]?.minAt,
      usageBounds[0]?.maxAt,
      executionBounds[0]?.minAt,
      executionBounds[0]?.maxAt,
    ].filter((value): value is Date => value instanceof Date)

    if (candidates.length === 0) {
      const now = new Date()
      return { start: now, end: now }
    }

    const start = new Date(Math.min(...candidates.map((date) => date.getTime())))
    const end = new Date(Math.max(...candidates.map((date) => date.getTime()), Date.now()))
    return { start, end }
  }

  const end = options.endTime ? new Date(options.endTime) : new Date()
  const start = options.startTime
    ? new Date(options.startTime)
    : new Date(end.getTime() - PERIOD_MS[options.period ?? '30d'])

  return { start, end }
}

/**
 * Aggregates workspace usage across the billing ledger, workflow execution logs,
 * and copilot chat/run tables for admin analytics dashboards.
 */
export async function getWorkspaceUsageAnalytics(
  options: WorkspaceUsageAnalyticsOptions
): Promise<WorkspaceUsageAnalytics> {
  const { workspaceId, sources } = options

  try {
    const period = await resolvePeriod(workspaceId, options)

    if (Number.isNaN(period.start.getTime()) || Number.isNaN(period.end.getTime())) {
      throw new Error('Invalid time range')
    }

    if (period.start > period.end) {
      throw new Error('Invalid time range')
    }

    const ledgerConditions = buildLedgerConditions(workspaceId, period, sources)

    const [
      bySourceRows,
      attributionRows,
      workflowExecutionSummary,
      workflowLedgerSummary,
      workflowByTriggerRows,
      workflowByWorkflowRows,
      copilotChatSummary,
      copilotRunSummary,
      copilotByTypeRows,
      copilotByModelRows,
      byUserRows,
      byModelRows,
      byProviderRows,
      byToolRows,
    ] = await Promise.all([
      dbReplica
        .select({
          source: usageLog.source,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(usageLog.source),

      dbReplica
        .select({
          missingChatIdCost: sql<string>`coalesce(sum(case when ${usageLog.source} in (${sql.join(
            COPILOT_USAGE_SOURCES.map((s) => sql`${s}`),
            sql`, `
          )}) and ${usageLog.chatId} is null then ${usageLog.cost}::numeric else 0 end), 0)`,
          missingChatIdCount: sql<number>`count(case when ${usageLog.source} in (${sql.join(
            COPILOT_USAGE_SOURCES.map((s) => sql`${s}`),
            sql`, `
          )}) and ${usageLog.chatId} is null then 1 end)::int`,
          missingChatIdRawCost: sql<string>`coalesce(sum(case when ${usageLog.source} in (${sql.join(
            COPILOT_USAGE_SOURCES.map((s) => sql`${s}`),
            sql`, `
          )}) and ${usageLog.chatId} is null then coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric else 0 end), 0)`,
          missingExecutionIdCost: sql<string>`coalesce(sum(case when ${usageLog.source} = ${WORKFLOW_SOURCE} and ${usageLog.executionId} is null then ${usageLog.cost}::numeric else 0 end), 0)`,
          missingExecutionIdCount: sql<number>`count(case when ${usageLog.source} = ${WORKFLOW_SOURCE} and ${usageLog.executionId} is null then 1 end)::int`,
          missingExecutionIdRawCost: sql<string>`coalesce(sum(case when ${usageLog.source} = ${WORKFLOW_SOURCE} and ${usageLog.executionId} is null then coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric else 0 end), 0)`,
        })
        .from(usageLog)
        .where(and(...ledgerConditions)),

      dbReplica
        .select({
          total: sql<number>`count(*)::int`,
          withProjectedCost: sql<number>`count(case when ${workflowExecutionLogs.costTotal} is not null and ${workflowExecutionLogs.costTotal}::numeric > 0 then 1 end)::int`,
          totalProjectedCost: sql<string>`coalesce(sum(${workflowExecutionLogs.costTotal}::numeric), 0)`,
        })
        .from(workflowExecutionLogs)
        .where(
          and(
            eq(workflowExecutionLogs.workspaceId, workspaceId),
            gte(workflowExecutionLogs.startedAt, period.start),
            lte(workflowExecutionLogs.startedAt, period.end)
          )
        ),

      dbReplica
        .select({
          totalLedgerCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
        })
        .from(usageLog)
        .where(
          and(
            ...ledgerConditions,
            eq(usageLog.source, WORKFLOW_SOURCE),
            isNotNull(usageLog.executionId)
          )
        ),

      dbReplica
        .select({
          trigger: workflowExecutionLogs.trigger,
          executionCount: sql<number>`count(distinct ${workflowExecutionLogs.executionId})::int`,
          ...ledgerCostSelect(),
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.executionId, workflowExecutionLogs.executionId),
            eq(usageLog.source, WORKFLOW_SOURCE),
            eq(usageLog.workspaceId, workspaceId),
            gte(usageLog.createdAt, period.start),
            lte(usageLog.createdAt, period.end)
          )
        )
        .where(
          and(
            eq(workflowExecutionLogs.workspaceId, workspaceId),
            gte(workflowExecutionLogs.startedAt, period.start),
            lte(workflowExecutionLogs.startedAt, period.end)
          )
        )
        .groupBy(workflowExecutionLogs.trigger),

      dbReplica
        .select({
          workflowId: workflowExecutionLogs.workflowId,
          workflowName: workflow.name,
          executionCount: sql<number>`count(distinct ${workflowExecutionLogs.executionId})::int`,
          ...ledgerCostSelect(),
        })
        .from(workflowExecutionLogs)
        .leftJoin(workflow, eq(workflow.id, workflowExecutionLogs.workflowId))
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.executionId, workflowExecutionLogs.executionId),
            eq(usageLog.source, WORKFLOW_SOURCE),
            eq(usageLog.workspaceId, workspaceId),
            gte(usageLog.createdAt, period.start),
            lte(usageLog.createdAt, period.end)
          )
        )
        .where(
          and(
            eq(workflowExecutionLogs.workspaceId, workspaceId),
            gte(workflowExecutionLogs.startedAt, period.start),
            lte(workflowExecutionLogs.startedAt, period.end)
          )
        )
        .groupBy(workflowExecutionLogs.workflowId, workflow.name),

      dbReplica
        .select({
          total: sql<number>`count(distinct ${copilotChats.id})::int`,
          withLedgerCost: sql<number>`count(distinct case when ${usageLog.id} is not null then ${copilotChats.id} end)::int`,
        })
        .from(copilotChats)
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.chatId, copilotChats.id),
            eq(usageLog.workspaceId, workspaceId),
            gte(usageLog.createdAt, period.start),
            lte(usageLog.createdAt, period.end)
          )
        )
        .where(
          and(
            eq(copilotChats.workspaceId, workspaceId),
            or(
              and(gte(copilotChats.createdAt, period.start), lte(copilotChats.createdAt, period.end)),
              isNotNull(usageLog.id)
            )
          )
        ),

      dbReplica
        .select({
          total: sql<number>`count(distinct ${copilotRuns.id})::int`,
        })
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.workspaceId, workspaceId),
            gte(copilotRuns.startedAt, period.start),
            lte(copilotRuns.startedAt, period.end)
          )
        ),

      dbReplica
        .select({
          chatType: copilotChats.type,
          chatCount: sql<number>`count(distinct ${copilotChats.id})::int`,
          runCount: sql<number>`count(distinct ${copilotRuns.id})::int`,
          ...ledgerCostSelect(),
        })
        .from(copilotChats)
        .leftJoin(
          copilotRuns,
          and(
            eq(copilotRuns.chatId, copilotChats.id),
            gte(copilotRuns.startedAt, period.start),
            lte(copilotRuns.startedAt, period.end)
          )
        )
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.chatId, copilotChats.id),
            eq(usageLog.workspaceId, workspaceId),
            gte(usageLog.createdAt, period.start),
            lte(usageLog.createdAt, period.end)
          )
        )
        .where(
          and(
            eq(copilotChats.workspaceId, workspaceId),
            or(
              and(gte(copilotChats.createdAt, period.start), lte(copilotChats.createdAt, period.end)),
              isNotNull(usageLog.id),
              isNotNull(copilotRuns.id)
            )
          )
        )
        .groupBy(copilotChats.type),

      dbReplica
        .select({
          model: copilotChats.model,
          ...ledgerCostSelect(),
        })
        .from(copilotChats)
        .innerJoin(usageLog, eq(usageLog.chatId, copilotChats.id))
        .where(
          and(
            eq(copilotChats.workspaceId, workspaceId),
            eq(usageLog.workspaceId, workspaceId),
            gte(usageLog.createdAt, period.start),
            lte(usageLog.createdAt, period.end),
            inArray(usageLog.source, COPILOT_USAGE_SOURCES)
          )
        )
        .groupBy(copilotChats.model),

      dbReplica
        .select({
          userId: usageLog.userId,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(usageLog.userId),

      dbReplica
        .select({
          model: usageLog.description,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions, eq(usageLog.category, 'model')))
        .groupBy(usageLog.description),

      dbReplica
        .select({
          provider: usageLog.provider,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions, isNotNull(usageLog.provider)))
        .groupBy(usageLog.provider),

      dbReplica
        .select({
          toolId: usageLog.toolId,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions, isNotNull(usageLog.toolId)))
        .groupBy(usageLog.toolId),
    ])

    const bySource = bySourceRows.map((row) => ({
      source: row.source,
      billableCost: parseDecimal(row.billableCost),
      rawCost: parseDecimal(row.rawCost),
      count: row.count,
    }))

    const totalBillableCost = bySource.reduce((sum, row) => sum + row.billableCost, 0)
    const totalRawCost = bySource.reduce((sum, row) => sum + row.rawCost, 0)
    const ledgerEntryCount = bySource.reduce((sum, row) => sum + row.count, 0)

    const attribution = attributionRows[0]
    const workflowSummary = workflowExecutionSummary[0]
    const workflowLedger = workflowLedgerSummary[0]
    const chatSummary = copilotChatSummary[0]
    const runSummary = copilotRunSummary[0]

    return {
      period: {
        startTime: period.start.toISOString(),
        endTime: period.end.toISOString(),
      },
      summary: {
        billableCost: totalBillableCost,
        rawCost: totalRawCost,
        billableCostCredits: dollarsToCredits(totalBillableCost),
        ledgerEntryCount,
        executionCount: workflowSummary?.total ?? 0,
        chatCount: chatSummary?.total ?? 0,
        runCount: runSummary?.total ?? 0,
      },
      bySource,
      attribution: {
        missingChatId: {
          billableCost: parseDecimal(attribution?.missingChatIdCost),
          rawCost: parseDecimal(attribution?.missingChatIdRawCost),
          count: attribution?.missingChatIdCount ?? 0,
        },
        missingExecutionId: {
          billableCost: parseDecimal(attribution?.missingExecutionIdCost),
          rawCost: parseDecimal(attribution?.missingExecutionIdRawCost),
          count: attribution?.missingExecutionIdCount ?? 0,
        },
      },
      workflow: {
        executions: {
          total: workflowSummary?.total ?? 0,
          withProjectedCost: workflowSummary?.withProjectedCost ?? 0,
          totalProjectedCost: parseDecimal(workflowSummary?.totalProjectedCost),
          totalLedgerCost: parseDecimal(workflowLedger?.totalLedgerCost),
        },
        byTrigger: workflowByTriggerRows.map((row) => ({
          trigger: row.trigger,
          executionCount: row.executionCount,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
        byWorkflow: workflowByWorkflowRows.map((row) => ({
          workflowId: row.workflowId,
          workflowName: row.workflowName,
          executionCount: row.executionCount,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
      },
      copilot: {
        chats: {
          total: chatSummary?.total ?? 0,
          withLedgerCost: chatSummary?.withLedgerCost ?? 0,
        },
        runs: {
          total: runSummary?.total ?? 0,
        },
        byChatType: copilotByTypeRows.map((row) => ({
          chatType: row.chatType,
          chatCount: row.chatCount,
          runCount: row.runCount,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
        byModel: copilotByModelRows.map((row) => ({
          model: row.model,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
      },
      byUser: byUserRows.map((row) => ({
        userId: row.userId,
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        count: row.count,
      })),
      byModel: byModelRows.map((row) => ({
        model: row.model,
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        count: row.count,
      })),
      byProvider: byProviderRows
        .filter((row): row is typeof row & { provider: string } => row.provider !== null)
        .map((row) => ({
          provider: row.provider,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
      byTool: byToolRows
        .filter((row): row is typeof row & { toolId: string } => row.toolId !== null)
        .map((row) => ({
          toolId: row.toolId,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        })),
    }
  } catch (error) {
    logger.error('Failed to compute workspace usage analytics', {
      error: toError(error).message,
      workspaceId,
      options,
    })
    throw error
  }
}

export function parseWorkspaceUsageSources(
  sourcesParam: string | undefined
): UsageLogSource[] | undefined {
  if (!sourcesParam) return undefined
  const values = sourcesParam
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as UsageLogSource[]
  return values.length > 0 ? values : undefined
}
