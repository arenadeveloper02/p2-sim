import React, { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/stores/workflow/store'

interface TagDropdownProps {
  visible: boolean
  onSelect: (newValue: string) => void
  blockId: string
  className?: string
  inputValue: string
  cursorPosition: number
  onClose?: () => void
}

export const TagDropdown: React.FC<TagDropdownProps> = ({
  visible,
  onSelect,
  blockId,
  className,
  inputValue,
  cursorPosition,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Get available tags from workflow state
  const blocks = useWorkflowStore((state) => state.blocks)
  const edges = useWorkflowStore((state) => state.edges)
  
  // Get source block and compute tags
  const { tags } = useMemo(() => {
    const sourceEdge = edges.find(edge => edge.target === blockId)
    const sourceBlock = sourceEdge ? blocks[sourceEdge.source] : null
    
    if (!sourceBlock) {
      return { tags: [] }
    }

    // Get all available output paths recursively
    const getOutputPaths = (obj: any, prefix = ''): string[] => {
      // If we're at a primitive type or null, return the current path
      if (typeof obj !== 'object' || obj === null) {
        return prefix ? [prefix] : []
      }

      // If we have a type field, this is a block output definition
      if ('type' in obj) {
        return getOutputPaths(obj.type, prefix)
      }

      // Otherwise, traverse the object's properties
      return Object.entries(obj).flatMap(([key, value]) => {
        const newPrefix = prefix ? `${prefix}.${key}` : key
        return getOutputPaths(value, newPrefix)
      })
    }

    // Get all output paths starting from the outputs object
    const outputPaths = getOutputPaths(sourceBlock.outputs)
    const blockName = sourceBlock.name || sourceBlock.type

    // Format tags with block name and output paths
    return {
      tags: outputPaths.map(path => `${blockName.replace(/\s+/g, '').toLowerCase()}.${path}`)
    }
  }, [blocks, edges, blockId])

  // Handle tag selection
  const handleTagSelect = (tag: string) => {
    const textBeforeCursor = inputValue.slice(0, cursorPosition)
    const textAfterCursor = inputValue.slice(cursorPosition)
    
    // Find the position of the last '<' before cursor
    const lastOpenBracket = textBeforeCursor.lastIndexOf('<')
    if (lastOpenBracket === -1) return
    
    const newValue = textBeforeCursor.slice(0, lastOpenBracket) + 
                    '<' + tag + '>' + 
                    textAfterCursor
    
    onSelect(newValue)
    onClose?.()
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!visible || tags.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < tags.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev)
        break
      case 'Enter':
        e.preventDefault()
        handleTagSelect(tags[selectedIndex])
        break
      case 'Escape':
        e.preventDefault()
        onClose?.()
        break
    }
  }

  // Add and remove keyboard event listener
  useEffect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible, selectedIndex, tags])

  // Don't render if not visible or no tags
  if (!visible || tags.length === 0) return null

  return (
    <div
      className={cn(
        "absolute z-[9999] w-full mt-1 overflow-hidden bg-popover rounded-md border shadow-md",
        className
      )}
    >
      <div className="py-1">
        {tags.map((tag, index) => (
          <button
            key={tag}
            className={cn(
              "w-full px-3 py-1.5 text-sm text-left",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:bg-accent focus:text-accent-foreground focus:outline-none",
              index === selectedIndex && "bg-accent text-accent-foreground"
            )}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault() // Prevent input blur
              handleTagSelect(tag)
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}

// Helper function to check for '<' trigger
export const checkTagTrigger = (text: string, cursorPosition: number): { show: boolean } => {
  if (cursorPosition >= 1) {
    const textBeforeCursor = text.slice(0, cursorPosition)
    const lastOpenBracket = textBeforeCursor.lastIndexOf('<')
    const lastCloseBracket = textBeforeCursor.lastIndexOf('>')
    
    // Show if we have an unclosed '<' that's not part of a completed tag
    if (lastOpenBracket !== -1 && (lastCloseBracket === -1 || lastCloseBracket < lastOpenBracket)) {
      return { show: true }
    }
  }
  return { show: false }
} 

