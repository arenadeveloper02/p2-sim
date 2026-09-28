'use client'

import { cn, Info } from '@sim/emcn'
import {
  formatCreditCount,
  formatSharePercent,
  type OrgPoolBarSegments,
  resolveOrgMemberCreditDisplay,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

const ALLOCATION_TOOLTIP =
  'Optional credit cap set by your organization admin. With no limit, you share the organization pool.'

interface BillingRemainingCreditsCardProps {
  segments: OrgPoolBarSegments
  allocatedCredits: number | null
}

/**
 * Hero remaining-credits card for User scope (members + admin User tab).
 * Prefers the member allocation when set (`10,000 of 10,000 allocated to you`);
 * otherwise the shared organization pool. Organization-tab remaining stays on
 * the org pool card.
 */
export function BillingRemainingCreditsCard({
  segments,
  allocatedCredits,
}: BillingRemainingCreditsCardProps) {
  const {
    poolTotalCredits,
    usedByOrgCredits,
    usedByYouCredits,
    youPercent,
    othersPercent,
    remainingPercent,
  } = segments

  const poolIsUnlimited = poolTotalCredits === 'unlimited'
  const poolWhole = typeof poolTotalCredits === 'number' ? poolTotalCredits : 0
  const hasAllocation = allocatedCredits != null

  const display = resolveOrgMemberCreditDisplay({
    orgPool: {
      totalCredits: poolWhole,
      usedCredits: usedByOrgCredits,
      isUnlimited: poolIsUnlimited,
    },
    allocatedCredits,
    memberUsedCredits: usedByYouCredits,
  })

  const remainingLabel =
    display.remainingCredits === 'unlimited'
      ? 'Unlimited'
      : formatCreditCount(display.remainingCredits)

  const ofLine = hasAllocation
    ? `of ${formatCreditCount(allocatedCredits)} allocated to you`
    : poolIsUnlimited
      ? 'Unlimited organization pool'
      : `of ${formatCreditCount(poolTotalCredits)} in the organization pool`

  const allocationUsedPercent = hasAllocation ? display.progressPercent : 0
  const allocationRemainingPercent = hasAllocation
    ? Math.max(0, 100 - allocationUsedPercent)
    : remainingPercent

  return (
    <div className='rounded-xl border border-[var(--border-1)] bg-[var(--bg)] px-5 py-5'>
      <div className='flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className='font-medium text-[var(--text-muted)] text-caption uppercase tracking-wide'>
            Remaining credits
          </span>
          <span className='font-medium text-3xl text-[var(--text-body)] tabular-nums tracking-tight'>
            {remainingLabel}
          </span>
          <span className='text-[var(--text-muted)] text-small'>{ofLine}</span>
        </div>

        <div className='grid grid-cols-3 gap-4 sm:gap-6'>
          <div className='flex flex-col gap-0.5'>
            <span className='text-[var(--text-muted)] text-caption'>Used by org</span>
            <span className='font-medium text-[var(--text-body)] text-small tabular-nums'>
              {formatCreditCount(usedByOrgCredits)}
            </span>
            <span className='text-[var(--text-muted)] text-caption tabular-nums'>
              {formatSharePercent(usedByOrgCredits, poolWhole)}
            </span>
          </div>
          <div className='flex flex-col gap-0.5'>
            <span className='text-[var(--text-muted)] text-caption'>Used by you</span>
            <span className='font-medium text-[var(--text-body)] text-small tabular-nums'>
              {formatCreditCount(usedByYouCredits)}
            </span>
            <span className='text-[var(--text-muted)] text-caption tabular-nums'>
              {formatSharePercent(usedByYouCredits, hasAllocation ? allocatedCredits : poolWhole)}
            </span>
          </div>
          <div className='flex flex-col gap-0.5'>
            <span className='inline-flex items-center gap-1 text-[var(--text-muted)] text-caption'>
              Allocated to you
              <Info side='top' align='end' className='text-[var(--text-icon)]'>
                {ALLOCATION_TOOLTIP}
              </Info>
            </span>
            <span className='font-medium text-[var(--text-body)] text-small tabular-nums'>
              {hasAllocation ? formatCreditCount(allocatedCredits) : 'No limit'}
            </span>
          </div>
        </div>
      </div>

      {hasAllocation || !poolIsUnlimited ? (
        <div className='mt-5 flex flex-col gap-2'>
          {hasAllocation ? (
            <div className='h-2 overflow-hidden rounded-full bg-[var(--surface-3)]'>
              {allocationUsedPercent > 0 ? (
                <div
                  className='h-full rounded-full bg-emerald-500 transition-[width]'
                  style={{ width: `${allocationUsedPercent}%` }}
                />
              ) : null}
            </div>
          ) : (
            <div className='flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]'>
              {youPercent > 0 ? (
                <div
                  className='h-full bg-emerald-500 transition-[width]'
                  style={{ width: `${youPercent}%` }}
                />
              ) : null}
              {othersPercent > 0 ? (
                <div
                  className='h-full bg-[var(--surface-5)] transition-[width]'
                  style={{ width: `${othersPercent}%` }}
                />
              ) : null}
            </div>
          )}
          <div className='flex items-center justify-between gap-3 text-caption'>
            {hasAllocation ? (
              <span />
            ) : (
              <div className='flex items-center gap-3 text-[var(--text-muted)]'>
                <span className='inline-flex items-center gap-1.5'>
                  <span className='size-1.5 rounded-full bg-emerald-500' />
                  You
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span className='size-1.5 rounded-full bg-[var(--surface-5)]' />
                  Organization
                </span>
              </div>
            )}
            <span className='text-[var(--text-muted)] tabular-nums'>
              {allocationRemainingPercent.toFixed(1)}% remaining
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface BillingPersonalRemainingCreditsCardProps {
  totalCredits: number | null
  usedCredits: number
  remainingCredits: number | null
  isUnlimited: boolean
  hint?: string
  /** Right-rail label above used credits. Defaults to "Used by you". */
  usedLabel?: string
  /** Progress-bar legend label. Defaults to "You". */
  barLabel?: string
  /** Hide the used-by side stats (admin org-pool screenshot layout). */
  hideUsedStats?: boolean
  /** Tailwind class for the progress fill. Defaults to violet. */
  barColorClassName?: string
}

/**
 * Remaining-credits card for solo / personal billing (no organization pool).
 * Also reused for org-admin pool remaining with different labels.
 */
export function BillingPersonalRemainingCreditsCard({
  totalCredits,
  usedCredits,
  remainingCredits,
  isUnlimited,
  hint,
  usedLabel = 'Used by you',
  barLabel = 'You',
  hideUsedStats = false,
  barColorClassName = 'bg-violet-500',
}: BillingPersonalRemainingCreditsCardProps) {
  const usedPercent =
    isUnlimited || totalCredits == null || totalCredits <= 0
      ? 0
      : Math.min(100, Math.max(0, (usedCredits / totalCredits) * 100))
  const remainingPercent =
    isUnlimited || totalCredits == null ? 100 : Math.max(0, 100 - usedPercent)

  const totalLine =
    isUnlimited || totalCredits == null
      ? (hint ?? 'On-demand usage enabled')
      : hint?.startsWith('in ')
        ? `of ${formatCreditCount(totalCredits)} ${hint}`
        : `of ${formatCreditCount(totalCredits)}${hint ? ` · ${hint}` : ''}`

  return (
    <div className='rounded-xl border border-[var(--border-1)] bg-[var(--bg)] px-5 py-5'>
      <div
        className={cn(
          'flex flex-col gap-5',
          !hideUsedStats && 'sm:flex-row sm:items-start sm:justify-between'
        )}
      >
        <div className='flex min-w-0 flex-col gap-1'>
          <span className='font-medium text-[var(--text-muted)] text-caption uppercase tracking-wide'>
            Remaining credits
          </span>
          <span className='font-medium text-3xl text-[var(--text-body)] tabular-nums tracking-tight'>
            {isUnlimited || remainingCredits == null
              ? 'Unlimited'
              : formatCreditCount(remainingCredits)}
          </span>
          <span className='text-[var(--text-muted)] text-small'>{totalLine}</span>
        </div>

        {!hideUsedStats ? (
          <div className='flex flex-col gap-0.5 sm:items-end'>
            <span className='text-[var(--text-muted)] text-caption'>{usedLabel}</span>
            <span className='font-medium text-[var(--text-body)] text-small tabular-nums'>
              {formatCreditCount(usedCredits)}
            </span>
            {!isUnlimited && totalCredits != null && totalCredits > 0 ? (
              <span className='text-[var(--text-muted)] text-caption tabular-nums'>
                {formatSharePercent(usedCredits, totalCredits)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isUnlimited && totalCredits != null && totalCredits > 0 ? (
        <div className='mt-5 flex flex-col gap-2'>
          <div className='h-2 overflow-hidden rounded-full bg-[var(--surface-3)]'>
            <div
              className={cn('h-full rounded-full transition-[width]', barColorClassName)}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className='flex items-center justify-between gap-3 text-caption'>
            {!hideUsedStats ? (
              <span className='inline-flex items-center gap-1.5 text-[var(--text-muted)]'>
                <span className={cn('size-1.5 rounded-full', barColorClassName)} />
                {barLabel}
              </span>
            ) : (
              <span />
            )}
            <span className='font-medium text-[var(--text-secondary)] tabular-nums'>
              {remainingPercent.toFixed(1)}% remaining
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
