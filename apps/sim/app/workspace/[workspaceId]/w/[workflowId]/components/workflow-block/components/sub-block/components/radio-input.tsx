import { useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'

interface RadioInputProps {
  blockId: string
  subBlockId: string
  title: string
  options: { label: string; id: string }[]
  layout?: 'full' | 'half'
  isPreview?: boolean
  subBlockValues?: Record<string, any>
  disabled?: boolean
  defaultValue?: string
}

export function RadioInput({
  blockId,
  subBlockId,
  title,
  defaultValue,
  options,
  layout,
  isPreview = false,
  subBlockValues,
  disabled = false,
}: RadioInputProps) {
  // Using the subBlockId for the selected radio value instead of option.id
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)

  // Get preview value for this sub-block when in preview mode
  const previewValue = isPreview && subBlockValues ? subBlockValues[subBlockId]?.value : undefined

  // Use preview value when in preview mode, otherwise use stored value
  const selectedValue = isPreview ? previewValue : storeValue

  useEffect(() => {
    if (!selectedValue && defaultValue) {
      setStoreValue(defaultValue)
    }
  }, [defaultValue, selectedValue])

  const handleChange = (value: string) => {
    if (!isPreview && !disabled) {
      setStoreValue(value)
    }
  }

  return (
    <RadioGroup
      className={cn('grid gap-4', layout === 'half' ? 'grid-cols-2' : 'grid-cols-1', 'pt-1')}
      value={selectedValue}
      onValueChange={handleChange}
      disabled={isPreview || disabled}
    >
      {options.map((option) => (
        <div key={option.id} className='flex items-center space-x-2'>
          <RadioGroupItem
            id={`${blockId}-${option.id}`}
            value={option.id}
            disabled={isPreview || disabled}
          />
          <Label
            htmlFor={`${blockId}-${option.id}`}
            className='cursor-pointer font-normal text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
          >
            {option.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}
