import type { ReactNode } from 'react'
import { cn } from '@sim/emcn'
import {
  clampPercent,
  formatCreditCount,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

interface BillingUsageSourceRowProps {
  label: string
  credits: number
  percent: number
  icon: ReactNode
  barClassName: string
}

/**
 * Single source row with icon, label, progress bar, and credit count.
 */
export function BillingUsageSourceRow({
  label,
  credits,
  percent,
  icon,
  barClassName,
}: BillingUsageSourceRowProps) {
  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex items-center gap-2.5'>
        <div className='flex size-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--bg)]'>
          {icon}
        </div>
        <div className='flex min-w-0 flex-1 items-center justify-between gap-3'>
          <span className='text-[var(--text-body)] text-small'>{label}</span>
          <span className='text-[var(--text-muted)] text-small tabular-nums'>
            {formatCreditCount(credits)} credits ({clampPercent(percent).toFixed(1)}%)
          </span>
        </div>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-[var(--surface-3)]'>
        <div
          className={cn('h-full rounded-full transition-[width]', barClassName)}
          style={{ width: `${clampPercent(percent)}%` }}
        />
      </div>
    </div>
  )
}
