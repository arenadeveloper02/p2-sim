import { dbReplica } from '@sim/db'
import { member, usageLog, user, userStats, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/predicates'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { defaultBillingPeriod } from '@/lib/billing/core/billing-period'
import { getOrganizationSubscription } from '@/lib/billing/core/billing'
import { getOrgMemberLedgerByUser } from '@/lib/billing/core/organization'
import { getOrgUsageLimit, getUserUsageData } from '@/lib/billing/core/usage'
import {
  COPILOT_USAGE_SOURCES,
  getBillingPeriodUsageCost,
  getBillingPeriodUsageCostByUser,
  type UsageLogSource,
} from '@/lib/billing/core/usage-log'
import {
  computeDailyRefreshConsumed,
  getOrgMemberRefreshBounds,
} from '@/lib/billing/credits/daily-refresh'
import { apportionCredits, dollarsToCredits } from '@/lib/billing/credits/conversion'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { getPlanTierDollars, isPaid } from '@/lib/billing/plan-helpers'
import { getHighestPrioritySubscription, resolveBillingInterval } from '@/lib/billing/core/subscription'
import { isOrgScopedSubscription } from '@/lib/billing/subscriptions/utils'
import type { DbClient } from '@/lib/db/types'

const logger = createLogger('CreditUsageBreakdown')

export interface CreditUsageBreakdownCredits {
  totalCredits: number
  mothershipCredits: number
  workflowCredits: number
  otherCredits: number
}

export interface MemberCreditUsageRow {
  userId: string
  userName: string
  userEmail: string
  totalCredits: number
  mothershipCredits: number
  workflowCredits: number
  otherCredits: number
}

export interface CreditUsageSummaryResult {
  scope: 'personal' | 'organization'
  viewer: 'solo' | 'org_member'
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  billingInterval: 'month' | 'year'
  summary: CreditUsageBreakdownCredits
  orgPool?: {
    totalCredits: number
    usedCredits: number
    isUnlimited: boolean
  }
  members?: MemberCreditUsageRow[]
}

interface DollarBreakdown {
  totalDollars: number
  mothershipDollars: number
  workflowDollars: number
  otherDollars: number
}

/**
 * Sums `usage_log` cost for a user inside an organization's workspaces within a
 * wall-clock window, optionally filtered by source.
 */
async function sumOrgWorkspaceUsageBySource(
  organizationId: string,
  userId: string,
  window: { start: Date; end: Date },
  sources?: UsageLogSource | UsageLogSource[],
  executor: DbClient = dbReplica
): Promise<number> {
  const conditions = [
    eq(usageLog.userId, userId),
    eq(workspace.organizationId, organizationId),
    gte(usageLog.createdAt, window.start),
    lt(usageLog.createdAt, window.end),
  ]

  if (sources) {
    conditions.push(
      Array.isArray(sources) ? inArray(usageLog.source, sources) : eq(usageLog.source, sources)
    )
  }

  const [row] = await executor
    .select({ cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)` })
    .from(usageLog)
    .innerJoin(workspace, eq(workspace.id, usageLog.workspaceId))
    .where(and(...conditions))

  return Number.parseFloat(row?.cost ?? '0')
}

function buildDollarBreakdown(params: {
  totalBaseline: number
  copilotBaseline: number
  totalLedger: number
  mothershipLedger: number
  workflowLedger: number
}): DollarBreakdown {
  const workflowBaseline = Math.max(0, params.totalBaseline - params.copilotBaseline)
  const mothershipDollars = params.copilotBaseline + params.mothershipLedger
  const workflowDollars = workflowBaseline + params.workflowLedger
  const totalDollars = params.totalBaseline + params.totalLedger
  const otherDollars = Math.max(0, totalDollars - mothershipDollars - workflowDollars)

  return {
    totalDollars,
    mothershipDollars,
    workflowDollars,
    otherDollars,
  }
}

function applyRefreshAndConvertToCredits(
  breakdown: DollarBreakdown,
  refreshDeduction: number
): CreditUsageBreakdownCredits {
  const effectiveTotal = Math.max(0, breakdown.totalDollars - refreshDeduction)
  if (breakdown.totalDollars <= 0 || refreshDeduction <= 0) {
    return toCreditBreakdown(breakdown, effectiveTotal)
  }

  const scale = effectiveTotal / breakdown.totalDollars
  return toCreditBreakdown(
    {
      totalDollars: effectiveTotal,
      mothershipDollars: breakdown.mothershipDollars * scale,
      workflowDollars: breakdown.workflowDollars * scale,
      otherDollars: breakdown.otherDollars * scale,
    },
    effectiveTotal
  )
}

function toCreditBreakdown(
  breakdown: DollarBreakdown,
  totalDollarsForApportion: number
): CreditUsageBreakdownCredits {
  const apportioned = apportionCredits([
    { key: 'mothership', dollars: breakdown.mothershipDollars },
    { key: 'workflow', dollars: breakdown.workflowDollars },
    { key: 'other', dollars: breakdown.otherDollars },
  ])

  return {
    totalCredits: dollarsToCredits(totalDollarsForApportion),
    mothershipCredits: apportioned.mothership,
    workflowCredits: apportioned.workflow,
    otherCredits: apportioned.other,
  }
}

async function getRefreshDeductionForOrg(
  organizationId: string,
  memberIds: string[],
  subscription: NonNullable<Awaited<ReturnType<typeof getOrganizationSubscription>>>,
  executor: DbClient
): Promise<number> {
  if (!isPaid(subscription.plan) || !subscription.periodStart || memberIds.length === 0) {
    return 0
  }

  const planDollars = getPlanTierDollars(subscription.plan)
  if (planDollars <= 0) return 0

  const userBounds = await getOrgMemberRefreshBounds(
    organizationId,
    subscription.periodStart,
    executor
  )

  return computeDailyRefreshConsumed(
    {
      userIds: memberIds,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd ?? null,
      planDollars,
      seats: subscription.seats || 1,
      userBounds: Object.keys(userBounds).length > 0 ? userBounds : undefined,
      billingEntity: { type: 'organization', id: organizationId },
    },
    executor
  )
}

async function getOrganizationPoolSnapshot(
  organizationId: string,
  executor: DbClient
): Promise<CreditUsageSummaryResult['orgPool']> {
  const subscription = await getOrganizationSubscription(organizationId, { executor })
  const plan = subscription?.plan ?? 'free'
  const { limit: orgLimitDollars } = await getOrgUsageLimit(
    organizationId,
    plan,
    subscription?.seats ?? null,
    executor
  )
  const isUnlimited = orgLimitDollars >= ON_DEMAND_UNLIMITED

  const orgSummary = await getOrganizationCreditUsageSummary(organizationId, executor)
  const usedCredits = orgSummary?.summary.totalCredits ?? 0

  return {
    totalCredits: isUnlimited ? 0 : dollarsToCredits(orgLimitDollars),
    usedCredits,
    isUnlimited,
  }
}

async function getPersonalCreditUsageSummary(
  userId: string,
  organizationId: string | null,
  executor: DbClient,
  options?: { viewer?: 'solo' | 'org_member' }
): Promise<CreditUsageSummaryResult> {
  if (organizationId) {
    const subscription = await getOrganizationSubscription(organizationId, { executor })
    const billingPeriod =
      subscription?.periodStart && subscription?.periodEnd
        ? { start: subscription.periodStart, end: subscription.periodEnd }
        : defaultBillingPeriod()

    const [totalLedger, mothershipLedger, workflowLedger] = await Promise.all([
      sumOrgWorkspaceUsageBySource(organizationId, userId, billingPeriod, undefined, executor),
      sumOrgWorkspaceUsageBySource(
        organizationId,
        userId,
        billingPeriod,
        COPILOT_USAGE_SOURCES,
        executor
      ),
      sumOrgWorkspaceUsageBySource(organizationId, userId, billingPeriod, 'workflow', executor),
    ])

    const dollarBreakdown = buildDollarBreakdown({
      totalBaseline: 0,
      copilotBaseline: 0,
      totalLedger,
      mothershipLedger,
      workflowLedger,
    })

    const orgPool = await getOrganizationPoolSnapshot(organizationId, executor)

    return {
      scope: 'personal',
      viewer: options?.viewer ?? 'org_member',
      billingPeriodStart: billingPeriod.start.toISOString(),
      billingPeriodEnd: billingPeriod.end.toISOString(),
      billingInterval: resolveBillingInterval(subscription),
      summary: toCreditBreakdown(dollarBreakdown, dollarBreakdown.totalDollars),
      orgPool,
    }
  }

  const subscription = await getHighestPrioritySubscription(userId, { executor })
  const orgScoped = isOrgScopedSubscription(subscription, userId)
  const usageData = await getUserUsageData(
    userId,
    executor,
    orgScoped ? { personalAccount: true } : undefined
  )
  const billingPeriod =
    usageData.billingPeriodStart && usageData.billingPeriodEnd
      ? { start: usageData.billingPeriodStart, end: usageData.billingPeriodEnd }
      : defaultBillingPeriod()

  const [statsRow] = await executor
    .select({
      currentPeriodCost: userStats.currentPeriodCost,
      currentPeriodCopilotCost: userStats.currentPeriodCopilotCost,
    })
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1)

  const totalBaseline = Number(statsRow?.currentPeriodCost ?? 0)
  const copilotBaseline = Number(statsRow?.currentPeriodCopilotCost ?? 0)

  const [totalLedger, mothershipLedger, workflowLedger] = await Promise.all([
    getBillingPeriodUsageCost({ type: 'user', id: userId }, billingPeriod, undefined, executor),
    getBillingPeriodUsageCost(
      { type: 'user', id: userId },
      billingPeriod,
      COPILOT_USAGE_SOURCES,
      executor
    ),
    getBillingPeriodUsageCost({ type: 'user', id: userId }, billingPeriod, 'workflow', executor),
  ])

  const dollarBreakdown = buildDollarBreakdown({
    totalBaseline,
    copilotBaseline,
    totalLedger,
    mothershipLedger,
    workflowLedger,
  })

  let refreshDeduction = 0
  if (
    subscription &&
    isPaid(subscription.plan) &&
    usageData.billingPeriodStart &&
    getPlanTierDollars(subscription.plan) > 0
  ) {
    refreshDeduction = await computeDailyRefreshConsumed(
      {
        userIds: [userId],
        periodStart: usageData.billingPeriodStart,
        periodEnd: usageData.billingPeriodEnd,
        planDollars: getPlanTierDollars(subscription.plan),
        billingEntity: { type: 'user', id: userId },
      },
      executor
    )
  }

  return {
    scope: 'personal',
    viewer: 'solo',
    billingPeriodStart: usageData.billingPeriodStart?.toISOString() ?? null,
    billingPeriodEnd: usageData.billingPeriodEnd?.toISOString() ?? null,
    billingInterval: resolveBillingInterval(subscription),
    summary: applyRefreshAndConvertToCredits(dollarBreakdown, refreshDeduction),
  }
}

async function getOrganizationCreditUsageSummary(
  organizationId: string,
  executor: DbClient
): Promise<CreditUsageSummaryResult | null> {
  const subscription = await getOrganizationSubscription(organizationId, { executor })
  if (!subscription?.periodStart || !subscription.periodEnd) {
    return null
  }

  const billingPeriod = { start: subscription.periodStart, end: subscription.periodEnd }

  const membersWithStats = await executor
    .select({
      userId: member.userId,
      userName: user.name,
      userEmail: user.email,
      currentPeriodCost: userStats.currentPeriodCost,
      currentPeriodCopilotCost: userStats.currentPeriodCopilotCost,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .leftJoin(userStats, eq(member.userId, userStats.userId))
    .where(eq(member.organizationId, organizationId))

  const [
    usageByUser,
    mothershipByUser,
    workflowByUser,
    orgTotalLedger,
    orgMothershipLedger,
    orgWorkflowLedger,
  ] = await Promise.all([
    getOrgMemberLedgerByUser(organizationId, billingPeriod, executor),
    getBillingPeriodUsageCostByUser(
      { type: 'organization', id: organizationId },
      billingPeriod,
      COPILOT_USAGE_SOURCES,
      executor
    ),
    getBillingPeriodUsageCostByUser(
      { type: 'organization', id: organizationId },
      billingPeriod,
      'workflow',
      executor
    ),
    getBillingPeriodUsageCost(
      { type: 'organization', id: organizationId },
      billingPeriod,
      undefined,
      executor
    ),
    getBillingPeriodUsageCost(
      { type: 'organization', id: organizationId },
      billingPeriod,
      COPILOT_USAGE_SOURCES,
      executor
    ),
    getBillingPeriodUsageCost(
      { type: 'organization', id: organizationId },
      billingPeriod,
      'workflow',
      executor
    ),
  ])

  let totalBaseline = 0
  let copilotBaseline = 0
  const memberRows: MemberCreditUsageRow[] = membersWithStats.map((memberRecord) => {
    const memberTotalBaseline = Number(memberRecord.currentPeriodCost ?? 0)
    const memberCopilotBaseline = Number(memberRecord.currentPeriodCopilotCost ?? 0)
    const memberTotalLedger = usageByUser.get(memberRecord.userId) ?? 0
    const memberMothershipLedger = mothershipByUser.get(memberRecord.userId) ?? 0
    const memberWorkflowLedger = workflowByUser.get(memberRecord.userId) ?? 0

    totalBaseline += memberTotalBaseline
    copilotBaseline += memberCopilotBaseline

    const memberBreakdown = buildDollarBreakdown({
      totalBaseline: memberTotalBaseline,
      copilotBaseline: memberCopilotBaseline,
      totalLedger: memberTotalLedger,
      mothershipLedger: memberMothershipLedger,
      workflowLedger: memberWorkflowLedger,
    })

    const memberCredits = toCreditBreakdown(memberBreakdown, memberBreakdown.totalDollars)

    return {
      userId: memberRecord.userId,
      userName: memberRecord.userName,
      userEmail: memberRecord.userEmail,
      ...memberCredits,
    }
  })

  memberRows.sort((a, b) => b.totalCredits - a.totalCredits)

  const orgDollarBreakdown = buildDollarBreakdown({
    totalBaseline,
    copilotBaseline,
    totalLedger: orgTotalLedger,
    mothershipLedger: orgMothershipLedger,
    workflowLedger: orgWorkflowLedger,
  })

  const memberIds = membersWithStats.map((m) => m.userId)
  const refreshDeduction = await getRefreshDeductionForOrg(
    organizationId,
    memberIds,
    subscription,
    executor
  )

  const summary = applyRefreshAndConvertToCredits(orgDollarBreakdown, refreshDeduction)

  const { limit: orgLimitDollars } = await getOrgUsageLimit(
    organizationId,
    subscription.plan,
    subscription.seats ?? null,
    executor
  )
  const isUnlimited = orgLimitDollars >= ON_DEMAND_UNLIMITED

  return {
    scope: 'organization',
    viewer: 'solo',
    billingPeriodStart: billingPeriod.start.toISOString(),
    billingPeriodEnd: billingPeriod.end.toISOString(),
    billingInterval: resolveBillingInterval(subscription),
    summary,
    orgPool: {
      totalCredits: isUnlimited ? 0 : dollarsToCredits(orgLimitDollars),
      usedCredits: summary.totalCredits,
      isUnlimited,
    },
    members: memberRows,
  }
}

/**
 * Credit usage summary for the billing page: org admins see pooled org usage plus
 * per-member rows; everyone else sees only their own usage. Totals include
 * Mothership (copilot-family) and workflow-run consumption for the active period.
 */
export async function getCreditUsageSummary(params: {
  userId: string
  workspaceId: string
  executor?: DbClient
}): Promise<CreditUsageSummaryResult | null> {
  const executor = params.executor ?? dbReplica

  try {
    const [workspaceRow] = await executor
      .select({ organizationId: workspace.organizationId })
      .from(workspace)
      .where(eq(workspace.id, params.workspaceId))
      .limit(1)

    const organizationId = workspaceRow?.organizationId ?? null

    if (organizationId) {
      const [membership] = await executor
        .select({ role: member.role })
        .from(member)
        .where(
          and(eq(member.organizationId, organizationId), eq(member.userId, params.userId))
        )
        .limit(1)

      if (!membership) {
        return getPersonalCreditUsageSummary(params.userId, null, executor)
      }

      if (isOrgAdminRole(membership.role)) {
        return getOrganizationCreditUsageSummary(organizationId, executor)
      }

      return getPersonalCreditUsageSummary(params.userId, organizationId, executor)
    }

    return getPersonalCreditUsageSummary(params.userId, null, executor)
  } catch (error) {
    logger.error('Failed to build credit usage summary', {
      userId: params.userId,
      workspaceId: params.workspaceId,
      error,
    })
    throw error
  }
}
