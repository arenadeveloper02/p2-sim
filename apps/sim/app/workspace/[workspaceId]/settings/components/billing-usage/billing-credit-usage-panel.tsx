'use client'

import { useParams } from 'next/navigation'
import { BillingOrgMemberUsageView } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-org-member-usage-view'
import { BillingOrgUsageView } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-org-usage-view'
import { BillingPersonalUsageView } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-personal-usage-view'
import { useBillingCreditUsage } from '@/hooks/queries/billing-credit-usage'

/**
 * Credit usage panel for the billing settings page.
 */
export function BillingCreditUsagePanel() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading } = useBillingCreditUsage(workspaceId)

  if (isLoading || !data) return null

  if (data.scope === 'organization') {
    return <BillingOrgUsageView data={data} />
  }

  if (data.viewer === 'org_member') {
    return <BillingOrgMemberUsageView data={data} />
  }

  return <BillingPersonalUsageView data={data} />
}
