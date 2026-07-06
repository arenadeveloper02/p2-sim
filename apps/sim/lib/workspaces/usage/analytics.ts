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
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  usageActorTypeSchema,
  usageLogSourceSchema,
  type WorkspaceUsageAnalytics,
} from '@/lib/api/contracts/workspace-usage'
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

const EMPTY_USAGE_METRICS = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
} as const

export interface WorkspaceUsageAnalyticsOptions {
  workspaceId: string
  startTime?: string
  endTime?: string
  period?: '1d' | '7d' | '30d' | '90d'
  sources?: UsageLogSource[]
  allTime?: boolean
  rootExecutionId?: string
}

interface ResolvedPeriod {
  start: Date
  end: Date
}

function ensurePeriodDate(value: unknown): Date {
  const date = coerceToDate(value)
  if (!date) {
    throw new Error('Invalid time range')
  }
  return date
}

/** Coalesced ledger clock: occurred_at when present, else created_at. */
function ledgerOccurredAt() {
  return sql`coalesce(${usageLog.occurredAt}, ${usageLog.createdAt})`
}

/**
 * Period bounds for the coalesced ledger clock.
 * Compare against ISO strings — raw `Date` in `sql` templates is not encoded like `gte`/`lte` params.
 */
function ledgerPeriodBounds(period: ResolvedPeriod): [SQL, SQL] {
  const startIso = ensurePeriodDate(period.start).toISOString()
  const endIso = ensurePeriodDate(period.end).toISOString()
  const occurredAt = ledgerOccurredAt()
  return [
    sql`${occurredAt} >= ${startIso}::timestamptz`,
    sql`${occurredAt} <= ${endIso}::timestamptz`,
  ]
}

/** Normalizes postgres/drizzle timestamp values (Date or ISO string) for range math. */
function coerceToDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function parseDecimal(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseIntMetric(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(Math.trunc(parsed), Number.MAX_SAFE_INTEGER))
}

const NUMERIC_STRING_PATTERN = '^-?[0-9]+(\\.[0-9]+)?$'

/** Legacy metadata may store non-numeric token strings; a bare `::numeric` cast aborts the whole aggregate. */
function safeMetadataTokenCount(key: 'inputTokens' | 'outputTokens') {
  const tokenValue = sql`${usageLog.metadata}->>${key}`
  return sql`case when ${tokenValue} ~ ${NUMERIC_STRING_PATTERN} then (${tokenValue})::numeric else 0 end`
}

function safeQuantityTokenCount() {
  const quantityText = sql`nullif(trim(${usageLog.quantity}::text), '')`
  return sql`case when ${quantityText} ~ ${NUMERIC_STRING_PATTERN} then (${quantityText})::numeric else 0 end`
}

function ledgerCostSelect() {
  return {
    billableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
    rawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
    count: sql<number>`count(*)::int`,
  }
}

function usageMetricsSelect() {
  const inputTokens = safeMetadataTokenCount('inputTokens')
  const outputTokens = safeMetadataTokenCount('outputTokens')
  const quantityTokens = safeQuantityTokenCount()

  return {
    inputTokens: sql<number>`coalesce(sum(
      case when ${usageLog.category} = 'model'
        then ${inputTokens}
        else 0
      end
    ), 0)::bigint`,
    outputTokens: sql<number>`coalesce(sum(
      case when ${usageLog.category} = 'model'
        then ${outputTokens}
        else 0
      end
    ), 0)::bigint`,
    totalTokens: sql<number>`coalesce(sum(
      case
        when ${usageLog.category} = 'model' then ${inputTokens} + ${outputTokens}
        when ${usageLog.unit} = 'tokens' then ${quantityTokens}
        else 0
      end
    ), 0)::bigint`,
    invocationCount: sql<number>`count(*)::int`,
  }
}

function mapUsageMetrics(row: {
  inputTokens?: number | string | null
  outputTokens?: number | string | null
  totalTokens?: number | string | null
  invocationCount?: number | string | null
}) {
  return {
    inputTokens: parseIntMetric(row.inputTokens),
    outputTokens: parseIntMetric(row.outputTokens),
    totalTokens: parseIntMetric(row.totalTokens),
    invocationCount: parseIntMetric(row.invocationCount),
  }
}

function buildLedgerConditions(
  workspaceId: string,
  period: ResolvedPeriod,
  sources?: UsageLogSource[]
): SQL[] {
  const conditions: SQL[] = [
    eq(usageLog.workspaceId, workspaceId),
    ...ledgerPeriodBounds(period),
  ]
  if (sources && sources.length > 0) {
    conditions.push(inArray(usageLog.source, sources))
  }
  return conditions
}

function buildLedgerJoinConditions(
  workspaceId: string,
  period: ResolvedPeriod
): SQL[] {
  return [eq(usageLog.workspaceId, workspaceId), ...ledgerPeriodBounds(period)]
}

function buildExecutionConditions(workspaceId: string, period: ResolvedPeriod): SQL[] {
  const start = ensurePeriodDate(period.start)
  const end = ensurePeriodDate(period.end)
  return [
    eq(workflowExecutionLogs.workspaceId, workspaceId),
    gte(workflowExecutionLogs.startedAt, start),
    lte(workflowExecutionLogs.startedAt, end),
  ]
}

function periodRange<T extends Parameters<typeof gte>[0]>(column: T, period: ResolvedPeriod): [SQL, SQL] {
  const start = ensurePeriodDate(period.start)
  const end = ensurePeriodDate(period.end)
  return [gte(column, start), lte(column, end)]
}

async function resolvePeriod(
  workspaceId: string,
  options: WorkspaceUsageAnalyticsOptions
): Promise<ResolvedPeriod> {
  if (options.allTime) {
    const [usageBounds, executionBounds, chatBounds, runBounds] = await Promise.all([
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${ledgerOccurredAt()})`,
          maxAt: sql<Date | null>`max(${ledgerOccurredAt()})`,
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
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${copilotChats.createdAt})`,
          maxAt: sql<Date | null>`max(${copilotChats.createdAt})`,
        })
        .from(copilotChats)
        .where(eq(copilotChats.workspaceId, workspaceId)),
      dbReplica
        .select({
          minAt: sql<Date | null>`min(${copilotRuns.startedAt})`,
          maxAt: sql<Date | null>`max(${copilotRuns.startedAt})`,
        })
        .from(copilotRuns)
        .where(eq(copilotRuns.workspaceId, workspaceId)),
    ])

    const candidates = [
      usageBounds[0]?.minAt,
      usageBounds[0]?.maxAt,
      executionBounds[0]?.minAt,
      executionBounds[0]?.maxAt,
      chatBounds[0]?.minAt,
      chatBounds[0]?.maxAt,
      runBounds[0]?.minAt,
      runBounds[0]?.maxAt,
    ]
      .map(coerceToDate)
      .filter((value): value is Date => value !== null)

    if (candidates.length === 0) {
      const now = new Date()
      return { start: now, end: now }
    }

    const start = ensurePeriodDate(new Date(Math.min(...candidates.map((date) => date.getTime()))))
    const end = ensurePeriodDate(
      new Date(Math.max(...candidates.map((date) => date.getTime()), Date.now()))
    )
    return { start, end }
  }

  const end = ensurePeriodDate(options.endTime ? new Date(options.endTime) : new Date())
  const start = ensurePeriodDate(
    options.startTime
      ? new Date(options.startTime)
      : new Date(end.getTime() - PERIOD_MS[options.period ?? '30d'])
  )

  return { start, end }
}

function timeBucketExpr(useHourly: boolean) {
  const occurredAt = ledgerOccurredAt()
  return useHourly
    ? sql`date_trunc('hour', ${occurredAt})`
    : sql`date_trunc('day', ${occurredAt})`
}

function executionBucketExpr(useHourly: boolean) {
  return useHourly
    ? sql`date_trunc('hour', ${workflowExecutionLogs.startedAt})`
    : sql`date_trunc('day', ${workflowExecutionLogs.startedAt})`
}

function parseActorType(value: string | null | undefined) {
  if (!value) return null
  const parsed = usageActorTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Aggregates workspace usage across the billing ledger, workflow execution logs,
 * and copilot chat/run tables for admin analytics dashboards.
 */
export async function getWorkspaceUsageAnalytics(
  options: WorkspaceUsageAnalyticsOptions
): Promise<WorkspaceUsageAnalytics> {
  const { workspaceId, sources, rootExecutionId } = options

  try {
    const period = await resolvePeriod(workspaceId, options)

    if (Number.isNaN(period.start.getTime()) || Number.isNaN(period.end.getTime())) {
      throw new Error('Invalid time range')
    }

    if (period.start > period.end) {
      throw new Error('Invalid time range')
    }

    const ledgerConditions = buildLedgerConditions(workspaceId, period, sources)
    const ledgerJoinConditions = buildLedgerJoinConditions(workspaceId, period)
    const executionConditions = buildExecutionConditions(workspaceId, period)
    const useHourlyBuckets = !options.allTime && (options.period ?? '30d') === '1d'
    const bucketExpr = timeBucketExpr(useHourlyBuckets)
    const executionBucket = executionBucketExpr(useHourlyBuckets)

    const [
      bySourceRows,
      summaryUsageRows,
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
      byActorRows,
      byModelRows,
      byProviderRows,
      byToolRows,
      byVendorRows,
      timeSeriesLedgerRows,
      timeSeriesExecutionRows,
      lineageRootRows,
      lineageDrillDownRows,
      lineageDrillDownTotals,
      triggeredWorkflowRows,
      dataHealthLedgerRows,
      dataHealthExecutionRows,
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
        .where(and(...executionConditions)),

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
            ...ledgerJoinConditions
          )
        )
        .where(and(...executionConditions))
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
            ...ledgerJoinConditions
          )
        )
        .where(and(...executionConditions))
        .groupBy(workflowExecutionLogs.workflowId, workflow.name),

      dbReplica
        .select({
          total: sql<number>`count(distinct ${copilotChats.id})::int`,
          withLedgerCost: sql<number>`count(distinct case when ${usageLog.id} is not null then ${copilotChats.id} end)::int`,
        })
        .from(copilotChats)
        .leftJoin(
          usageLog,
          and(eq(usageLog.chatId, copilotChats.id), ...ledgerJoinConditions)
        )
        .where(
          and(
            eq(copilotChats.workspaceId, workspaceId),
            or(
              and(...periodRange(copilotChats.createdAt, period)),
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
            ...periodRange(copilotRuns.startedAt, period)
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
            ...periodRange(copilotRuns.startedAt, period)
          )
        )
        .leftJoin(
          usageLog,
          and(eq(usageLog.chatId, copilotChats.id), ...ledgerJoinConditions)
        )
        .where(
          and(
            eq(copilotChats.workspaceId, workspaceId),
            or(
              and(...periodRange(copilotChats.createdAt, period)),
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
            ...ledgerJoinConditions,
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
          actorUserId: usageLog.actorUserId,
          actorType: usageLog.actorType,
          ...ledgerCostSelect(),
          ...usageMetricsSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions))
        .groupBy(usageLog.actorUserId, usageLog.actorType),

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

      dbReplica
        .select({
          vendor: sql<string>`coalesce(${usageLog.vendor}, ${usageLog.description})`,
          ...ledgerCostSelect(),
        })
        .from(usageLog)
        .where(and(...ledgerConditions, eq(usageLog.category, 'external')))
        .groupBy(sql`coalesce(${usageLog.vendor}, ${usageLog.description})`),

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
          rootExecutionId: workflowExecutionLogs.rootExecutionId,
          executionCount: sql<number>`count(distinct ${workflowExecutionLogs.executionId})::int`,
          inclusiveBillableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
          inclusiveRawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.executionId, workflowExecutionLogs.executionId),
            eq(usageLog.source, WORKFLOW_SOURCE),
            ...ledgerJoinConditions
          )
        )
        .where(and(...executionConditions, isNotNull(workflowExecutionLogs.rootExecutionId)))
        .groupBy(workflowExecutionLogs.rootExecutionId),

      rootExecutionId
        ? dbReplica
            .select({
              executionId: workflowExecutionLogs.executionId,
              parentExecutionId: workflowExecutionLogs.parentExecutionId,
              workflowId: workflowExecutionLogs.workflowId,
              workflowName: workflow.name,
              startedAt: workflowExecutionLogs.startedAt,
              trigger: workflowExecutionLogs.trigger,
              actorUserId: workflowExecutionLogs.actorUserId,
              actorType: workflowExecutionLogs.actorType,
              billableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
              rawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
            })
            .from(workflowExecutionLogs)
            .leftJoin(workflow, eq(workflow.id, workflowExecutionLogs.workflowId))
            .leftJoin(
              usageLog,
              and(
                eq(usageLog.executionId, workflowExecutionLogs.executionId),
                eq(usageLog.source, WORKFLOW_SOURCE),
                ...ledgerJoinConditions
              )
            )
            .where(
              and(
                eq(workflowExecutionLogs.workspaceId, workspaceId),
                or(
                  eq(workflowExecutionLogs.rootExecutionId, rootExecutionId),
                  eq(workflowExecutionLogs.executionId, rootExecutionId)
                )
              )
            )
            .groupBy(
              workflowExecutionLogs.executionId,
              workflowExecutionLogs.parentExecutionId,
              workflowExecutionLogs.workflowId,
              workflow.name,
              workflowExecutionLogs.startedAt,
              workflowExecutionLogs.trigger,
              workflowExecutionLogs.actorUserId,
              workflowExecutionLogs.actorType
            )
        : Promise.resolve([]),

      rootExecutionId
        ? dbReplica
            .select({
              inclusiveBillableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
              inclusiveRawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
            })
            .from(usageLog)
            .where(
              and(
                eq(usageLog.workspaceId, workspaceId),
                eq(usageLog.source, WORKFLOW_SOURCE),
                or(
                  eq(usageLog.rootExecutionId, rootExecutionId),
                  eq(usageLog.executionId, rootExecutionId)
                ),
                ...ledgerJoinConditions
              )
            )
        : Promise.resolve([]),

      dbReplica
        .select({
          triggeringChatId: workflowExecutionLogs.triggeringChatId,
          executionCount: sql<number>`count(distinct ${workflowExecutionLogs.executionId})::int`,
          billableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
          rawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          usageLog,
          and(
            eq(usageLog.executionId, workflowExecutionLogs.executionId),
            eq(usageLog.source, WORKFLOW_SOURCE),
            ...ledgerJoinConditions
          )
        )
        .where(
          and(...executionConditions, isNotNull(workflowExecutionLogs.triggeringChatId))
        )
        .groupBy(workflowExecutionLogs.triggeringChatId),

      dbReplica
        .select({
          totalRows: sql<number>`count(*)::int`,
          nullWorkspaceRows: sql<number>`count(case when ${usageLog.workspaceId} is null then 1 end)::int`,
          missingActorRows: sql<number>`count(case when ${usageLog.actorUserId} is null or ${usageLog.actorType} is null then 1 end)::int`,
        })
        .from(usageLog)
        .where(
          and(
            or(eq(usageLog.workspaceId, workspaceId), isNull(usageLog.workspaceId)),
            ...ledgerPeriodBounds(period)
          )
        ),

      dbReplica
        .select({
          executionsWithCostNoLedger: sql<number>`count(case when coalesce(${workflowExecutionLogs.costTotal}::numeric, 0) > 0 and coalesce(ledger.ledger_sum, 0) = 0 then 1 end)::int`,
          costTotalDriftCount: sql<number>`count(case when abs(coalesce(${workflowExecutionLogs.costTotal}::numeric, 0) - coalesce(ledger.ledger_sum, 0)) > 0.000001 then 1 end)::int`,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          sql`(
            select
              ${usageLog.executionId} as execution_id,
              sum(${usageLog.cost}::numeric) as ledger_sum
            from ${usageLog}
            where ${usageLog.workspaceId} = ${workspaceId}
              and ${usageLog.source} = ${WORKFLOW_SOURCE}
              and ${usageLog.executionId} is not null
            group by ${usageLog.executionId}
          ) ledger`,
          sql`ledger.execution_id = ${workflowExecutionLogs.executionId}`
        )
        .where(
          and(
            ...executionConditions,
            inArray(workflowExecutionLogs.status, ['completed', 'failed', 'cancelled'])
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

    const attribution = attributionRows[0]
    const workflowSummary = workflowExecutionSummary[0]
    const workflowLedger = workflowLedgerSummary[0]
    const chatSummary = copilotChatSummary[0]
    const runSummary = copilotRunSummary[0]

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

    const triggeredWorkflowTotal = triggeredWorkflowRows.reduce(
      (acc, row) => ({
        executionCount: acc.executionCount + row.executionCount,
        billableCost: acc.billableCost + parseDecimal(row.billableCost),
        rawCost: acc.rawCost + parseDecimal(row.rawCost),
      }),
      { executionCount: 0, billableCost: 0, rawCost: 0 }
    )

    const dataHealthLedger = dataHealthLedgerRows[0]
    const dataHealthExecution = dataHealthExecutionRows[0]
    const totalLedgerRows = dataHealthLedger?.totalRows ?? 0
    const missingActorRows = dataHealthLedger?.missingActorRows ?? 0
    const nullWorkspaceRows = dataHealthLedger?.nullWorkspaceRows ?? 0
    const executionsWithCostNoLedger = dataHealthExecution?.executionsWithCostNoLedger ?? 0
    const costTotalDriftCount = dataHealthExecution?.costTotalDriftCount ?? 0

    const warnings: WorkspaceUsageAnalytics['dataHealth']['warnings'] = []

    if (nullWorkspaceRows > 0) {
      warnings.push({
        id: 'null-workspace-id',
        severity: 'error',
        label: 'Ledger rows missing workspace',
        count: nullWorkspaceRows,
        detail: 'usage_log.workspace_id is null for rows in this period.',
      })
    }

    if (executionsWithCostNoLedger > 0) {
      warnings.push({
        id: 'executions-cost-no-ledger',
        severity: 'warning',
        label: 'Executions with cost but no ledger',
        count: executionsWithCostNoLedger,
        detail: 'workflow_execution_logs.cost_total > 0 with no matching workflow ledger rows.',
      })
    }

    if (costTotalDriftCount > 0) {
      warnings.push({
        id: 'cost-total-drift',
        severity: 'warning',
        label: 'Execution cost vs ledger drift',
        count: costTotalDriftCount,
        detail: 'cost_total does not match the sum of workflow ledger rows.',
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

    const limitedAttribution =
      totalLedgerRows > 0 && missingActorRows / totalLedgerRows > 0.1

    const drillDownTotals = lineageDrillDownTotals[0]
    const drillDown =
      rootExecutionId && lineageDrillDownRows.length > 0
        ? {
            rootExecutionId,
            inclusiveBillableCost: parseDecimal(drillDownTotals?.inclusiveBillableCost),
            inclusiveRawCost: parseDecimal(drillDownTotals?.inclusiveRawCost),
            executions: lineageDrillDownRows
              .map((row) => ({
                executionId: row.executionId,
                parentExecutionId: row.parentExecutionId,
                workflowId: row.workflowId,
                workflowName: row.workflowName,
                startedAt: coerceToDate(row.startedAt)?.toISOString() ?? String(row.startedAt),
                trigger: row.trigger ?? 'unknown',
                billableCost: parseDecimal(row.billableCost),
                rawCost: parseDecimal(row.rawCost),
                actorUserId: row.actorUserId,
                actorType: parseActorType(row.actorType),
              }))
              .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
          }
        : undefined

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
        usage: summaryUsage,
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
        triggeredWorkflows: {
          executionCount: triggeredWorkflowTotal.executionCount,
          billableCost: triggeredWorkflowTotal.billableCost,
          rawCost: triggeredWorkflowTotal.rawCost,
          byChat: triggeredWorkflowRows
            .filter(
              (row): row is typeof row & { triggeringChatId: string } =>
                row.triggeringChatId !== null
            )
            .map((row) => ({
              triggeringChatId: row.triggeringChatId,
              executionCount: row.executionCount,
              billableCost: parseDecimal(row.billableCost),
              rawCost: parseDecimal(row.rawCost),
            })),
        },
      },
      byUser: byUserRows.map((row) => ({
        userId: row.userId,
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        count: row.count,
      })),
      byActor: byActorRows.map((row) => ({
        actorUserId: row.actorUserId,
        actorType: parseActorType(row.actorType),
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        count: row.count,
        usage: mapUsageMetrics(row),
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
      byVendor: byVendorRows.map((row) => ({
        vendor: row.vendor,
        billableCost: parseDecimal(row.billableCost),
        rawCost: parseDecimal(row.rawCost),
        count: row.count,
      })),
      timeSeries,
      lineage: {
        roots: lineageRootRows
          .filter(
            (row): row is typeof row & { rootExecutionId: string } =>
              row.rootExecutionId !== null
          )
          .map((row) => ({
            rootExecutionId: row.rootExecutionId,
            executionCount: row.executionCount,
            inclusiveBillableCost: parseDecimal(row.inclusiveBillableCost),
            inclusiveRawCost: parseDecimal(row.inclusiveRawCost),
          }))
          .sort((a, b) => b.inclusiveBillableCost - a.inclusiveBillableCost)
          .slice(0, 25),
        drillDown,
      },
      dataHealth: {
        limitedAttribution,
        warnings,
      },
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

export class InvalidUsageSourcesError extends Error {
  constructor(public readonly invalidSources: string[]) {
    super(`Invalid usage sources: ${invalidSources.join(', ')}`)
    this.name = 'InvalidUsageSourcesError'
  }
}

/**
 * Parses and validates comma-separated usage_log source filters against the
 * contract enum. Throws when any token is not a recognized source.
 */
export function parseWorkspaceUsageSources(
  sourcesParam: string | undefined
): UsageLogSource[] | undefined {
  if (!sourcesParam) return undefined

  const values = sourcesParam
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (values.length === 0) return undefined

  const invalid = values.filter((value) => !usageLogSourceSchema.safeParse(value).success)
  if (invalid.length > 0) {
    throw new InvalidUsageSourcesError(invalid)
  }

  return values as UsageLogSource[]
}
