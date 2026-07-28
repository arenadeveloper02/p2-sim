'use client'

import { useMemo } from 'react'
import { cn } from '@sim/emcn'
import { formatBillableWithCredits } from '@/app/workspace/[workspaceId]/settings/components/usage/format'

/** Rows above this count get a capped, scrollable list (~8 visible bars). */
const SCROLL_ROW_THRESHOLD = 8

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
}

/**
 * Horizontal proportion bars for comparing billable cost across categories or workflows.
 * Lists with more than {@link SCROLL_ROW_THRESHOLD} rows scroll vertically.
 */
export function CostShareBars({
  rows,
  emptyMessage = 'No cost data for this period.',
}: CostShareBarsProps) {
  const chartRows = useMemo(
    () =>
      [...rows]
        .filter((row) => row.billableCost > 0)
        .sort((a, b) => b.billableCost - a.billableCost),
    [rows]
  )

  const maxCost = chartRows[0]?.billableCost ?? 0

  if (chartRows.length === 0 || maxCost <= 0) {
    return (
      <p className='py-6 text-center text-[var(--text-muted)] text-small'>{emptyMessage}</p>
    )
  }

  const scrollable = chartRows.length > SCROLL_ROW_THRESHOLD

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        scrollable && 'max-h-[22rem] overflow-y-auto pr-1 [scrollbar-gutter:stable]'
      )}
    >
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
