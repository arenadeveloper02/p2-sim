import { Input } from '@/components/ui/input'
import { useState, useRef, useEffect } from 'react'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'

interface ShortInputProps {
  placeholder?: string
  password?: boolean
  blockId: string
  subBlockId: string
  isConnecting: boolean
}

export function ShortInput({
  blockId,
  subBlockId,
  placeholder,
  password,
  isConnecting,
}: ShortInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  useEffect(() => {
    if (inputRef.current && isFocused) {
      const input = inputRef.current
      const scrollPosition = (input.selectionStart ?? 0) * 8
      input.scrollLeft = scrollPosition - input.offsetWidth / 2
    }
  }, [value, isFocused])

  const handleDrop = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (
        data.type === 'connectionBlock' &&
        data.connectionData.sourceBlockId === blockId
      ) {
        const currentValue = value?.toString() ?? ''
        const newValue =
          currentValue +
          data.connectionData.name.replace(' ', '').toLowerCase() +
          (data.connectionData.outputType === 'any'
            ? '.res'
            : `.${data.connectionData.outputType}`)
        setValue(newValue)
      }
    } catch (error) {
      console.error('Failed to parse drop data:', error)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault() // This is needed to allow drops
  }

  const displayValue =
    password && !isFocused
      ? '•'.repeat(value?.toString().length ?? 0)
      : value?.toString() ?? ''

  return (
    <Input
      ref={inputRef}
      className={cn(
        'w-full placeholder:text-muted-foreground/50 allow-scroll',
        isConnecting && 'ring-2 ring-blue-500 ring-offset-2'
      )}
      placeholder={placeholder ?? ''}
      type="text"
      value={displayValue}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      autoComplete="off"
    />
  )
}
