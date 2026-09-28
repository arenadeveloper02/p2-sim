'use client'

import type { ReactNode } from 'react'
import { cn } from '@sim/emcn'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import { formatCreditCount } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

const SCROLL_ROW_THRESHOLD = 8

export interface UsageRankColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  className?: string
  render: (row: T) => ReactNode
}

export interface UsageRankTableProps<T> {
  rows: T[]
  columns: UsageRankColumn<T>[]
  getRowKey: (row: T, index: number) => string
  /** Billable USD used to rank rows when {@link getRankValue} is omitted. */
  getBillableCost: (row: T) => number
  /**
   * Optional rank/filter value. Defaults to billable cost.
   */
  getRankValue?: (row: T) => number
  emptyMessage?: string
}

/**
 * Ranking table for Usage activity detail. First column header is the section
 * name (By Workflow / By User / By Tools).
 */
export function UsageRankTable<T>({
  rows,
  columns,
  getRowKey,
  getBillableCost,
  getRankValue,
  emptyMessage = 'No usage recorded for this period.',
}: UsageRankTableProps<T>) {
  const resolveRank = getRankValue ?? getBillableCost
  const ranked = [...rows]
    .filter((row) => resolveRank(row) > 0)
    .sort((a, b) => resolveRank(b) - resolveRank(a))

  const scrollable = ranked.length > SCROLL_ROW_THRESHOLD

  return (
    <div className='overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]'>
      {ranked.length === 0 ? (
        <p className='px-4 py-8 text-center text-[var(--text-muted)] text-small'>{emptyMessage}</p>
      ) : (
        <div
          className={cn(
            'overflow-x-auto',
            scrollable && 'max-h-[22rem] overflow-y-auto [scrollbar-gutter:stable]'
          )}
        >
          <table className='w-full min-w-[36rem] border-collapse text-small'>
            <thead className={cn(scrollable && 'sticky top-0 z-10 bg-[var(--bg)]')}>
              <tr className='border-[var(--border)] border-b'>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-4 py-2.5 font-medium text-[var(--text-muted)]',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.className
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, index) => (
                <tr
                  key={getRowKey(row, index)}
                  className='border-[var(--border)] border-b last:border-b-0'
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 text-[var(--text-primary)]',
                        column.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                        column.className
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Credits cell for admin rank tables — integer credits, no unit suffix (matches SS). */
export function UsageRankCreditsCell({ billableCost }: { billableCost: number }) {
  return (
    <span className='font-medium tabular-nums'>
      {formatCreditCount(dollarsToCredits(billableCost))}
    </span>
  )
}
