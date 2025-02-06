import { useEffect, useRef, useState } from 'react'
import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/themes/prism.css'
import Editor from 'react-simple-code-editor'
import { TagDropdown, checkTagTrigger } from '@/components/ui/tag-dropdown'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface CodeProps {
  blockId: string
  subBlockId: string
  isConnecting: boolean
  inConditionSubBlock?: boolean
  value?: string
  onChange?: (value: string) => void
  controlled?: boolean
  onSourceBlockIdChange?: (blockId: string | null) => void
}

export function Code({
  blockId,
  subBlockId,
  isConnecting,
  inConditionSubBlock,
  value: controlledValue,
  onChange,
  controlled = false,
  onSourceBlockIdChange,
}: CodeProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)
  const [code, setCode] = useState('')
  const [lineCount, setLineCount] = useState(1)
  const [showTags, setShowTags] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  // Add new state for tracking visual line heights
  const [visualLineHeights, setVisualLineHeights] = useState<number[]>([])

  // Modify the useEffect to handle both controlled and uncontrolled modes
  useEffect(() => {
    if (controlled) {
      setCode(controlledValue || '')
    } else if (storeValue !== null) {
      setCode(storeValue.toString())
    }
  }, [storeValue, controlledValue, controlled])

  // Update the line counting logic to account for wrapped lines
  useEffect(() => {
    if (!editorRef.current) return

    const calculateVisualLines = () => {
      // Get the actual rendered pre element from the editor
      const preElement = editorRef.current?.querySelector('pre')
      if (!preElement) return

      const lines = code.split('\n')
      const newVisualLineHeights: number[] = []

      // Create a hidden container with the same width as the editor
      const container = document.createElement('div')
      container.style.cssText = `
        position: absolute;
        visibility: hidden;
        width: ${preElement.clientWidth}px;
        font-family: ${window.getComputedStyle(preElement).fontFamily};
        font-size: ${window.getComputedStyle(preElement).fontSize};
        padding: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      `
      document.body.appendChild(container)

      // Process each line
      lines.forEach((line) => {
        // Create a div for each line
        const lineDiv = document.createElement('div')

        if (line.includes('<') && line.includes('>')) {
          // Special handling for lines with angle brackets
          const parts = line.split(/(<[^>]+>)/g)
          parts.forEach((part) => {
            const span = document.createElement('span')
            span.textContent = part
            if (part.startsWith('<') && part.endsWith('>')) {
              span.style.color = 'rgb(153, 0, 85)' // Match Prism.js token color
            }
            lineDiv.appendChild(span)
          })
        } else {
          lineDiv.textContent = line || ' '
        }

        container.appendChild(lineDiv)

        // Calculate height in terms of line units (21px per line)
        const actualHeight = lineDiv.getBoundingClientRect().height
        const lineUnits = Math.ceil(actualHeight / 21)
        newVisualLineHeights.push(lineUnits)

        container.removeChild(lineDiv)
      })

      document.body.removeChild(container)
      setVisualLineHeights(newVisualLineHeights)

      const totalVisualLines = newVisualLineHeights.reduce((sum, height) => sum + height, 0)
      setLineCount(totalVisualLines)
    }

    calculateVisualLines()

    const resizeObserver = new ResizeObserver(calculateVisualLines)
    resizeObserver.observe(editorRef.current)

    return () => resizeObserver.disconnect()
  }, [code])

  // Modify the line numbers rendering to account for wrapped lines
  const renderLineNumbers = () => {
    const numbers: JSX.Element[] = []
    let lineNumber = 1

    visualLineHeights.forEach((height) => {
      for (let i = 0; i < height; i++) {
        numbers.push(
          <div
            key={`${lineNumber}-${i}`}
            className={cn(
              'text-xs text-muted-foreground leading-[21px]',
              // Only show number on first line of wrapped content
              i > 0 && 'invisible'
            )}
          >
            {lineNumber}
          </div>
        )
      }
      lineNumber++
    })

    return numbers
  }

  const handleCodeChange = (newCode: string) => {
    setCode(newCode)
    if (controlled) {
      onChange?.(newCode)
    } else {
      setStoreValue(newCode)
    }

    // Get the textarea element
    const textarea = editorRef.current?.querySelector('textarea')
    if (textarea) {
      // Important: Use requestAnimationFrame to ensure we get the updated cursor position
      requestAnimationFrame(() => {
        const pos = textarea.selectionStart
        setCursorPosition(pos)

        const trigger = checkTagTrigger(newCode, pos)
        setShowTags(trigger.show)
        if (!trigger.show) {
          setActiveSourceBlockId(null)
          onSourceBlockIdChange?.(null)
        }
      })
    }
  }

  // Add an onKeyDown handler to ensure we catch the '<' character immediately
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '<') {
      const textarea = e.target as HTMLTextAreaElement
      const pos = textarea.selectionStart
      const newCode = code.slice(0, pos) + '<' + code.slice(pos)

      setCode(newCode)
      if (controlled) {
        onChange?.(newCode)
      } else {
        setStoreValue(newCode)
      }

      setCursorPosition(pos + 1)
      setShowTags(true)
    }
  }

  // Handle tag selection
  const handleTagSelect = (newValue: string) => {
    setCode(newValue)
    if (controlled) {
      onChange?.(newValue)
    } else {
      setStoreValue(newValue)
    }
    setShowTags(false)
    setActiveSourceBlockId(null)
    onSourceBlockIdChange?.(null)
  }

  // Modify handleDrop to support both controlled and uncontrolled modes
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type !== 'connectionBlock') return

      const textarea = editorRef.current?.querySelector('textarea')
      const dropPosition = textarea?.selectionStart ?? code.length

      const newValue = code.slice(0, dropPosition) + '<' + code.slice(dropPosition)

      setCode(newValue)
      if (controlled) {
        onChange?.(newValue)
      } else {
        setStoreValue(newValue)
      }

      setCursorPosition(dropPosition + 1)
      setShowTags(true)

      if (data.connectionData?.sourceBlockId) {
        setActiveSourceBlockId(data.connectionData.sourceBlockId)
        onSourceBlockIdChange?.(data.connectionData.sourceBlockId)
      }

      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = dropPosition + 1
          textarea.selectionEnd = dropPosition + 1
          textarea.focus()
        }
      }, 0)
    } catch (error) {
      console.error('Failed to parse drop data:', error)
    }
  }

  return (
    <div
      className={cn(
        !inConditionSubBlock && 'border',
        'font-mono text-sm rounded-md overflow-visible relative',
        'bg-background text-muted-foreground',
        isConnecting && !inConditionSubBlock && 'ring-2 ring-blue-500 ring-offset-2'
      )}
      onDragOver={(e) => !inConditionSubBlock && e.preventDefault()}
      onDrop={(e) => !inConditionSubBlock && handleDrop(e)}
    >
      {/* Updated line numbers */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[30px] bg-muted/30 flex flex-col items-end pr-3 pt-3 select-none"
        aria-hidden="true"
      >
        {renderLineNumbers()}
      </div>

      <div ref={editorRef} className="pl-[30px] pt-0 mt-0 relative">
        {code.length === 0 && (
          <div className="absolute left-[42px] top-[12px] text-muted-foreground/50 select-none pointer-events-none">
            {inConditionSubBlock ? '<response> === true' : 'Write JavaScript...'}
          </div>
        )}
        <Editor
          value={code}
          onValueChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          highlight={(code) => highlight(code, languages.javascript, 'javascript')}
          padding={12}
          style={{
            fontFamily: 'inherit',
            minHeight: '46px',
            lineHeight: '21px',
          }}
          className="focus:outline-none"
          textareaClassName="focus:outline-none focus:ring-0 bg-transparent"
        />

        {showTags && (
          <div className="absolute left-0 right-0 top-full z-50">
            <TagDropdown
              visible={showTags}
              onSelect={handleTagSelect}
              blockId={blockId}
              activeSourceBlockId={activeSourceBlockId}
              inputValue={code}
              cursorPosition={cursorPosition}
              onClose={() => {
                setShowTags(false)
                setActiveSourceBlockId(null)
                onSourceBlockIdChange?.(null)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
