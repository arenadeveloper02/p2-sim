'use client'

import { useParams } from 'next/navigation'
import {
  CircleInfo,
  Credit,
  Info,
  Server,
  Workflow,
} from '@/components/emcn'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import type { CreditUsageSummary } from '@/lib/api/contracts/billing-credit-usage'
import { BillingUsageMetricCard } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-metric-card'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { BillingUsageSourceRow } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-source-row'
import {
  clampPercent,
  formatCreditCount,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { useMyMemberCredits } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

const MY_USAGE_TOOLTIP =
  'Credits include combined usage from Mothership and Workflow Runs for your current billing period.'

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
 * Individual-user billing usage layout: allowance cards, overall progress, and
 * source breakdown.
 */
export function BillingPersonalUsageView({ data }: BillingPersonalUsageViewProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: subscriptionData } = useSubscriptionData()
  const { data: memberCredits } = useMyMemberCredits(workspaceId)

  const consumed = data.summary.totalCredits
  const { totalCredits, hint, isUnlimited } = resolvePersonalAllowance(
    subscriptionData?.data?.usage?.limit,
    memberCredits?.limitDollars
  )

  const remaining =
    isUnlimited || totalCredits == null ? null : Math.max(0, totalCredits - consumed)
  const usedPercent =
    isUnlimited || totalCredits == null || totalCredits <= 0
      ? 0
      : clampPercent((consumed / totalCredits) * 100)
  const remainingPercent = isUnlimited || totalCredits == null ? 0 : clampPercent(100 - usedPercent)

  const sourceDenominator = Math.max(consumed, 1)
  const mothershipPercent = (data.summary.mothershipCredits / sourceDenominator) * 100
  const workflowPercent = (data.summary.workflowCredits / sourceDenominator) * 100

  return (
    <div className='flex flex-col gap-7'>
      <BillingUsageSection
        label='My usage'
        headerAccessory={
          <Info side='top' align='start' className='flex-shrink-0 text-[var(--text-icon)]'>
            {MY_USAGE_TOOLTIP}
          </Info>
        }
      >
        <div className='flex flex-col gap-5'>
          <div className='grid gap-3 md:grid-cols-3'>
            <BillingUsageMetricCard
              label='Total credits'
              value={isUnlimited ? 'Unlimited' : `${formatCreditCount(totalCredits ?? 0)} credits`}
              hint={hint}
              icon={<Credit className='size-[14px] text-emerald-700' />}
              iconClassName='bg-emerald-500/10'
            />
            <BillingUsageMetricCard
              label='Credits consumed'
              value={`${formatCreditCount(consumed)} credits`}
              hint={
                isUnlimited || totalCredits == null
                  ? undefined
                  : `${usedPercent.toFixed(1)}% of total`
              }
              icon={<CircleInfo className='size-[14px] text-violet-700' />}
              iconClassName='bg-violet-500/10'
            />
            <BillingUsageMetricCard
              label='Credits remaining'
              value={
                isUnlimited
                  ? 'Unlimited'
                  : `${formatCreditCount(remaining ?? 0)} credits`
              }
              hint={
                isUnlimited || totalCredits == null
                  ? undefined
                  : `${remainingPercent.toFixed(1)}% of total`
              }
              icon={<Credit className='size-[14px] text-sky-700' />}
              iconClassName='bg-sky-500/10'
            />
          </div>

          {!isUnlimited && totalCredits != null && totalCredits > 0 ? (
            <div className='flex flex-col gap-2.5'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-[var(--text-body)] text-small'>Overall usage</span>
                <span className='text-[var(--text-muted)] text-small tabular-nums'>
                  {formatCreditCount(consumed)} / {formatCreditCount(totalCredits)} credits used
                </span>
              </div>
              <div className='h-2.5 overflow-hidden rounded-full bg-[var(--surface-3)]'>
                <div
                  className='h-full rounded-full bg-violet-500 transition-[width]'
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <div className='flex items-center justify-between text-[var(--text-muted)] text-small'>
                <span>{usedPercent.toFixed(1)}% used</span>
                <span>{remainingPercent.toFixed(1)}% remaining</span>
              </div>
            </div>
          ) : null}
        </div>
      </BillingUsageSection>

      <BillingUsageSection
        label='Usage by source'
        headerAccessory={
          <Info side='top' align='start' className='flex-shrink-0 text-[var(--text-icon)]'>
            {USAGE_BY_SOURCE_TOOLTIP}
          </Info>
        }
      >
        <div className='flex flex-col gap-4'>
          <BillingUsageSourceRow
            label='Mothership'
            credits={data.summary.mothershipCredits}
            percent={mothershipPercent}
            icon={<Server className='size-[14px] text-emerald-700' />}
            barClassName='bg-emerald-500'
          />
          <BillingUsageSourceRow
            label='Workflow runs'
            credits={data.summary.workflowCredits}
            percent={workflowPercent}
            icon={<Workflow className='size-[14px] text-violet-700' />}
            barClassName='bg-violet-500'
          />
        </div>
      </BillingUsageSection>

      <div className='flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5'>
        <CircleInfo className='mt-0.5 size-[14px] flex-shrink-0 text-sky-700' />
        <p className='text-[var(--text-body)] text-small'>
          Usage is updated in near real-time. Credits reset based on your billing cycle.
        </p>
      </div>
    </div>
  )
}
