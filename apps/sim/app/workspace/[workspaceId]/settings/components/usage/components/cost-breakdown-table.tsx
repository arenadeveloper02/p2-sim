import type { ReactNode } from 'react'
import { cn } from '@/lib/core/utils/cn'
import { formatDollarAmount } from '@/app/workspace/[workspaceId]/settings/components/usage/format'

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

  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[32rem] border-collapse text-small'>
        <thead>
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
  rawCost: number
  showRaw?: boolean
}

/** Renders billable cost with optional raw cost when they differ. */
export function CostCell({ billableCost, rawCost, showRaw = true }: CostCellProps) {
  const hasRawDelta = showRaw && rawCost > 0 && Math.abs(rawCost - billableCost) > 0.0001

  return (
    <div className='flex flex-col items-end gap-0.5'>
      <span>{formatDollarAmount(billableCost)}</span>
      {hasRawDelta && (
        <span className='text-[var(--text-muted)] text-xs'>raw {formatDollarAmount(rawCost)}</span>
      )}
    </div>
  )
}
