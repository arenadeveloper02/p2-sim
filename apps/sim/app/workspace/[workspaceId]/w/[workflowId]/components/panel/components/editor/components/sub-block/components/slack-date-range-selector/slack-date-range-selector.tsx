'use client'

import { DatePicker } from '@/components/emcn'
import { Combobox, type ComboboxOption } from '@/components/emcn/components'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'

interface SlackDateRangeSelectorProps {
  blockId: string
  subBlockId: string
  placeholder?: string
  isPreview?: boolean
  previewValue?: string | null
  disabled?: boolean
}

export function SlackDateRangeSelector({
  blockId,
  subBlockId,
  placeholder,
  isPreview = false,
  previewValue,
  disabled = false,
}: SlackDateRangeSelectorProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<string>(blockId, subBlockId)

  // Get values for related fields that need to be cleared
  const [, setFromDate] = useSubBlockValue<string>(blockId, 'fromDate')
  const [, setToDate] = useSubBlockValue<string>(blockId, 'toDate')

  // Use preview value when in preview mode, otherwise use store value
  const value = isPreview ? previewValue : storeValue

  const dateRangeOptions: ComboboxOption[] = [
    { label: 'today', value: '1' },
    { label: 'last 7 days', value: '7' },
    { label: 'last 14 days', value: '14' },
  ]

  const handleDateRangeChange = (selectedValue: string) => {
    if (isPreview || disabled) return

    setStoreValue(selectedValue)

    // If selecting a non-empty date range, clear fromDate and toDate
    if (selectedValue && selectedValue.trim() !== '') {
      setFromDate('')
      setToDate('')
    }
  }

  return (
    <Combobox
      options={dateRangeOptions}
      value={value || ''}
      onChange={handleDateRangeChange}
      placeholder={placeholder || 'Select date range'}
      disabled={disabled}
      editable={false}
    />
  )
}

interface SlackDateInputProps {
  blockId: string
  subBlockId: string
  placeholder?: string
  isPreview?: boolean
  previewValue?: string | null
  disabled?: boolean
}

export function SlackDateInput({
  blockId,
  subBlockId,
  placeholder,
  isPreview = false,
  previewValue,
  disabled = false,
}: SlackDateInputProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<string>(blockId, subBlockId)

  // Get values for related fields that need to be cleared
  const [, setDateRange] = useSubBlockValue<string>(blockId, 'dateRange')

  // Use preview value when in preview mode, otherwise use store value
  const value = isPreview ? previewValue : storeValue

  const handleDateChange = (dateString: string) => {
    if (isPreview || disabled) return

    setStoreValue(dateString)

    // If setting a non-empty date, clear the dateRange
    if (dateString && dateString.trim() !== '') {
      setDateRange('')
    }
  }

  return (
    <DatePicker
      value={value || ''}
      onChange={handleDateChange}
      placeholder={placeholder || 'Pick a date'}
      disabled={isPreview || disabled}
    />
  )
}