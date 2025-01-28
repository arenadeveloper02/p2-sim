// Imports
import { Input } from '@/components/ui/input'
import { useState, useRef, useEffect } from 'react'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'

// Component Props Interface
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
  // Hooks and State
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)

  // Auto-scroll effect for input
  useEffect(() => {
    if (inputRef.current && isFocused) {
      const input = inputRef.current
      const scrollPosition = (input.selectionStart ?? 0) * 8
      input.scrollLeft = scrollPosition - input.offsetWidth / 2
    }
  }, [value, isFocused])

  // Drag and Drop handlers
  const handleDrop = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))

      const isValidConnectionBlock =
        data.type === 'connectionBlock' &&
        data.connectionData.sourceBlockId === blockId

      if (!isValidConnectionBlock) return

      const currentValue = value?.toString() ?? ''
      const connectionName = data.connectionData.name
        .replace(' ', '')
        .toLowerCase()
      const outputSuffix =
        data.connectionData.outputType === 'any'
          ? 'res'
          : data.connectionData.outputType

      const newValue = `${currentValue}<${connectionName}.${outputSuffix}>`
      setValue(newValue)
    } catch (error) {
      console.error('Failed to parse drop data:', error)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault() // This is needed to allow drops
  }

  // Value display logic
  const displayValue =
    password && !isFocused
      ? '•'.repeat(value?.toString().length ?? 0)
      : value?.toString() ?? ''

  // Component render
  return (
    <Input
      ref={inputRef}
      className={cn(
        'w-full placeholder:text-muted-foreground/50 allow-scroll',
        isConnecting && 'border-blue-500'
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
