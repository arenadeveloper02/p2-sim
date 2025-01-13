import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface ShortInputProps {
  placeholder?: string
  password?: boolean
}

export function ShortInput({ placeholder, password }: ShortInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [value, setValue] = useState('')

  return (
    <Input
      className="w-full"
      placeholder={placeholder ?? ''}
      type={password && !isFocused ? 'password' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  )
}
