'use client'

import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'

interface CalendarInputProps {
  blockId: string
  subBlockId: string
  title: string
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
}

export function DatePicker({
  blockId,
  subBlockId,
  title,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: CalendarInputProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)

  // Preview value for read-only mode
  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined

  // Determine selected date (might be Date or string)
  const rawDate = isPreview ? previewValue : storeValue

  // Safely parse to Date object
  const parsedDate = rawDate instanceof Date ? rawDate : rawDate ? new Date(rawDate) : undefined

  const [open, setOpen] = React.useState(false)

  const handleChange = (date: Date | undefined) => {
    if (!isPreview && !disabled) {
      setStoreValue(date)
      setOpen(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2 pt-1', layout === 'half' ? 'max-w-md' : 'w-full')}>
      {/* <Label htmlFor={`calendar-${subBlockId}`} className='px-1'>
        {title}
      </Label> */}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={`calendar-${subBlockId}`}
            variant='outline'
            className='w-full justify-between font-normal'
            disabled={disabled}
          >
            {parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())
              ? parsedDate.toLocaleDateString()
              : 'Select date'}
            <ChevronDownIcon className='ml-2 h-4 w-4 opacity-50' />
          </Button>
        </PopoverTrigger>

        <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
          <Calendar
            mode='single'
            selected={parsedDate}
            defaultMonth={
              parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())
                ? parsedDate
                : new Date()
            }
            onSelect={handleChange}
            captionLayout='dropdown'
            className='rounded-lg border shadow-sm'
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
