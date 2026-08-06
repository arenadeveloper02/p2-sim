'use client'

import { Info } from '@sim/emcn'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import type { CreditUsageSummary } from '@/lib/api/contracts/billing-credit-usage'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import { BillingActivityDetail } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-activity-detail'
import { BillingRemainingCreditsCard } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-remaining-credits-card'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { BillingUsageSourceRow } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-source-row'
import {
  formatCreditCount,
  resolveOrgPoolBarSegments,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { billingCreditUsageKeys } from '@/hooks/queries/billing-credit-usage'
import { useMyMemberCredits } from '@/hooks/queries/organization'

const USAGE_BY_SOURCE_TOOLTIP =
  'Mothership includes copilot, workspace chat, and related AI usage. Workflow runs covers workflow execution costs.'

interface BillingOrgMemberUsageViewProps {
  data: CreditUsageSummary
}

/**
 * Org-member billing usage layout matching the remaining-credits dashboard:
 * pool hero card, source breakdown, and activity detail.
 */
export function BillingOrgMemberUsageView({ data }: BillingOrgMemberUsageViewProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { data: memberCredits } = useMyMemberCredits(workspaceId)

  const orgPool = data.orgPool
  if (!orgPool) return null

  const allocatedCredits =
    memberCredits?.limitDollars != null ? dollarsToCredits(memberCredits.limitDollars) : null

  const segments = resolveOrgPoolBarSegments({
    orgPool,
    memberUsedCredits: data.summary.totalCredits,
  })

  const sourceDenominator = Math.max(segments.usedByYouCredits, 1)
  const mothershipPercent = (data.summary.mothershipCredits / sourceDenominator) * 100
  const workflowPercent = (data.summary.workflowCredits / sourceDenominator) * 100

  return (
    <div className='flex flex-col gap-7'>
      <p className='text-[var(--text-muted)] text-small'>
        Near real-time. Credits reset with your organization&apos;s billing cycle.
      </p>

      <BillingRemainingCreditsCard segments={segments} allocatedCredits={allocatedCredits} />

      <BillingUsageSection
        label='Your usage by source'
        headerAccessory={
          <Info side='top' align='start' className='flex-shrink-0 text-[var(--text-icon)]'>
            {USAGE_BY_SOURCE_TOOLTIP}
          </Info>
        }
        action={
          <span className='text-[var(--text-muted)] text-small tabular-nums'>
            {formatCreditCount(segments.usedByYouCredits)} credits total
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
