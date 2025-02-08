import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/themes/prism.css'
import Editor from 'react-simple-code-editor'
import { Button } from '@/components/ui/button'
import { EnvVarDropdown, checkEnvVarTrigger } from '@/components/ui/env-var-dropdown'
import { TagDropdown, checkTagTrigger } from '@/components/ui/tag-dropdown'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'

interface CodeProps {
  blockId: string
  subBlockId: string
  isConnecting: boolean
  minimizable?: boolean
}

export function Code({ blockId, subBlockId, isConnecting, minimizable }: CodeProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)
  const [code, setCode] = useState('')
  const [lineCount, setLineCount] = useState(1)
  const [showTags, setShowTags] = useState(false)
  const [showEnvVars, setShowEnvVars] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  // Add new state for tracking visual line heights
  const [visualLineHeights, setVisualLineHeights] = useState<number[]>([])

  // Sync code with store value on initial load and when store value changes
  useEffect(() => {
    if (storeValue !== null) {
      setCode(storeValue.toString())
    }
  }, [storeValue])

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

  // Handle drops from connection blocks
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type !== 'connectionBlock') return

      // Get current cursor position from the textarea
      const textarea = editorRef.current?.querySelector('textarea')
      const dropPosition = textarea?.selectionStart ?? code.length

      // Insert '<' at drop position to trigger the dropdown
      const newValue = code.slice(0, dropPosition) + '<' + code.slice(dropPosition)

      setCode(newValue)
      setStoreValue(newValue)
      setCursorPosition(dropPosition + 1)
      setShowTags(true)

      if (data.connectionData?.sourceBlockId) {
        setActiveSourceBlockId(data.connectionData.sourceBlockId)
      }

      // Set cursor position after state updates
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

  // Handle tag selection
  const handleTagSelect = (newValue: string) => {
    setCode(newValue)
    setStoreValue(newValue)
    setShowTags(false)
    setActiveSourceBlockId(null)
  }

  // Handle environment variable selection
  const handleEnvVarSelect = (newValue: string) => {
    setCode(newValue)
    setStoreValue(newValue)
    setShowEnvVars(false)
  }

  return (
    <div
      className={cn(
        'relative min-h-[100px] rounded-md border bg-background font-mono text-sm',
        isConnecting && 'ring-2 ring-blue-500 ring-offset-2'
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {minimizable && code.length > 0 && lineCount > 3 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      )}

      {isMinimized && minimizable && code.length > 0 ? (
        <div className="p-3 font-mono">
          <div className="relative overflow-hidden">
            <Editor
              value={code}
              onValueChange={() => {}}
              highlight={(code) => highlight(code, languages.javascript, 'javascript')}
              padding={0}
              style={{
                fontFamily: 'inherit',
                maxHeight: '80px',
                lineHeight: '21px',
              }}
              className="focus:outline-none pointer-events-none"
              textareaClassName="focus:outline-none focus:ring-0 bg-transparent opacity-50"
              readOnly
            />
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      ) : (
        <>
          {/* Line numbers */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[30px] bg-muted/30 flex flex-col items-end pr-3 pt-3 select-none"
            aria-hidden="true"
          >
            {renderLineNumbers()}
          </div>

          <div className="pl-[30px] pt-0 mt-0 relative" ref={editorRef}>
            {code.length === 0 && (
              <div className="absolute left-[42px] top-[12px] text-muted-foreground/50 select-none pointer-events-none">
                Write JavaScript...
              </div>
            )}
            <Editor
              value={code}
              onValueChange={(newCode) => {
                setCode(newCode)
                setStoreValue(newCode)

                // Check for tag trigger and environment variable trigger
                const textarea = editorRef.current?.querySelector('textarea')
                if (textarea) {
                  const pos = textarea.selectionStart
                  setCursorPosition(pos)

                  // Tag trigger check
                  const tagTrigger = checkTagTrigger(newCode, pos)
                  setShowTags(tagTrigger.show)
                  if (!tagTrigger.show) {
                    setActiveSourceBlockId(null)
                  }

                  // Environment variable trigger check
                  const envVarTrigger = checkEnvVarTrigger(newCode, pos)
                  setShowEnvVars(envVarTrigger.show)
                  setSearchTerm(envVarTrigger.show ? envVarTrigger.searchTerm : '')
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowTags(false)
                  setShowEnvVars(false)
                }
              }}
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

            {showEnvVars && (
              <EnvVarDropdown
                visible={showEnvVars}
                onSelect={handleEnvVarSelect}
                searchTerm={searchTerm}
                inputValue={code}
                cursorPosition={cursorPosition}
                onClose={() => {
                  setShowEnvVars(false)
                  setSearchTerm('')
                }}
              />
            )}

            {showTags && (
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
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
