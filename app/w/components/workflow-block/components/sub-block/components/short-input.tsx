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
  const [connections, setConnections] = useState<any[]>([])

  useEffect(() => {
    console.log(connections)
  }, [connections])

  useEffect(() => {
    if (inputRef.current && isFocused) {
      const input = inputRef.current
      const scrollPosition = (input.selectionStart ?? 0) * 8
      input.scrollLeft = scrollPosition - input.offsetWidth / 2
    }
  }, [value, isFocused])

  // Add regex pattern for connection syntax
  const connectionPattern = /<([a-z0-9]+)\.(string|number|boolean|res|any)>/g

  const updateConnections = (inputValue: string) => {
    const newConnections = Array.from(
      inputValue.matchAll(connectionPattern)
    ).map((match) => match[0].slice(1, -1)) // Remove < and >
    setConnections(Array.from(new Set(newConnections))) // Use Set to ensure uniqueness
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    updateConnections(newValue)
  }

  const handleDrop = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (
        data.type === 'connectionBlock' &&
        data.connectionData.sourceBlockId === blockId
      ) {
        const currentValue = value?.toString() ?? ''
        const formattedName = data.connectionData.name
          .replace(' ', '')
          .toLowerCase()
        const connectionType =
          data.connectionData.outputType === 'any'
            ? 'res'
            : data.connectionData.outputType
        const newConnection = formattedName + '.' + connectionType
        const newValue = currentValue + `<${newConnection}>`
        setValue(newValue)
        updateConnections(newValue)
      }
    } catch (error) {
      console.error('Failed to parse drop data:', error)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLInputElement>) => {
    e.preventDefault() // This is needed to allow drops
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && inputRef.current) {
      const cursorPosition: any = inputRef.current.selectionStart
      const currentValue = value?.toString() ?? ''

      // Check if cursor is right after a connection closing bracket
      for (const connection of connections) {
        const pattern = `<${connection}>`
        const index = currentValue.lastIndexOf(pattern, cursorPosition)

        if (index !== -1 && index + pattern.length === cursorPosition) {
          e.preventDefault()
          const newValue =
            currentValue.slice(0, index) +
            currentValue.slice(index + pattern.length)
          setValue(newValue)
          return
        }
      }
    }
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
      connections={connections}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      autoComplete="off"
    />
  )
}
