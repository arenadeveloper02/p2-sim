import { dbReplica } from '@sim/db'
import {
  copilotChats,
  copilotRuns,
  usageLog,
  workspace,
  workflow,
  workflowExecutionLogs,
} from '@sim/db/schema'
import {
  and,
  eq,
  gte,
  inArray,
  lte,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  usageActorTypeSchema,
  usageChargeTypeSchema,
  type UsageChargeTypeValue,
} from '@/lib/api/contracts/workspace-usage'
import type { UsageLogSource } from '@/lib/billing/core/usage-log'
import { COPILOT_USAGE_SOURCES } from '@/lib/billing/core/usage-log'
import { parseDecimal, parseIntMetric, sortByBillableCostDesc } from '@/lib/workspaces/usage/ledger-utils'

export {
  averageBillableCostPerRun,
  parseDecimal,
  parseIntMetric,
  sortByAverageBillableCostPerRunDesc,
  sortByBillableCostDesc,
} from '@/lib/workspaces/usage/ledger-utils'

/** Cap for the most-expensive mothership/copilot chats table on usage dashboards. */
export const TOP_EXPENSIVE_COPILOT_CHATS = 25

/** Cap for most-expensive workflows on the org usage dashboard. */
export const TOP_EXPENSIVE_WORKFLOWS = 25

export const WORKFLOW_SOURCE: UsageLogSource = 'workflow'

export const PERIOD_MS: Record<'1d' | '7d' | '30d' | '90d', number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

export const EMPTY_USAGE_METRICS = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  invocationCount: 0,
} as const

export interface ResolvedPeriod {
  start: Date
  end: Date
}

export interface ExplicitPeriodOptions {
  startTime?: string
  endTime?: string
  period?: '1d' | '7d' | '30d' | '90d'
}

export interface UsageMetrics {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  invocationCount: number
}

/** Ranked mothership/copilot chat cost row shared by workspace and org analytics. */
export interface ExpensiveCopilotChatRow {
  workspaceId: string
  workspaceName: string | null
  chatId: string
  title: string | null
  chatType: 'mothership' | 'copilot'
  userId: string
  runCount: number
  billableCost: number
  rawCost: number
  count: number
}

export interface QueryExpensiveCopilotChatsOptions {
  /** Restricts chats (single workspace or org workspace set). */
  chatScope: SQL
  /** Ledger join filters (workspace scope + period bounds). */
  ledgerJoinConditions: SQL[]
  period: ResolvedPeriod
}

/** Ranked workflow cost row for org-wide most-expensive workflows. */
export interface ExpensiveWorkflowRow {
  workspaceId: string
  workspaceName: string | null
  workflowId: string | null
  workflowName: string | null
  executionCount: number
  billableCost: number
  rawCost: number
  count: number
}

export interface QueryExpensiveWorkflowsOptions {
  /** Restricts executions (single workspace or org workspace set). */
  executionScope: SQL
  /** Ledger join filters (workspace scope + period bounds). */
  ledgerJoinConditions: SQL[]
  period: ResolvedPeriod
}

export function ensurePeriodDate(value: unknown): Date {
  const date = coerceToDate(value)
  if (!date) {
    throw new Error('Invalid time range')
  }
  return date
}

/** Coalesced ledger clock: occurred_at when present, else created_at. */
export function ledgerOccurredAt() {
  return sql`coalesce(${usageLog.occurredAt}, ${usageLog.createdAt})`
}

/**
 * Period bounds for the coalesced ledger clock.
 * Compare against ISO strings — raw `Date` in `sql` templates is not encoded like `gte`/`lte` params.
 */
export function ledgerPeriodBounds(period: ResolvedPeriod): [SQL, SQL] {
  const startIso = ensurePeriodDate(period.start).toISOString()
  const endIso = ensurePeriodDate(period.end).toISOString()
  const occurredAt = ledgerOccurredAt()
  return [
    sql`${occurredAt} >= ${startIso}::timestamptz`,
    sql`${occurredAt} <= ${endIso}::timestamptz`,
  ]
}

/** Normalizes postgres/drizzle timestamp values (Date or ISO string) for range math. */
export function coerceToDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
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

export function ledgerCostSelect() {
  return {
    billableCost: sql<string>`coalesce(sum(${usageLog.cost}::numeric), 0)`,
    rawCost: sql<string>`coalesce(sum(coalesce(${usageLog.rawCost}, ${usageLog.cost})::numeric), 0)`,
    count: sql<number>`count(*)::int`,
  }
}

/**
 * Maps ledger category/description into dashboard charge buckets:
 * base run fee, provider/model spend, hosted tools, Cost-block pass-through,
 * and mothership/copilot pricing (kept out of the workflow provider bucket).
 */
export function chargeTypeExpr() {
  return sql<string>`case
    when ${usageLog.source} in ('copilot', 'workspace-chat', 'mcp_copilot', 'mothership_block')
      then 'mothership'
    when ${usageLog.category} = 'fixed' and ${usageLog.description} = 'execution_fee' then 'base_run'
    when ${usageLog.category} = 'model' then 'provider'
    when ${usageLog.category} = 'tool' then 'tool'
    when ${usageLog.category} = 'external' then 'cost_block'
    else 'other'
  end`
}

export function parseChargeType(value: string | null | undefined): UsageChargeTypeValue {
  const parsed = usageChargeTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'other'
}

export function usageMetricsSelect() {
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

export function mapUsageMetrics(row: {
  inputTokens?: number | string | null
  outputTokens?: number | string | null
  totalTokens?: number | string | null
  invocationCount?: number | string | null
}): UsageMetrics {
  return {
    inputTokens: parseIntMetric(row.inputTokens),
    outputTokens: parseIntMetric(row.outputTokens),
    totalTokens: parseIntMetric(row.totalTokens),
    invocationCount: parseIntMetric(row.invocationCount),
  }
}

export function buildLedgerConditions(
  workspaceCondition: SQL,
  period: ResolvedPeriod,
  sources?: UsageLogSource[]
): SQL[] {
  const conditions: SQL[] = [workspaceCondition, ...ledgerPeriodBounds(period)]
  if (sources && sources.length > 0) {
    conditions.push(inArray(usageLog.source, sources))
  }
  return conditions
}

export function buildLedgerJoinConditions(
  workspaceCondition: SQL,
  period: ResolvedPeriod
): SQL[] {
  return [workspaceCondition, ...ledgerPeriodBounds(period)]
}

export function buildExecutionConditions(
  workspaceCondition: SQL,
  period: ResolvedPeriod
): SQL[] {
  const start = ensurePeriodDate(period.start)
  const end = ensurePeriodDate(period.end)
  return [workspaceCondition, gte(workflowExecutionLogs.startedAt, start), lte(workflowExecutionLogs.startedAt, end)]
}

export function periodRange<T extends Parameters<typeof gte>[0]>(
  column: T,
  period: ResolvedPeriod
): [SQL, SQL] {
  const start = ensurePeriodDate(period.start)
  const end = ensurePeriodDate(period.end)
  return [gte(column, start), lte(column, end)]
}

/** Resolves a fixed window from explicit start/end or a relative period preset. */
export function resolveExplicitPeriod(options: ExplicitPeriodOptions): ResolvedPeriod {
  const end = ensurePeriodDate(options.endTime ? new Date(options.endTime) : new Date())
  const start = ensurePeriodDate(
    options.startTime
      ? new Date(options.startTime)
      : new Date(end.getTime() - PERIOD_MS[options.period ?? '30d'])
  )
  return { start, end }
}

/** Collapses min/max timestamp candidates into an all-time window ending at least at now. */
export function resolvePeriodFromDateCandidates(
  candidates: Array<Date | string | number | null | undefined>
): ResolvedPeriod {
  const dates = candidates
    .map(coerceToDate)
    .filter((value): value is Date => value !== null)

  if (dates.length === 0) {
    const now = new Date()
    return { start: now, end: now }
  }

  const start = ensurePeriodDate(new Date(Math.min(...dates.map((date) => date.getTime()))))
  const end = ensurePeriodDate(
    new Date(Math.max(...dates.map((date) => date.getTime()), Date.now()))
  )
  return { start, end }
}

export function timeBucketExpr(useHourly: boolean) {
  const occurredAt = ledgerOccurredAt()
  return useHourly
    ? sql`date_trunc('hour', ${occurredAt})`
    : sql`date_trunc('day', ${occurredAt})`
}

export function executionBucketExpr(useHourly: boolean) {
  return useHourly
    ? sql`date_trunc('hour', ${workflowExecutionLogs.startedAt})`
    : sql`date_trunc('day', ${workflowExecutionLogs.startedAt})`
}

export function parseActorType(value: string | null | undefined) {
  if (!value) return null
  const parsed = usageActorTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Resolved actor identity for usage attribution — stamped actor, else mothership
 * chat owner, else billing user. Shared by byActor rollups and active-user counts.
 */
export function resolvedActorUserIdExpr() {
  return sql`coalesce(
    ${usageLog.actorUserId},
    ${copilotChats.userId},
    ${usageLog.userId}
  )`
}

/**
 * Resolved actor type with the same fallback chain as {@link resolvedActorUserIdExpr}.
 * Infers `'user'` when a user id is present but `actor_type` was never stamped.
 */
export function resolvedActorTypeExpr() {
  return sql`coalesce(
    ${usageLog.actorType},
    case
      when coalesce(${usageLog.actorUserId}, ${copilotChats.userId}, ${usageLog.userId}) is not null
        then 'user'
      else null
    end
  )`
}

/** SQL predicate: resolved actor type is a human (`user`), including personal API keys. */
export function isHumanActorCondition() {
  return sql`${resolvedActorTypeExpr()} = 'user'`
}

export function parseChatType(value: string | null | undefined): 'mothership' | 'copilot' {
  return value === 'mothership' ? 'mothership' : 'copilot'
}

interface ExpensiveCopilotChatDbRow {
  workspaceId: string
  workspaceName: string | null
  chatId: string
  title: string | null
  chatType: string | null
  userId: string
  runCount: number
  billableCost: string
  rawCost: string
  count: number
}

interface ExpensiveWorkflowDbRow {
  workspaceId: string
  workspaceName: string | null
  workflowId: string | null
  workflowName: string | null
  executionCount: number
  billableCost: string
  rawCost: string
  count: number
}

/**
 * Builds the most-expensive mothership/copilot chats aggregate query.
 * Pair with {@link mapExpensiveCopilotChatRows} after Promise.all.
 */
export function buildExpensiveCopilotChatsQuery(options: QueryExpensiveCopilotChatsOptions) {
  const { chatScope, ledgerJoinConditions, period } = options

  return dbReplica
    .select({
      workspaceId: copilotChats.workspaceId,
      workspaceName: workspace.name,
      chatId: copilotChats.id,
      title: copilotChats.title,
      chatType: copilotChats.type,
      userId: copilotChats.userId,
      runCount: sql<number>`count(distinct ${copilotRuns.id})::int`,
      ...ledgerCostSelect(),
    })
    .from(copilotChats)
    .leftJoin(workspace, eq(workspace.id, copilotChats.workspaceId))
    .innerJoin(
      usageLog,
      and(
        eq(usageLog.chatId, copilotChats.id),
        ...ledgerJoinConditions,
        inArray(usageLog.source, COPILOT_USAGE_SOURCES)
      )
    )
    .leftJoin(
      copilotRuns,
      and(eq(copilotRuns.chatId, copilotChats.id), ...periodRange(copilotRuns.startedAt, period))
    )
    .where(chatScope)
    .groupBy(
      copilotChats.id,
      copilotChats.workspaceId,
      workspace.name,
      copilotChats.title,
      copilotChats.type,
      copilotChats.userId
    )
}

/** Maps raw expensive-chat aggregate rows, ranks by billable cost, and slices top N. */
export function mapExpensiveCopilotChatRows(
  rows: ExpensiveCopilotChatDbRow[],
  limit = TOP_EXPENSIVE_COPILOT_CHATS
): ExpensiveCopilotChatRow[] {
  return sortByBillableCostDesc(
    rows.map((row) => ({
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      chatId: row.chatId,
      title: row.title,
      chatType: parseChatType(row.chatType),
      userId: row.userId,
      runCount: row.runCount,
      billableCost: parseDecimal(row.billableCost),
      rawCost: parseDecimal(row.rawCost),
      count: row.count,
    }))
  ).slice(0, limit)
}

/**
 * Builds the most-expensive workflows aggregate query.
 * Pair with {@link mapExpensiveWorkflowRows} after Promise.all.
 */
export function buildExpensiveWorkflowsQuery(options: QueryExpensiveWorkflowsOptions) {
  const { executionScope, ledgerJoinConditions, period } = options
  const executionConditions = buildExecutionConditions(executionScope, period)

  return dbReplica
    .select({
      workspaceId: workflowExecutionLogs.workspaceId,
      workspaceName: workspace.name,
      workflowId: workflowExecutionLogs.workflowId,
      workflowName: workflow.name,
      executionCount: sql<number>`count(distinct ${workflowExecutionLogs.executionId})::int`,
      ...ledgerCostSelect(),
    })
    .from(workflowExecutionLogs)
    .leftJoin(workspace, eq(workspace.id, workflowExecutionLogs.workspaceId))
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
    .groupBy(
      workflowExecutionLogs.workspaceId,
      workspace.name,
      workflowExecutionLogs.workflowId,
      workflow.name
    )
}

/** Maps raw expensive-workflow aggregate rows, ranks by billable cost, and slices top N. */
export function mapExpensiveWorkflowRows(
  rows: ExpensiveWorkflowDbRow[],
  limit = TOP_EXPENSIVE_WORKFLOWS
): ExpensiveWorkflowRow[] {
  return sortByBillableCostDesc(
    rows.map((row) => ({
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      workflowId: row.workflowId,
      workflowName: row.workflowName,
      executionCount: row.executionCount,
      billableCost: parseDecimal(row.billableCost),
      rawCost: parseDecimal(row.rawCost),
      count: row.count,
    }))
  ).slice(0, limit)
}

