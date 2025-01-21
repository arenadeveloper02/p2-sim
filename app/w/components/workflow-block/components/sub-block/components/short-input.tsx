import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface ShortInputProps {
  placeholder?: string
  password?: boolean
  blockId: string
  subBlockId: string
}

export function ShortInput({
  blockId,
  subBlockId,
  placeholder,
  password,
}: ShortInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  const displayValue =
    password && !isFocused
      ? '•'.repeat(value?.toString().length ?? 0)
      : value?.toString() ?? ''

  return (
    <Input
      className="w-full placeholder:text-muted-foreground/50 allow-scroll"
      placeholder={placeholder ?? ''}
      type="text"
      value={displayValue}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      autoComplete="off"
    />
  )
}
