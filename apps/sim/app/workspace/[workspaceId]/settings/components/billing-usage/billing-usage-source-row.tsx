import { cn } from '@sim/emcn'
import {
  clampPercent,
  formatCreditCount,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

interface BillingUsageSourceRowProps {
  label: string
  credits: number
  percent: number
  /** Single-letter badge shown in the colored tile. */
  badge: string
  badgeClassName: string
  barClassName: string
}

/**
 * Single source row with letter badge, label, credit share, and progress bar.
 */
export function BillingUsageSourceRow({
  label,
  credits,
  percent,
  badge,
  badgeClassName,
  barClassName,
}: BillingUsageSourceRowProps) {
  const safePercent = clampPercent(percent)

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center gap-2.5'>
        <div
          className={cn(
            'flex size-7 flex-shrink-0 items-center justify-center rounded-md font-medium text-caption text-white',
            badgeClassName
          )}
        >
          {badge}
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3'>
          <span className='text-[var(--text-body)] text-small'>{label}</span>
          <span className='text-[var(--text-muted)] text-small tabular-nums'>
            {formatCreditCount(credits)} credits · {safePercent.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className='h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]'>
        <div
          className={cn('h-full rounded-full transition-[width]', barClassName)}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  )
}
