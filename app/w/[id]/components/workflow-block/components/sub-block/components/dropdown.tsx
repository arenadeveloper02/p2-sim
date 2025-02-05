import { useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface DropdownProps {
  options: string[]
  defaultValue?: string
  blockId: string
  subBlockId: string
}

export function Dropdown({ options, defaultValue, blockId, subBlockId }: DropdownProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  // Set the value to the first option if it's not set
  useEffect(() => {
    if (!value && options.length > 0) {
      setValue(defaultValue ?? options[0])
    }
  }, [value, options, defaultValue, setValue])

  return (
    <Select
      value={value as string | undefined}
      defaultValue={defaultValue ?? options[0]}
      onValueChange={(value) => setValue(value)}
    >
      <SelectTrigger className="text-left">
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
