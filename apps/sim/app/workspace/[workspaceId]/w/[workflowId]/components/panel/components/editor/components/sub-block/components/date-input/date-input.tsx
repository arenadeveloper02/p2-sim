'use client'

import * as React from 'react'
import { DatePicker } from '@/components/emcn'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'

interface DateInputProps {
  blockId: string
  subBlockId: string
  placeholder?: string
  isPreview?: boolean
  previewValue?: string | null
  className?: string
  disabled?: boolean
}

/**
 * DateInput component for selecting dates in workflow blocks.
 * Uses the DatePicker component with calendar dropdown.
 */
export function DateInput({
  blockId,
  subBlockId,
  placeholder,
  isPreview = false,
  previewValue,
  className,
  disabled = false,
}: DateInputProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<string>(blockId, subBlockId)

  // Use preview value when in preview mode, otherwise use store value
  const value = isPreview ? previewValue : storeValue

  const handleDateChange = (dateString: string) => {
    if (isPreview || disabled) return
    setStoreValue(dateString)
  }

  return (
    <DatePicker
      value={value || undefined}
      onChange={handleDateChange}
      placeholder={placeholder || 'Select date'}
      disabled={isPreview || disabled}
      className={className}
    />
  )
}

