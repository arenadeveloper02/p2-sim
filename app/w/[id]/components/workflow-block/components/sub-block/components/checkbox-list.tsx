import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

interface CheckboxListProps {
  blockId: string
  subBlockId: string
  title: string
  options: { label: string; id: string }[]
  layout?: 'full' | 'half'
}

export function CheckboxList({
  blockId,
  subBlockId,
  title,
  options,
  layout,
}: CheckboxListProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  // Initialize values with all options set to false by default
  const values = (() => {
    const defaultValues = options.reduce(
      (acc, option) => ({
        ...acc,
        [option.id]: false,
      }),
      {}
    )

    return {
      ...defaultValues,
      ...(typeof value === 'object' && value !== null ? value : {}),
    }
  })() as Record<string, boolean>

  // Move initialization to useEffect
  useEffect(() => {
    if (value === null) {
      setValue(values)
    }
  }, [value, setValue, values])

  const handleCheckedChange = (id: string, checked: boolean) => {
    setValue({
      ...values,
      [id]: checked,
    })
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        layout === 'half' ? 'grid-cols-2' : 'grid-cols-1',
        'pt-1'
      )}
    >
      {options.map((option) => (
        <div key={option.id} className="flex items-center space-x-2">
          <Checkbox
            id={`${blockId}-${subBlockId}-${option.id}`}
            checked={Boolean(values[option.id])}
            onCheckedChange={(checked) =>
              handleCheckedChange(option.id, checked as boolean)
            }
          />
          <Label
            htmlFor={`${blockId}-${subBlockId}-${option.id}`}
            className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            {option.label}
          </Label>
        </div>
      ))}
    </div>
  )
}
