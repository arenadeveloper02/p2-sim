import { Textarea } from '@/components/ui/textarea'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'
import { useState, useRef } from 'react'
import { SubBlockConfig } from '@/blocks/types'
import { formatDisplayText } from '@/components/ui/formatted-text'
import { EnvVarDropdown, checkEnvVarTrigger } from '@/components/ui/env-var-dropdown'

interface LongInputProps {
  placeholder?: string
  blockId: string
  subBlockId: string
  isConnecting: boolean
  config: SubBlockConfig
}

export function LongInput({
  placeholder,
  blockId,
  subBlockId,
  isConnecting,
  config,
}: LongInputProps) {
  const [value, setValue] = useSubBlockValue(blockId, subBlockId)
  const [showEnvVars, setShowEnvVars] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart ?? 0
    setValue(newValue)
    setCursorPosition(newCursorPosition)
    const { show, searchTerm } = checkEnvVarTrigger(newValue, newCursorPosition)
    setShowEnvVars(show)
    setSearchTerm(searchTerm)
  }

  // Sync scroll position between textarea and overlay
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  // Drag and Drop handlers
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
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

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
  }

  // Handle key combinations
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setShowEnvVars(false)
    }
  }

  return (
    <div className="relative w-full">
      <Textarea
        ref={textareaRef}
        className={cn(
          'w-full placeholder:text-muted-foreground/50 allow-scroll text-transparent caret-foreground break-words whitespace-pre-wrap',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'focus-visible:ring-blue-500 ring-2 ring-blue-500 ring-offset-2'
        )}
        rows={4}
        placeholder={placeholder ?? ''}
        value={value?.toString() ?? ''}
        onChange={handleChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setShowEnvVars(false)
          setSearchTerm('')
        }}
      />
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none px-3 py-2 overflow-auto whitespace-pre-wrap break-words scrollbar-none text-sm bg-transparent"
      >
        {formatDisplayText(value?.toString() ?? '')}
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
