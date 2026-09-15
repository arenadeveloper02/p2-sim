'use client'

import { Info } from '@sim/emcn'
import { useParams } from 'next/navigation'
import type { CreditUsageSummary } from '@/lib/api/contracts/billing-credit-usage'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import {
  BillingPersonalRemainingCreditsCard,
  BillingRemainingCreditsCard,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-remaining-credits-card'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { BillingUsageSourceRow } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-source-row'
import {
  formatCreditCount,
  resolveOrgPoolBarSegments,
  resolveUserTabUsedCredits,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { useBillingCreditUsage } from '@/hooks/queries/billing-credit-usage'
import { useMyMemberCredits } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

const USAGE_BY_SOURCE_TOOLTIP =
  'Mothership includes copilot, workspace chat, and related AI usage. Workflow runs covers workflow execution costs.'

interface UsageBillingStatsProps {
  /**
   * User tab remaining prefers a personal allocation when one is set, otherwise
   * the shared organization pool, using the caller's own usage. Organization
   * tab remaining is always the pool.
   */
  view: 'user' | 'organization'
  /** Current viewer id — used to read personal usage from org member rows. */
  viewerUserId?: string
}

/**
 * Billing pool / remaining-credits stats for the Usage settings page.
 * Does not include activity detail — that stays on the existing Usage analytics UI.
 */
export function UsageBillingStats({ view, viewerUserId }: UsageBillingStatsProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading } = useBillingCreditUsage(workspaceId, {
    personal: view === 'user',
  })

  if (isLoading || !data) return null

  if (view === 'organization' && data.scope === 'organization') {
    return <OrgAdminBillingStats data={data} />
  }

  if (data.orgPool) {
    return (
      <OrgMemberBillingStats data={data} workspaceId={workspaceId} viewerUserId={viewerUserId} />
    )
  }

  if (data.viewer === 'org_member') {
    return <OrgMemberBillingStats data={data} workspaceId={workspaceId} />
  }

  return <PersonalBillingStats data={data} workspaceId={workspaceId} />
}

function UsageBySourceSection({
  mothershipCredits,
  workflowCredits,
  totalCredits,
}: {
  mothershipCredits: number
  workflowCredits: number
  totalCredits: number
}) {
  const sourceDenominator = Math.max(totalCredits, 1)
  const mothershipPercent = (mothershipCredits / sourceDenominator) * 100
  const workflowPercent = (workflowCredits / sourceDenominator) * 100

  return (
    <BillingUsageSection
      label='Your usage by source'
      headerAccessory={
        <Info side='top' align='start' className='flex-shrink-0 text-[var(--text-icon)]'>
          {USAGE_BY_SOURCE_TOOLTIP}
        </Info>
      }
      action={
        <span className='text-[var(--text-muted)] text-small tabular-nums'>
          {formatCreditCount(totalCredits)} credits total
        </span>
      }
    >
      <div className='flex flex-col gap-4'>
        <BillingUsageSourceRow
          label='Mothership'
          credits={mothershipCredits}
          percent={mothershipPercent}
          badge='M'
          badgeClassName='bg-emerald-600'
          barClassName='bg-emerald-500'
        />
        <BillingUsageSourceRow
          label='Workflow runs'
          credits={workflowCredits}
          percent={workflowPercent}
          badge='W'
          badgeClassName='bg-violet-600'
          barClassName='bg-violet-500'
        />
      </div>
    </BillingUsageSection>
  )
}

/**
 * User-tab remaining credits: personal allocation when set, otherwise the
 * shared organization pool. Uses the caller's own usage for "Used by you".
 */
function OrgMemberBillingStats({
  data,
  workspaceId,
  viewerUserId,
}: {
  data: CreditUsageSummary
  workspaceId: string
  viewerUserId?: string
}) {
  const { data: memberCredits } = useMyMemberCredits(workspaceId)
  const orgPool = data.orgPool
  if (!orgPool) return null

  const allocatedCredits =
    memberCredits?.limitDollars != null ? dollarsToCredits(memberCredits.limitDollars) : null

  const selfMemberUsed = viewerUserId
    ? data.members?.find((member) => member.userId === viewerUserId)?.totalCredits
    : undefined

  const memberUsedCredits = resolveUserTabUsedCredits({
    isOrganizationAdminPayload: data.scope === 'organization',
    summaryTotalCredits: data.summary.totalCredits,
    allocatedCredits,
    enforcementUsedCredits: dollarsToCredits(memberCredits?.usedDollars ?? 0),
    selfMemberUsedCredits: selfMemberUsed,
  })

  const segments = resolveOrgPoolBarSegments({
    orgPool,
    memberUsedCredits,
  })

  return <BillingRemainingCreditsCard segments={segments} allocatedCredits={allocatedCredits} />
}

function resolvePersonalAllowance(
  usageLimitDollars: number | undefined,
  memberLimitDollars: number | null | undefined
): { totalCredits: number | null; hint: string; isUnlimited: boolean } {
  if (memberLimitDollars != null) {
    return {
      totalCredits: dollarsToCredits(memberLimitDollars),
      hint: 'Your member credit cap',
      isUnlimited: false,
    }
  }

  if (usageLimitDollars != null && usageLimitDollars >= ON_DEMAND_UNLIMITED) {
    return {
      totalCredits: null,
      hint: 'On-demand usage enabled',
      isUnlimited: true,
    }
  }

  return {
    totalCredits: dollarsToCredits(usageLimitDollars ?? 0),
    hint: 'Included in your plan',
    isUnlimited: false,
  }
}

function PersonalBillingStats({
  data,
  workspaceId,
}: {
  data: CreditUsageSummary
  workspaceId: string
}) {
  const { data: subscriptionData } = useSubscriptionData({ workspaceId })
  const { data: memberCredits } = useMyMemberCredits(workspaceId)

  const consumed = data.summary.totalCredits
  const { totalCredits, hint, isUnlimited } = resolvePersonalAllowance(
    subscriptionData?.data?.usage?.limit,
    memberCredits?.limitDollars
  )
  const remaining =
    isUnlimited || totalCredits == null ? null : Math.max(0, totalCredits - consumed)

  return (
    <div className='flex flex-col gap-6'>
      <p className='text-[var(--text-muted)] text-small'>
        Near real-time. Credits reset with your billing cycle.
      </p>
      <BillingPersonalRemainingCreditsCard
        totalCredits={totalCredits}
        usedCredits={consumed}
        remainingCredits={remaining}
        isUnlimited={isUnlimited}
        hint={hint}
      />
      <UsageBySourceSection
        mothershipCredits={data.summary.mothershipCredits}
        workflowCredits={data.summary.workflowCredits}
        totalCredits={consumed}
      />
    </div>
  )
}

function OrgAdminBillingStats({ data }: { data: CreditUsageSummary }) {
  const orgPool = data.orgPool
  const isUnlimited = orgPool?.isUnlimited ?? false
  const totalCredits = orgPool && !orgPool.isUnlimited ? orgPool.totalCredits : null
  const usedCredits = orgPool?.usedCredits ?? data.summary.totalCredits
  const remainingCredits =
    isUnlimited || totalCredits == null ? null : Math.max(0, totalCredits - usedCredits)

  return (
    <BillingPersonalRemainingCreditsCard
      totalCredits={totalCredits}
      usedCredits={usedCredits}
      remainingCredits={remainingCredits}
      isUnlimited={isUnlimited}
      hint='in the organization pool'
      hideUsedStats
      barColorClassName='bg-emerald-500'
    />
  )
}
