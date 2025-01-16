import { Input } from '@/components/ui/input'
import { useState } from 'react'

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
  const [value, setValue] = useState('')

  return (
    <Input
      className="w-full placeholder:text-muted-foreground/50"
      placeholder={placeholder ?? ''}
      type={password && !isFocused ? 'password' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  )
}
