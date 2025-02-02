import { Input } from '@/components/ui/input'
import { useState, useRef, useEffect } from 'react'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'
import { SubBlockConfig } from '@/blocks/types'
import { formatDisplayText } from '@/components/ui/formatted-text'
import { EnvVarDropdown, checkEnvVarTrigger } from '@/components/ui/env-var-dropdown'

interface ShortInputProps {
  placeholder?: string
  password?: boolean
  blockId: string
  subBlockId: string
  isConnecting: boolean
  config: SubBlockConfig
}

export function ShortInput({
  blockId,
  subBlockId,
  placeholder,
  password,
  isConnecting,
  config,
}: ShortInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [showEnvVars, setShowEnvVars] = useState(false)
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart ?? 0
    setValue(newValue)
    setCursorPosition(newCursorPosition)
    const { show, searchTerm } = checkEnvVarTrigger(newValue, newCursorPosition)
    setShowEnvVars(show)
    setSearchTerm(searchTerm)
  }

  // Sync scroll position between input and overlay
  const handleScroll = (e: React.UIEvent<HTMLInputElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  // Update the auto-scroll effect to handle both input and overlay
  useEffect(() => {
    if (inputRef.current && isFocused) {
      const input = inputRef.current
      const scrollPosition = (input.selectionStart ?? 0) * 8
      input.scrollLeft = scrollPosition - input.offsetWidth / 2

      if (overlayRef.current) {
        overlayRef.current.scrollLeft = input.scrollLeft
      }
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
        .replace(/\s+/g, '')
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
    e.preventDefault()
  }

  // Handle key combinations
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowEnvVars(false)
    }
  }

  // Value display logic
  const displayValue =
    password && !isFocused
      ? '•'.repeat(value?.toString().length ?? 0)
      : value?.toString() ?? ''

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        className={cn(
          'w-full placeholder:text-muted-foreground/50 allow-scroll text-transparent caret-foreground',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'focus-visible:ring-blue-500 ring-2 ring-blue-500 ring-offset-2'
        )}
        placeholder={placeholder ?? ''}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => {
          setIsFocused(true)
          setShowEnvVars(false)
          setSearchTerm('')
        }}
        onBlur={() => setIsFocused(false)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none px-3 flex items-center overflow-x-auto whitespace-pre scrollbar-none text-sm bg-transparent"
      >
        {password && !isFocused
          ? '•'.repeat(value?.toString().length ?? 0)
          : formatDisplayText(value?.toString() ?? '')}
      </div>
      <EnvVarDropdown
        visible={showEnvVars}
        onSelect={setValue}
        searchTerm={searchTerm}
        inputValue={value?.toString() ?? ''}
        cursorPosition={cursorPosition}
        onClose={() => {
          setShowEnvVars(false)
          setSearchTerm('')
        }}
      />
    </div>
  )
}
