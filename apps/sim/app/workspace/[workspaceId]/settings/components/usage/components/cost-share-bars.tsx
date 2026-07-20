'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/core/utils/cn'
import { formatBillableWithCredits } from '@/app/workspace/[workspaceId]/settings/components/usage/format'

export interface CostShareBarRow {
  id: string
  label: string
  billableCost: number
  href?: string
  secondary?: string
}

interface CostShareBarsProps {
  rows: CostShareBarRow[]
  emptyMessage?: string
  /** Cap how many bars to show; remainder folds into an "Other" bucket. */
  maxBars?: number
}

/**
 * Horizontal proportion bars for comparing billable cost across categories or workflows.
 */
export function CostShareBars({
  rows,
  emptyMessage = 'No cost data for this period.',
  maxBars = 8,
}: CostShareBarsProps) {
  const chartRows = useMemo(() => {
    const sorted = [...rows]
      .filter((row) => row.billableCost > 0)
      .sort((a, b) => b.billableCost - a.billableCost)

    if (sorted.length === 0) return []
    if (sorted.length <= maxBars) return sorted

    const visible = sorted.slice(0, maxBars - 1)
    const remaining = sorted.slice(maxBars - 1)
    const otherCost = remaining.reduce((sum, row) => sum + row.billableCost, 0)
    return [
      ...visible,
      {
        id: '__other__',
        label: `Other (${remaining.length})`,
        billableCost: otherCost,
      },
    ]
  }, [maxBars, rows])

  const maxCost = chartRows[0]?.billableCost ?? 0

  if (chartRows.length === 0 || maxCost <= 0) {
    return (
      <p className='py-6 text-center text-[var(--text-muted)] text-small'>{emptyMessage}</p>
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      {chartRows.map((row) => {
        const widthPercent = Math.max((row.billableCost / maxCost) * 100, 2)
        const label = (
          <span className='truncate text-[var(--text-primary)] text-small'>{row.label}</span>
        )

        return (
          <div key={row.id} className='flex flex-col gap-1'>
            <div className='flex items-baseline justify-between gap-3'>
              {row.href ? (
                <a
                  href={row.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='min-w-0 truncate text-[var(--text-primary)] text-small underline-offset-2 hover-hover:underline'
                >
                  {row.label}
                </a>
              ) : (
                label
              )}
              <div className='flex shrink-0 items-baseline gap-2'>
                {row.secondary && (
                  <span className='text-[var(--text-muted)] text-xs'>{row.secondary}</span>
                )}
                <span className='tabular-nums text-[var(--text-secondary)] text-small'>
                  {formatBillableWithCredits(row.billableCost)}
                </span>
              </div>
            </div>
            <div className='h-2 overflow-hidden rounded-full bg-[var(--surface-3)]'>
              <div
                className={cn('h-full rounded-full bg-[var(--brand-secondary)]')}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
