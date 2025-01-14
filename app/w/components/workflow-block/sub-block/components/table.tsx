import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TableProps {
  columns: string[]
}

interface TableRow {
  id: string
  cells: string[]
}

export function Table({ columns }: TableProps) {
  const [rows, setRows] = useState<TableRow[]>([
    { id: crypto.randomUUID(), cells: Array(columns.length).fill('') },
  ])

  const handleCellChange = (
    rowIndex: number,
    cellIndex: number,
    value: string
  ) => {
    setRows((currentRows) => {
      const updatedRows = currentRows.map((row, idx) =>
        idx === rowIndex
          ? {
              ...row,
              cells: row.cells.map((cell, cidx) =>
                cidx === cellIndex ? value : cell
              ),
            }
          : row
      )

      // Add new row if typing in the last row
      if (rowIndex === currentRows.length - 1 && value !== '') {
        updatedRows.push({
          id: crypto.randomUUID(),
          cells: Array(columns.length).fill(''),
        })
      }

      return updatedRows
    })
  }

  const handleDeleteRow = (rowIndex: number) => {
    setRows((currentRows) => {
      // Don't delete if it's the last row
      if (currentRows.length === 1) return currentRows
      return currentRows.filter((_, index) => index !== rowIndex)
    })
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {columns.map((column, index) => (
              <th
                key={index}
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
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={`${row.id}-${cellIndex}`}
                  className={cn(
                    'p-1',
                    cellIndex < columns.length - 1 && 'border-r'
                  )}
                >
                  <Input
                    value={cell}
                    placeholder={columns[cellIndex]}
                    onChange={(e) =>
                      handleCellChange(rowIndex, cellIndex, e.target.value)
                    }
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-muted-foreground placeholder:text-muted-foreground/50"
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
