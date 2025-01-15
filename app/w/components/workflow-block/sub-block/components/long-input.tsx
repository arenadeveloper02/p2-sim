import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

interface LongInputProps {
  placeholder?: string
}

export function LongInput({ placeholder }: LongInputProps) {
  const [value, setValue] = useState('')

  return (
    <Textarea
      className="w-full resize-none placeholder:text-muted-foreground/50"
      rows={3}
      placeholder={placeholder ?? ''}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}
