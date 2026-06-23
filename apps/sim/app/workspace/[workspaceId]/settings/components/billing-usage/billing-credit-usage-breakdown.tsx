import { cn } from '@/lib/core/utils/cn'
import type { CreditUsageBreakdown } from '@/lib/api/contracts/billing-credit-usage'

interface BillingCreditUsageBreakdownProps {
  summary: CreditUsageBreakdown
  showOther?: boolean
}

interface UsageRowProps {
  label: string
  credits: number
  percent: number
}

function UsageRow({ label, credits, percent }: UsageRowProps) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-[var(--text-body)] text-small'>{label}</span>
        <span className='text-[var(--text-muted)] text-small tabular-nums'>
          {credits.toLocaleString()} credits
        </span>
      </div>
      <div className='h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]'>
        <div
          className='h-full rounded-full bg-[var(--text-icon)] transition-[width]'
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Mothership vs workflow-run credit breakdown with proportional bars.
 */
export function BillingCreditUsageBreakdown({
  summary,
  showOther = true,
}: BillingCreditUsageBreakdownProps) {
  const total = Math.max(summary.totalCredits, 1)
  const rows: UsageRowProps[] = [
    {
      label: 'Mothership',
      credits: summary.mothershipCredits,
      percent: (summary.mothershipCredits / total) * 100,
    },
    {
      label: 'Workflow runs',
      credits: summary.workflowCredits,
      percent: (summary.workflowCredits / total) * 100,
    },
  ]

  if (showOther && summary.otherCredits > 0) {
    rows.push({
      label: 'Other',
      credits: summary.otherCredits,
      percent: (summary.otherCredits / total) * 100,
    })
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-[var(--text-body)] text-small'>Total consumed</span>
        <span className='font-medium text-[var(--text-body)] text-lg tabular-nums'>
          {summary.totalCredits.toLocaleString()}
          <span className='ml-1 font-normal text-[var(--text-muted)] text-small'>credits</span>
        </span>
      </div>
      <div className={cn('flex flex-col gap-4')}>
        {rows.map((row) => (
          <UsageRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  )
}
