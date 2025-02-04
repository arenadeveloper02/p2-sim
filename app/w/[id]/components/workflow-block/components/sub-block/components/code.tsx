import { useState, useRef, useEffect } from 'react'
import Editor from 'react-simple-code-editor'
import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/themes/prism.css'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '../hooks/use-sub-block-value'
import { TagDropdown, checkTagTrigger } from '@/components/ui/tag-dropdown'

interface CodeProps {
  blockId: string
  subBlockId: string
  isConnecting: boolean
}

export function Code({ blockId, subBlockId, isConnecting }: CodeProps) {
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId)
  const [code, setCode] = useState('')
  const [lineCount, setLineCount] = useState(1)
  const [showTags, setShowTags] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(
    null
  )
  const editorRef = useRef<HTMLDivElement>(null)

  // Sync code with store value on initial load and when store value changes
  useEffect(() => {
    if (storeValue !== null) {
      setCode(storeValue.toString())
    }
  }, [storeValue])

  // Update line count when code changes
  useEffect(() => {
    const lines = code.split('\n').length
    setLineCount(lines)
  }, [code])

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
      const newValue =
        code.slice(0, dropPosition) + '<' + code.slice(dropPosition)

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

  return (
    <div
      className={cn(
        'font-mono text-sm border rounded-md overflow-visible relative',
        'bg-background text-muted-foreground',
        isConnecting && 'ring-2 ring-blue-500 ring-offset-2'
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Line numbers */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[30px] bg-muted/30 flex flex-col items-end pr-3 pt-3 select-none"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i + 1}
            className="text-xs text-muted-foreground leading-[21px]"
          >
            {i + 1}
          </div>
        ))}
      </div>

      <div ref={editorRef} className="pl-[30px] pt-0 mt-0 relative">
        <Editor
          value={code}
          onValueChange={(newCode) => {
            setCode(newCode)
            setStoreValue(newCode)

            // Check for tag trigger
            const textarea = editorRef.current?.querySelector('textarea')
            if (textarea) {
              const pos = textarea.selectionStart
              setCursorPosition(pos)
              const trigger = checkTagTrigger(newCode, pos)
              setShowTags(trigger.show)
              if (!trigger.show) {
                setActiveSourceBlockId(null)
              }
            }
          }}
          highlight={(code) =>
            highlight(code, languages.javascript, 'javascript')
          }
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
    </div>
  )
}
