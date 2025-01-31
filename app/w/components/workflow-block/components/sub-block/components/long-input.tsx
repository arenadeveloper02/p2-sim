import { Textarea } from '@/components/ui/textarea'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'
import { SubBlockConfig } from '@/blocks/types'

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

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

  const formatDisplayText = (text: string) => {
    if (!text) return null

    // Split the text by tag pattern <something.something>
    const parts = text.split(/(<[^>]+>)/g)

    return parts.map((part, index) => {
      // Check if the part matches tag pattern
      if (part.match(/^<[^>]+>$/)) {
        return (
          <span key={index} className="text-blue-500">
            {part}
          </span>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  return (
    <div className="relative w-full">
      <Textarea
        ref={textareaRef}
        className={cn(
          'w-full resize-none placeholder:text-muted-foreground/50 allow-scroll text-transparent caret-foreground break-words whitespace-pre-wrap',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'focus-visible:ring-blue-500 ring-2 ring-blue-500 ring-offset-2'
        )}
        rows={4}
        placeholder={placeholder ?? ''}
        value={value?.toString() ?? ''}
        onChange={(e) => setValue(e.target.value)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onScroll={handleScroll}
      />
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none px-3 py-2 overflow-auto whitespace-pre-wrap break-words scrollbar-none text-sm bg-transparent"
      >
        {formatDisplayText(value?.toString() ?? '')}
      </div>
    </div>
  )
}
