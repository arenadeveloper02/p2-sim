import type { ReactNode } from 'react'
import { cn } from '@/lib/core/utils/cn'

interface BillingUsageMetricCardProps {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  iconClassName: string
}

/**
 * Summary metric card used in personal and organization billing usage views.
 */
export function BillingUsageMetricCard({
  label,
  value,
  hint,
  icon,
  iconClassName,
}: BillingUsageMetricCardProps) {
  return (
    <div className='flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-[var(--border-1)] bg-[var(--bg)] p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[var(--text-muted)] text-small'>{label}</p>
          <p className='mt-1 font-medium text-[var(--text-body)] text-lg tabular-nums'>{value}</p>
          {hint ? <p className='mt-0.5 text-[var(--text-muted)] text-small'>{hint}</p> : null}
        </div>
        <div
          className={cn(
            'flex size-9 flex-shrink-0 items-center justify-center rounded-full',
            iconClassName
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
