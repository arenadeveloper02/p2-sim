'use client'

import { useParams } from 'next/navigation'
import {
  CircleInfo,
  Credit,
  Info,
  Server,
  Workflow,
} from '@/components/emcn'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import type { CreditUsageSummary } from '@/lib/api/contracts/billing-credit-usage'
import { BillingUsageMetricCard } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-metric-card'
import { BillingUsageSection } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-section'
import { BillingUsageSourceRow } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-source-row'
import {
  formatCreditCount,
  resolveOrgMemberCreditDisplay,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import { useMyMemberCredits } from '@/hooks/queries/organization'

const MY_USAGE_TOOLTIP =
  'Organization credit pool for the current billing period, your optional admin allocation, and your personal usage within this organization.'

const USAGE_BY_SOURCE_TOOLTIP =
  'Mothership includes copilot, workspace chat, and related AI usage. Workflow runs covers workflow execution costs.'

interface BillingOrgMemberUsageViewProps {
  data: CreditUsageSummary
}

function formatCreditsValue(value: number | 'unlimited'): string {
  return value === 'unlimited' ? 'Unlimited' : `${formatCreditCount(value)} credits`
}

/**
 * Org-member billing usage layout: org pool total, optional allocation, personal
 * used/remaining, and source breakdown.
 */
export function BillingOrgMemberUsageView({ data }: BillingOrgMemberUsageViewProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: memberCredits } = useMyMemberCredits(workspaceId)

  const orgPool = data.orgPool
  if (!orgPool) return null

  const allocatedCredits =
    memberCredits?.limitDollars != null ? dollarsToCredits(memberCredits.limitDollars) : null

  const display = resolveOrgMemberCreditDisplay({
    orgPool,
    allocatedCredits,
    memberUsedCredits: data.summary.totalCredits,
  })

  const sourceDenominator = Math.max(display.usedCredits, 1)
  const mothershipPercent = (data.summary.mothershipCredits / sourceDenominator) * 100
  const workflowPercent = (data.summary.workflowCredits / sourceDenominator) * 100

  const usedHint =
    display.progressDenominator > 0
      ? allocatedCredits != null
        ? `${display.progressPercent.toFixed(1)}% of allocation`
        : `${display.progressPercent.toFixed(1)}% of organization pool`
      : undefined

  const remainingHint =
    allocatedCredits != null
      ? 'Based on your allocation and organization pool'
      : 'Shared organization pool remaining'

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
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <BillingUsageMetricCard
              label='Total credits'
              value={formatCreditsValue(display.totalCredits)}
              hint='Organization credit pool'
              icon={<Credit className='size-[14px] text-emerald-700' />}
              iconClassName='bg-emerald-500/10'
            />
            <BillingUsageMetricCard
              label='Allocated credits'
              value={
                display.allocatedCredits != null
                  ? `${formatCreditCount(display.allocatedCredits)} credits`
                  : '—'
              }
              hint={
                display.allocatedCredits != null ? 'Set by your organization admin' : undefined
              }
              icon={<Credit className='size-[14px] text-amber-700' />}
              iconClassName='bg-amber-500/10'
            />
            <BillingUsageMetricCard
              label='Used credits'
              value={`${formatCreditCount(display.usedCredits)} credits`}
              hint={usedHint}
              icon={<CircleInfo className='size-[14px] text-violet-700' />}
              iconClassName='bg-violet-500/10'
            />
            <BillingUsageMetricCard
              label='Remaining credits'
              value={formatCreditsValue(display.remainingCredits)}
              hint={display.remainingCredits === 'unlimited' ? undefined : remainingHint}
              icon={<Credit className='size-[14px] text-sky-700' />}
              iconClassName='bg-sky-500/10'
            />
          </div>

          {display.progressDenominator > 0 ? (
            <div className='flex flex-col gap-2.5'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-[var(--text-body)] text-small'>Overall usage</span>
                <span className='text-[var(--text-muted)] text-small tabular-nums'>
                  {formatCreditCount(display.progressNumerator)} /{' '}
                  {formatCreditCount(display.progressDenominator)} credits used
                </span>
              </div>
              <div className='h-2.5 overflow-hidden rounded-full bg-[var(--surface-3)]'>
                <div
                  className='h-full rounded-full bg-violet-500 transition-[width]'
                  style={{ width: `${display.progressPercent}%` }}
                />
              </div>
              <div className='flex items-center justify-between text-[var(--text-muted)] text-small'>
                <span>{display.progressPercent.toFixed(1)}% used</span>
                <span>{(100 - display.progressPercent).toFixed(1)}% remaining</span>
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
          Usage is updated in near real-time. Credits reset based on your organization&apos;s
          billing cycle.
        </p>
      </div>
    </div>
  )
}
