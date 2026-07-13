import { dbReplica } from '@sim/db'
import {
  copilotChats,
  copilotRuns,
  usageLog,
  workspace,
  workflowExecutionLogs,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { OrganizationUsageAnalytics } from '@/lib/api/contracts/organization-usage'
import type { UsageLogSource } from '@/lib/billing/core/usage-log'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import {
  buildExecutionConditions,
  buildExpensiveCopilotChatsQuery,
  buildExpensiveWorkflowsQuery,
  buildLedgerConditions,
  buildLedgerJoinConditions,
  coerceToDate,
  EMPTY_USAGE_METRICS,
  executionBucketExpr,
  ledgerCostSelect,
  ledgerOccurredAt,
  ledgerPeriodBounds,
  mapExpensiveCopilotChatRows,
  mapExpensiveWorkflowRows,
  mapUsageMetrics,
  parseActorType,
  parseDecimal,
  periodRange,
  type ResolvedPeriod,
  resolveExplicitPeriod,
  resolvePeriodFromDateCandidates,
  timeBucketExpr,
  usageMetricsSelect,
} from '@/lib/workspaces/usage/ledger-helpers'

const logger = createLogger('OrganizationUsageAnalytics')

export interface OrganizationUsageAnalyticsOptions {
  organizationId: string
  startTime?: string
  endTime?: string
  period?: '1d' | '7d' | '30d' | '90d'
  sources?: UsageLogSource[]
  allTime?: boolean
}

interface OrgWorkspaceRef {
  id: string
  name: string
}

async function listActiveOrganizationWorkspaces(
  organizationId: string
): Promise<OrgWorkspaceRef[]> {
  return dbReplica
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(and(eq(workspace.organizationId, organizationId), isNull(workspace.archivedAt)))
    .orderBy(asc(workspace.name))
}

async function resolveOrganizationPeriod(
  workspaceIds: string[],
  options: OrganizationUsageAnalyticsOptions
): Promise<ResolvedPeriod> {
  if (options.allTime) {
    const [usageBounds, executionBounds, chatBounds, runBounds] = await Promise.all([
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${ledgerOccurredAt()})`,
          maxAt: sql<Date | null>`max(${ledgerOccurredAt()})`,
        })
        .from(usageLog)
        .where(inArray(usageLog.workspaceId, workspaceIds)),
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${workflowExecutionLogs.startedAt})`,
          maxAt: sql<Date | null>`max(${workflowExecutionLogs.startedAt})`,
        })
        .from(workflowExecutionLogs)
        .where(inArray(workflowExecutionLogs.workspaceId, workspaceIds)),
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${copilotChats.createdAt})`,
          maxAt: sql<Date | null>`max(${copilotChats.createdAt})`,
        })
        .from(copilotChats)
        .where(inArray(copilotChats.workspaceId, workspaceIds)),
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${copilotRuns.startedAt})`,
          maxAt: sql<Date | null>`max(${copilotRuns.startedAt})`,
        })
        .from(copilotRuns)
        .where(inArray(copilotRuns.workspaceId, workspaceIds)),
    ])

    return resolvePeriodFromDateCandidates([
      usageBounds[0]?.minAt,
      usageBounds[0]?.maxAt,
      executionBounds[0]?.minAt,
      executionBounds[0]?.maxAt,
      chatBounds[0]?.minAt,
      chatBounds[0]?.maxAt,
      runBounds[0]?.minAt,
      runBounds[0]?.maxAt,
    ])
  }

  return resolveExplicitPeriod(options)
}

function emptyOrganizationAnalytics(
  workspaces: OrgWorkspaceRef[],
  period: ResolvedPeriod
): OrganizationUsageAnalytics {
  return {
    period: {
      startTime: period.start.toISOString(),
      endTime: period.end.toISOString(),
    },
    workspaces,
    summary: {
      billableCost: 0,
      rawCost: 0,
      billableCostCredits: 0,
      ledgerEntryCount: 0,
      executionCount: 0,
      chatCount: 0,
      runCount: 0,
      usage: { ...EMPTY_USAGE_METRICS },
    },
    byWorkspace: workspaces.map((ws) => ({
      workspaceId: ws.id,
      workspaceName: ws.name,
      billableCost: 0,
      rawCost: 0,
      count: 0,
      usage: { ...EMPTY_USAGE_METRICS },
    })),
    workflow: { byWorkflow: [] },
    copilot: { byChat: [] },
    byActor: [],
    byUser: [],
    bySource: [],
    timeSeries: [],
    dataHealth: { limitedAttribution: false, warnings: [] },
  }
}

/**
 * Aggregates organization usage across all active org workspaces for admin
 * cost-finding dashboards (totals, by-workspace, expensive workflows/chats/actors).
 */
export async function getOrganizationUsageAnalytics(
  options: OrganizationUsageAnalyticsOptions
): Promise<OrganizationUsageAnalytics> {
  const { organizationId, sources } = options

  try {
    const workspaces = await listActiveOrganizationWorkspaces(organizationId)
    const workspaceIds = workspaces.map((ws) => ws.id)
    const workspaceNameById = new Map(workspaces.map((ws) => [ws.id, ws.name]))

    if (workspaceIds.length === 0) {
      return emptyOrganizationAnalytics(workspaces, resolveExplicitPeriod(options))
    }

    const period = await resolveOrganizationPeriod(workspaceIds, options)

    if (Number.isNaN(period.start.getTime()) || Number.isNaN(period.end.getTime())) {
      throw new Error('Invalid time range')
    }

    if (period.start > period.end) {
      throw new Error('Invalid time range')
    }

    const ledgerWorkspaceCondition = inArray(usageLog.workspaceId, workspaceIds)
    const ledgerConditions = buildLedgerConditions(ledgerWorkspaceCondition, period, sources)
    const ledgerJoinConditions = buildLedgerJoinConditions(ledgerWorkspaceCondition, period)
    const executionWorkspaceCondition = inArray(workflowExecutionLogs.workspaceId, workspaceIds)
    const executionConditions = buildExecutionConditions(executionWorkspaceCondition, period)
    const useHourlyBuckets = !options.allTime && (options.period ?? '30d') === '1d'
    const bucketExpr = timeBucketExpr(useHourlyBuckets)
    const executionBucket = executionBucketExpr(useHourlyBuckets)

    const [
      bySourceRows,
      summaryUsageRows,
      byWorkspaceRows,
      expensiveWorkflowRows,
      expensiveChatRows,
      byUserRows,
      byActorRows,
      timeSeriesLedgerRows,
      timeSeriesExecutionRows,
      executionCountRows,
      chatCountRows,
      runCountRows,
      dataHealthLedgerRows,
    ] = await Promise.all([
      dbReplica
        .select({
          source: usageLog.source,
          ...ledgerCostSelect(),
          ...usageMetricsSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(usageLog.source),

      dbReplica
        .select(usageMetricsSelect())
        .from(usageLog)
        .where(and(...ledgerConditions)),

      dbReplica
        .select({
          workspaceId: usageLog.workspaceId,
          ...ledgerCostSelect(),
          ...usageMetricsSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(usageLog.workspaceId),

      buildExpensiveWorkflowsQuery({
        executionScope: executionWorkspaceCondition,
        ledgerJoinConditions,
        period,
      }),

      buildExpensiveCopilotChatsQuery({
        chatScope: inArray(copilotChats.workspaceId, workspaceIds),
        ledgerJoinConditions,
        period,
      }),

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
          actorUserId: sql<string | null>`coalesce(
            ${usageLog.actorUserId},
            ${copilotChats.userId},
            ${usageLog.userId}
          )`,
          actorType: sql<string | null>`coalesce(
            ${usageLog.actorType},
            case
              when coalesce(${usageLog.actorUserId}, ${copilotChats.userId}, ${usageLog.userId}) is not null
                then 'user'
              else null
            end
          )`,
          ...ledgerCostSelect(),
          ...usageMetricsSelect(),
        })
        .from(usageLog)
        .leftJoin(copilotChats, eq(copilotChats.id, usageLog.chatId))
        .where(and(...ledgerConditions))
        .groupBy(
          sql`coalesce(${usageLog.actorUserId}, ${copilotChats.userId}, ${usageLog.userId})`,
          sql`coalesce(
            ${usageLog.actorType},
            case
              when coalesce(${usageLog.actorUserId}, ${copilotChats.userId}, ${usageLog.userId}) is not null
                then 'user'
              else null
            end
          )`
        ),

      dbReplica
        .select({
          bucketStart: bucketExpr,
          ...ledgerCostSelect(),
          ...usageMetricsSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(bucketExpr),

      dbReplica
        .select({
          bucketStart: executionBucket,
          executionCount: sql<number>`count(*)::int`,
        })
        .from(workflowExecutionLogs)
        .where(and(...executionConditions))
        .groupBy(executionBucket),

      dbReplica
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(workflowExecutionLogs)
        .where(and(...executionConditions)),

      dbReplica
        .select({
          total: sql<number>`count(distinct ${copilotChats.id})::int`,
        })
        .from(copilotChats)
        .leftJoin(usageLog, and(eq(usageLog.chatId, copilotChats.id), ...ledgerJoinConditions))
        .where(
          and(
            inArray(copilotChats.workspaceId, workspaceIds),
            or(and(...periodRange(copilotChats.createdAt, period)), isNotNull(usageLog.id))
          )
        ),

      dbReplica
        .select({
          total: sql<number>`count(distinct ${copilotRuns.id})::int`,
        })
        .from(copilotRuns)
        .where(
          and(inArray(copilotRuns.workspaceId, workspaceIds), ...periodRange(copilotRuns.startedAt, period))
        ),

      dbReplica
        .select({
          totalRows: sql<number>`count(*)::int`,
          nullWorkspaceRows: sql<number>`count(case when ${usageLog.workspaceId} is null then 1 end)::int`,
          missingActorRows: sql<number>`count(case when ${usageLog.actorUserId} is null or ${usageLog.actorType} is null then 1 end)::int`,
        })
        .from(usageLog)
        .where(
          and(
            or(inArray(usageLog.workspaceId, workspaceIds), isNull(usageLog.workspaceId)),
            ...ledgerPeriodBounds(period)
          )
        ),
    ])

    const bySource = bySourceRows.map((row) => ({
      source: row.source,
      billableCost: parseDecimal(row.billableCost),
      rawCost: parseDecimal(row.rawCost),
      count: row.count,
      usage: mapUsageMetrics(row),
    }))

    const totalBillableCost = bySource.reduce((sum, row) => sum + row.billableCost, 0)
    const totalRawCost = bySource.reduce((sum, row) => sum + row.rawCost, 0)
    const ledgerEntryCount = bySource.reduce((sum, row) => sum + row.count, 0)
    const summaryUsage = mapUsageMetrics(summaryUsageRows[0] ?? {})

    const costByWorkspaceId = new Map(
      byWorkspaceRows
        .filter((row): row is typeof row & { workspaceId: string } => row.workspaceId !== null)
        .map((row) => [
          row.workspaceId,
          {
            billableCost: parseDecimal(row.billableCost),
            rawCost: parseDecimal(row.rawCost),
            count: row.count,
            usage: mapUsageMetrics(row),
          },
        ])
    )

    const byWorkspace = workspaces
      .map((ws) => {
        const costs = costByWorkspaceId.get(ws.id)
        return {
          workspaceId: ws.id,
          workspaceName: ws.name,
          billableCost: costs?.billableCost ?? 0,
          rawCost: costs?.rawCost ?? 0,
          count: costs?.count ?? 0,
          usage: costs?.usage ?? { ...EMPTY_USAGE_METRICS },
        }
      })
      .sort((a, b) => b.billableCost - a.billableCost)

    const executionCountByBucket = new Map(
      timeSeriesExecutionRows.map((row) => [
        coerceToDate(row.bucketStart)?.toISOString() ?? String(row.bucketStart),
        row.executionCount,
      ])
    )

    const timeSeries = timeSeriesLedgerRows.map((row) => {
      const bucketStart = coerceToDate(row.bucketStart)?.toISOString() ?? String(row.bucketStart)
      return {
        bucketStart,
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        executionCount: executionCountByBucket.get(bucketStart) ?? 0,
        usage: mapUsageMetrics(row),
      }
    })

    for (const row of timeSeriesExecutionRows) {
      const bucketStart = coerceToDate(row.bucketStart)?.toISOString() ?? String(row.bucketStart)
      if (!timeSeries.some((bucket) => bucket.bucketStart === bucketStart)) {
        timeSeries.push({
          bucketStart,
          billableCost: 0,
          rawCost: 0,
          executionCount: row.executionCount,
          usage: { ...EMPTY_USAGE_METRICS },
        })
      }
    }

    timeSeries.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))

    const dataHealthLedger = dataHealthLedgerRows[0]
    const totalLedgerRows = dataHealthLedger?.totalRows ?? 0
    const missingActorRows = dataHealthLedger?.missingActorRows ?? 0
    const nullWorkspaceRows = dataHealthLedger?.nullWorkspaceRows ?? 0

    const warnings: OrganizationUsageAnalytics['dataHealth']['warnings'] = []

    if (nullWorkspaceRows > 0) {
      warnings.push({
        id: 'null-workspace-id',
        severity: 'error',
        label: 'Ledger rows missing workspace',
        count: nullWorkspaceRows,
        detail: 'usage_log.workspace_id is null for rows in this period.',
      })
    }

    if (missingActorRows > 0) {
      warnings.push({
        id: 'missing-actor-attribution',
        severity: 'warning',
        label: 'Rows missing actor attribution',
        count: missingActorRows,
        detail: 'actor_user_id or actor_type is null — common for pre-cutover data.',
      })
    }

    const limitedAttribution = totalLedgerRows > 0 && missingActorRows / totalLedgerRows > 0.1

    return {
      period: {
        startTime: period.start.toISOString(),
        endTime: period.end.toISOString(),
      },
      workspaces,
      summary: {
        billableCost: totalBillableCost,
        rawCost: totalRawCost,
        billableCostCredits: dollarsToCredits(totalBillableCost),
        ledgerEntryCount,
        executionCount: executionCountRows[0]?.total ?? 0,
        chatCount: chatCountRows[0]?.total ?? 0,
        runCount: runCountRows[0]?.total ?? 0,
        usage: summaryUsage,
      },
      byWorkspace,
      workflow: {
        byWorkflow: mapExpensiveWorkflowRows(expensiveWorkflowRows).map((row) => ({
          workspaceId: row.workspaceId,
          workspaceName:
            row.workspaceName ?? workspaceNameById.get(row.workspaceId) ?? row.workspaceId,
          workflowId: row.workflowId,
          workflowName: row.workflowName,
          executionCount: row.executionCount,
          billableCost: row.billableCost,
          rawCost: row.rawCost,
          count: row.count,
        })),
      },
      copilot: {
        byChat: mapExpensiveCopilotChatRows(expensiveChatRows).map((row) => ({
          workspaceId: row.workspaceId,
          workspaceName:
            row.workspaceName ?? workspaceNameById.get(row.workspaceId) ?? row.workspaceId,
          chatId: row.chatId,
          title: row.title,
          chatType: row.chatType,
          userId: row.userId,
          runCount: row.runCount,
          billableCost: row.billableCost,
          rawCost: row.rawCost,
          count: row.count,
        })),
      },
      byActor: byActorRows
        .map((row) => ({
          actorUserId: row.actorUserId,
          actorType: parseActorType(row.actorType),
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
          usage: mapUsageMetrics(row),
        }))
        .sort((a, b) => b.billableCost - a.billableCost),
      byUser: byUserRows
        .map((row) => ({
          userId: row.userId,
          billableCost: parseDecimal(row.billableCost),
          rawCost: parseDecimal(row.rawCost),
          count: row.count,
        }))
        .sort((a, b) => b.billableCost - a.billableCost),
      bySource,
      timeSeries,
      dataHealth: {
        limitedAttribution,
        warnings,
      },
    }
  } catch (error) {
    logger.error('Failed to compute organization usage analytics', {
      error: toError(error).message,
      organizationId,
      options,
    })
    throw error
  }
}
