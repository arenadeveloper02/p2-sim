'use client'

import { useParams } from 'next/navigation'
import { BillingCreditUsageBreakdown } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-credit-usage-breakdown'
import { BillingCreditUsageMembers } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-credit-usage-members'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { useBillingCreditUsage } from '@/hooks/queries/billing-credit-usage'

function formatBillingPeriodLabel(
  start: string | null,
  end: string | null,
  interval: 'month' | 'year'
): string {
  if (!start || !end) {
    return interval === 'year' ? 'Current annual period' : 'Current monthly period'
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`
}

/**
 * Credit usage panel for the billing settings page.
 */
export function BillingCreditUsagePanel() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading } = useBillingCreditUsage(workspaceId)

  if (isLoading || !data) return null

  const periodLabel = formatBillingPeriodLabel(
    data.billingPeriodStart,
    data.billingPeriodEnd,
    data.billingInterval
  )

  const isOrganizationView = data.scope === 'organization'

  return (
    <div className='flex flex-col gap-7'>
      <BillingUsageSection
        label={isOrganizationView ? 'Organization credit usage' : 'Your credit usage'}
      >
        <div className='flex flex-col gap-4'>
          <p className='text-[var(--text-muted)] text-small'>{periodLabel}</p>
          <BillingCreditUsageBreakdown summary={data.summary} />
        </div>
      </BillingUsageSection>

      {isOrganizationView && data.members && data.members.length > 0 && (
        <BillingUsageSection label='Usage by member'>
          <BillingCreditUsageMembers members={data.members} />
        </BillingUsageSection>
      )}
    </div>
  )
}
