import { Input } from '@/components/ui/input'
import { useState, useRef, useEffect } from 'react'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'
import { SubBlockConfig } from '@/blocks/types'
import { formatDisplayText } from '@/components/ui/formatted-text'
import {
  EnvVarDropdown,
  checkEnvVarTrigger,
} from '@/components/ui/env-var-dropdown'
import { TagDropdown, checkTagTrigger } from '@/components/ui/tag-dropdown'

interface ShortInputProps {
  placeholder?: string
  password?: boolean
  blockId: string
  subBlockId: string
  isConnecting: boolean
  config: SubBlockConfig
  value?: string
  onChange?: (value: string) => void
}

export function ShortInput({
  blockId,
  subBlockId,
  placeholder,
  password,
  isConnecting,
  config,
  value: propValue,
  onChange,
}: ShortInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [showEnvVars, setShowEnvVars] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(
    null
  )

  // Use either controlled or uncontrolled value
  const value = propValue !== undefined ? propValue : storeValue

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart ?? 0

    if (onChange) {
      onChange(newValue)
    } else {
      setStoreValue(newValue)
    }

    setCursorPosition(newCursorPosition)

    // Check for environment variables trigger
    const envVarTrigger = checkEnvVarTrigger(newValue, newCursorPosition)
    setShowEnvVars(envVarTrigger.show)
    setSearchTerm(envVarTrigger.show ? envVarTrigger.searchTerm : '')

    // Check for tag trigger
    const tagTrigger = checkTagTrigger(newValue, newCursorPosition)
    setShowTags(tagTrigger.show)
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
  const handleDragOver = (e: React.DragEvent<HTMLInputElement>) => {
    if (config?.connectionDroppable === false) return
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent<HTMLInputElement>) => {
    if (config?.connectionDroppable === false) return
    e.preventDefault()

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type !== 'connectionBlock') return

      // Get current cursor position or append to end
      const dropPosition =
        inputRef.current?.selectionStart ?? value?.toString().length ?? 0

      // Insert '<' at drop position to trigger the dropdown
      const currentValue = value?.toString() ?? ''
      const newValue =
        currentValue.slice(0, dropPosition) +
        '<' +
        currentValue.slice(dropPosition)

      // Focus the input first
      inputRef.current?.focus()

      // Update all state in a single batch
      Promise.resolve().then(() => {
        setStoreValue(newValue)
        setCursorPosition(dropPosition + 1)
        setShowTags(true)

        // Pass the source block ID from the dropped connection
        if (data.connectionData?.sourceBlockId) {
          setActiveSourceBlockId(data.connectionData.sourceBlockId)
        }

        // Set cursor position after state updates
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = dropPosition + 1
            inputRef.current.selectionEnd = dropPosition + 1
          }
        }, 0)
      })
    } catch (error) {
      console.error('Failed to parse drop data:', error)
    }
  }

  // Handle key combinations
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowEnvVars(false)
      setShowTags(false)
    }
  }

  // Value display logic
  const displayValue =
    password && !isFocused
      ? '•'.repeat(value?.toString().length ?? 0)
      : value?.toString() ?? ''

  // Modify the EnvVarDropdown to use the correct setter
  const handleEnvVarSelect = (newValue: string) => {
    if (onChange) {
      onChange(newValue)
    } else {
      setStoreValue(newValue)
    }
  }

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
          setShowTags(false)
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
        onSelect={handleEnvVarSelect}
        searchTerm={searchTerm}
        inputValue={value?.toString() ?? ''}
        cursorPosition={cursorPosition}
        onClose={() => {
          setShowEnvVars(false)
          setSearchTerm('')
        }}
      />
      <TagDropdown
        visible={showTags}
        onSelect={handleEnvVarSelect}
        blockId={blockId}
        activeSourceBlockId={activeSourceBlockId}
        inputValue={value?.toString() ?? ''}
        cursorPosition={cursorPosition}
        onClose={() => {
          setShowTags(false)
          setActiveSourceBlockId(null)
        }}
      />
    </div>
  )
}
