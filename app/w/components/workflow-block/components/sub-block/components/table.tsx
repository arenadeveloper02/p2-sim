import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { useRef, useEffect } from 'react'

interface TableProps {
  columns: string[]
  blockId: string
  subBlockId: string
}

interface TableRow {
  id: string
  cells: Record<string, string>
}

export function Table({ columns, blockId, subBlockId }: TableProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)
  const activePositionRef = useRef<{ rowIndex: number; column: string } | null>(
    null
  )

  useEffect(() => {
    if (activePositionRef.current && document.activeElement === document.body) {
      const { rowIndex, column } = activePositionRef.current
      const input = document.querySelector(
        `input[data-row="${rowIndex}"][data-column="${column}"]`
      ) as HTMLInputElement
      if (input) {
        input.focus()
      }
    }
  })

  // Initialize with empty row if no value exists
  const rows = (value as any[]) || [
    {
      id: crypto.randomUUID(),
      cells: Object.fromEntries(columns.map((col) => [col, ''])),
    },
  ]

  const handleCellChange = (
    rowIndex: number,
    column: string,
    value: string
  ) => {
    const updatedRows = rows.map((row, idx) =>
      idx === rowIndex
        ? {
            ...row,
            cells: { ...row.cells, [column]: value },
          }
        : row
    )

    // Add new row if typing in the last row
    if (rowIndex === rows.length - 1 && value !== '') {
      updatedRows.push({
        id: crypto.randomUUID(),
        cells: Object.fromEntries(columns.map((col) => [col, ''])),
      })
    }

    setValue(updatedRows)
  }

  const handleDeleteRow = (rowIndex: number) => {
    if (rows.length === 1) return // Don't delete if it's the last row
    setValue(rows.filter((_, index) => index !== rowIndex))
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {columns.map((column, index) => (
              <th
                key={column}
                className={cn(
                  'px-4 py-2 text-left text-sm font-medium',
                  index < columns.length - 1 && 'border-r'
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} className="border-t group relative">
              {columns.map((column, cellIndex) => (
                <td
                  key={`${row.id}-${column}`}
                  className={cn(
                    'p-1',
                    cellIndex < columns.length - 1 && 'border-r'
                  )}
                >
                  <Input
                    data-row={rowIndex}
                    data-column={column}
                    value={row.cells[column] || ''}
                    placeholder={column}
                    onChange={(e) =>
                      handleCellChange(rowIndex, column, e.target.value)
                    }
                    onFocus={() => {
                      activePositionRef.current = { rowIndex, column }
                    }}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-muted-foreground placeholder:text-muted-foreground/50 allow-scroll"
                  />
                </td>
              ))}
              {rows.length > 1 && (
                <td className="w-0 p-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-8 w-8 absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => handleDeleteRow(rowIndex)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
