'use client'

import { Info } from '@sim/emcn'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import type { CreditUsageSummary } from '@/lib/api/contracts/billing-credit-usage'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import { BillingActivityDetail } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-activity-detail'
import { BillingPersonalRemainingCreditsCard } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-remaining-credits-card'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { BillingUsageSourceRow } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-source-row'
import { formatCreditCount } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { billingCreditUsageKeys } from '@/hooks/queries/billing-credit-usage'
import { useMyMemberCredits } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

const USAGE_BY_SOURCE_TOOLTIP =
  'Mothership includes copilot, workspace chat, and related AI usage. Workflow runs covers workflow execution costs.'

interface BillingPersonalUsageViewProps {
  data: CreditUsageSummary
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

/**
 * Solo / personal billing usage layout: remaining-credits hero, source
 * breakdown, and activity detail.
 */
export function BillingPersonalUsageView({ data }: BillingPersonalUsageViewProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { data: subscriptionData } = useSubscriptionData({ workspaceId })
  const { data: memberCredits } = useMyMemberCredits(workspaceId)

  const consumed = data.summary.totalCredits
  const { totalCredits, hint, isUnlimited } = resolvePersonalAllowance(
    subscriptionData?.data?.usage?.limit,
    memberCredits?.limitDollars
  )

  const remaining =
    isUnlimited || totalCredits == null ? null : Math.max(0, totalCredits - consumed)

  const sourceDenominator = Math.max(consumed, 1)
  const mothershipPercent = (data.summary.mothershipCredits / sourceDenominator) * 100
  const workflowPercent = (data.summary.workflowCredits / sourceDenominator) * 100

  return (
    <div className='flex flex-col gap-7'>
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

      <BillingUsageSection
        label='Your usage by source'
        headerAccessory={
          <Info side='top' align='start' className='flex-shrink-0 text-[var(--text-icon)]'>
            {USAGE_BY_SOURCE_TOOLTIP}
          </Info>
        }
        action={
          <span className='text-[var(--text-muted)] text-small tabular-nums'>
            {formatCreditCount(consumed)} credits total
          </span>
        }
      >
        <div className='flex flex-col gap-4'>
          <BillingUsageSourceRow
            label='Mothership'
            credits={data.summary.mothershipCredits}
            percent={mothershipPercent}
            badge='M'
            badgeClassName='bg-emerald-600'
            barClassName='bg-emerald-500'
          />
          <BillingUsageSourceRow
            label='Workflow runs'
            credits={data.summary.workflowCredits}
            percent={workflowPercent}
            badge='W'
            badgeClassName='bg-violet-600'
            barClassName='bg-violet-500'
          />
        </div>
      </BillingUsageSection>

      <BillingActivityDetail
        onRefresh={() => {
          void queryClient.invalidateQueries({
            queryKey: billingCreditUsageKeys.summary(workspaceId),
          })
        }}
      />
    </div>
  )
}
