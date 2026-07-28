'use client'

import { Billing } from '@/app/workspace/[workspaceId]/settings/components/billing/billing'
import { BillingCreditUsagePanel } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-credit-usage-panel'

/**
 * Billing settings entry point that composes the existing billing page with the
 * new credit-usage panel in a single scroll region, without modifying billing.tsx.
 */
export function BillingPageShell() {
  return (
    <div className='flex h-full flex-col bg-[var(--bg)]'>
      <div className='flex flex-shrink-0 items-center justify-between bg-[var(--bg)] px-[16px] pt-[8.5px] pb-[8.5px]'>
        <div />
        <div className='h-[30px]' />
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable_both-edges]'>
        <div className='mx-auto flex max-w-[48rem] flex-col gap-7 pb-3'>
          <div className='[&>div]:!h-auto [&>div]:!min-h-0 [&>div>div:first-child]:hidden [&>div>div:last-child]:!overflow-visible [&>div>div:last-child]:!flex-none [&>div>div:last-child]:!px-0'>
            <Billing />
          </div>
          <BillingCreditUsagePanel />
        </div>
      </div>
    </div>
  )
}
