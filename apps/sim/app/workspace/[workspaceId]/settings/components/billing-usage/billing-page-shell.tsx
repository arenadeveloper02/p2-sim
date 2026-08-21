'use client'

import { Chip, ChipLink } from '@sim/emcn'
import { useParams, useRouter } from 'next/navigation'
import { getDisplayPlanName, isFree } from '@/lib/billing/plan-helpers'
import { buildUpgradeHref } from '@/lib/billing/upgrade-reasons'
import { useOrganizationBilling } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

interface BillingPageShellProps {
  scope: 'account' | 'organization'
  organizationId?: string
  creditUsageHref?: string
  governingWorkspaceName?: string
}

/**
 * Arena billing settings: Explore plans CTA only (no usage, invoices, or credits UI).
 */
export function BillingPageShell({
  scope,
  organizationId,
  governingWorkspaceName,
}: BillingPageShellProps) {
  const router = useRouter()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const isOrganizationScope = scope === 'organization'

  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSubscriptionData({
    includeOrg: true,
    enabled: !isOrganizationScope,
  })
  const { data: organizationBillingData, isLoading: isOrgBillingLoading } = useOrganizationBilling(
    organizationId || '',
    { enabled: isOrganizationScope && Boolean(organizationId) }
  )

  const isLoading = isOrganizationScope ? isOrgBillingLoading : isSubscriptionLoading
  const organizationBilling = organizationBillingData?.data

  const plan = isOrganizationScope
    ? (organizationBilling?.subscriptionPlan ?? 'free')
    : (subscriptionData?.data?.plan ?? 'free')

  const upgradeWorkspaceId = isOrganizationScope
    ? (organizationBilling?.upgradeWorkspaceId ?? workspaceId)
    : (subscriptionData?.data?.upgradeWorkspaceId ?? workspaceId)

  const upgradeHref = upgradeWorkspaceId ? buildUpgradeHref(upgradeWorkspaceId) : null
  const prefetchUpgrade = () => {
    if (upgradeHref) router.prefetch(upgradeHref)
  }

  const planName = getDisplayPlanName(plan)
  const planTitle = isOrganizationScope ? `Organization ${planName} plan` : `${planName} plan`
  const description =
    governingWorkspaceName && !isFree(plan)
      ? `This plan governs ${governingWorkspaceName}.`
      : 'Compare plans and upgrade when you are ready.'

  if (isLoading) return null

  return (
    <div className='flex h-full flex-col bg-[var(--bg)]'>
      <div className='flex flex-shrink-0 items-center justify-between bg-[var(--bg)] px-[16px] pt-[8.5px] pb-[8.5px]'>
        <div />
        <div className='h-[30px]' />
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable_both-edges]'>
        <div className='mx-auto flex max-w-[48rem] flex-col gap-7 pb-3'>
          <div className='flex items-center justify-between gap-4 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] px-5 py-5'>
            <div className='flex min-w-0 flex-col gap-1'>
              <span className='font-medium text-[var(--text-muted)] text-caption uppercase tracking-wide'>
                Plans
              </span>
              <span className='truncate font-medium text-[var(--text-body)] text-sm'>
                {planTitle}
              </span>
              <span className='text-[var(--text-muted)] text-small'>{description}</span>
            </div>
            {upgradeHref ? (
              <ChipLink
                href={upgradeHref}
                variant='border-shadow'
                flush
                onMouseEnter={prefetchUpgrade}
                onFocus={prefetchUpgrade}
              >
                Explore plans
              </ChipLink>
            ) : (
              <Chip variant='border-shadow' flush disabled>
                Explore plans
              </Chip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
