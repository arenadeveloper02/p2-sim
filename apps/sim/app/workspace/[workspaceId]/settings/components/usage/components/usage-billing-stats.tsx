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
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { useBillingCreditUsage } from '@/hooks/queries/billing-credit-usage'
import { useMyMemberCredits } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

const USAGE_BY_SOURCE_TOOLTIP =
  'Mothership includes copilot, workspace chat, and related AI usage. Workflow runs covers workflow execution costs.'

/**
 * Billing pool / remaining-credits stats for the Usage settings page.
 * Does not include activity detail — that stays on the existing Usage analytics UI.
 */
export function UsageBillingStats() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading } = useBillingCreditUsage(workspaceId)

  if (isLoading || !data) return null

  if (data.scope === 'organization') {
    return <OrgAdminBillingStats data={data} />
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

function OrgMemberBillingStats({
  data,
  workspaceId,
}: {
  data: CreditUsageSummary
  workspaceId: string
}) {
  const { data: memberCredits } = useMyMemberCredits(workspaceId)
  const orgPool = data.orgPool
  if (!orgPool) return null

  const allocatedCredits =
    memberCredits?.limitDollars != null ? dollarsToCredits(memberCredits.limitDollars) : null

  const segments = resolveOrgPoolBarSegments({
    orgPool,
    memberUsedCredits: data.summary.totalCredits,
  })

  return (
    <div className='flex flex-col gap-6'>
      <p className='text-[var(--text-muted)] text-small'>
        Near real-time. Credits reset with your organization&apos;s billing cycle.
      </p>
      <BillingRemainingCreditsCard segments={segments} allocatedCredits={allocatedCredits} />
      <UsageBySourceSection
        mothershipCredits={data.summary.mothershipCredits}
        workflowCredits={data.summary.workflowCredits}
        totalCredits={segments.usedByYouCredits}
      />
    </div>
  )
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
