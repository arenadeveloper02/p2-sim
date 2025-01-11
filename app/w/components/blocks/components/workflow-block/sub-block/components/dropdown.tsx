import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DropdownProps {
  options: string[]
  defaultValue?: string
}

export function Dropdown({ options, defaultValue }: DropdownProps) {
  return (
    <Select defaultValue={defaultValue ?? options[0]}>
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
