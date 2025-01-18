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

export function Dropdown({
  options,
  defaultValue,
  blockId,
  subBlockId,
}: DropdownProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  return (
    <Select
      defaultValue={defaultValue ?? options[0]}
      onValueChange={(value) => setValue(value)}
    >
      <SelectTrigger>
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
