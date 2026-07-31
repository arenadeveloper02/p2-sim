import type { ReactNode } from 'react'
import { cn } from '@sim/emcn'
import { formatBillableWithCredits } from '@/app/workspace/[workspaceId]/settings/components/usage/format'

/** Rows above this count get a capped, scrollable body so long tables stay compact. */
const SCROLL_ROW_THRESHOLD = 8

export interface CostBreakdownColumn<T> {
  key: string
  header: string
  className?: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

interface CostBreakdownTableProps<T> {
  columns: CostBreakdownColumn<T>[]
  rows: T[]
  emptyMessage?: string
  getRowKey: (row: T, index: number) => string
}

/**
 * Simple aligned table for usage cost breakdown rows.
 * Tables with more than {@link SCROLL_ROW_THRESHOLD} rows scroll vertically
 * (~8 visible rows) with a sticky header.
 */
export function CostBreakdownTable<T>({
  columns,
  rows,
  emptyMessage = 'No data for this period.',
  getRowKey,
}: CostBreakdownTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className='py-6 text-center text-[var(--text-muted)] text-small'>{emptyMessage}</p>
    )
  }

  const scrollable = rows.length > SCROLL_ROW_THRESHOLD

  return (
    <div
      className={cn(
        'overflow-x-auto',
        scrollable && 'max-h-[22rem] overflow-y-auto [scrollbar-gutter:stable]'
      )}
    >
      <table className='w-full min-w-[32rem] border-collapse text-small'>
        <thead className={cn(scrollable && 'sticky top-0 z-10 bg-[var(--bg)]')}>
          <tr className='border-[var(--border)] border-b'>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-3 py-2 font-medium text-[var(--text-muted)]',
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
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              className='border-[var(--border)] border-b last:border-b-0 hover-hover:bg-[var(--surface-2)]'
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-2 text-[var(--text-primary)]',
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
  )
}

interface CostCellProps {
  billableCost: number
  rawCost?: number
}

/** Renders billable cost as credits. */
export function CostCell({ billableCost }: CostCellProps) {
  return <span>{formatBillableWithCredits(billableCost)}</span>
}
