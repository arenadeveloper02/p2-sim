import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface CodeLine {
  id: string
  content: string
}

const INITIAL_LINES = 1
const TAB_SIZE = 4
const TAB_SPACES = ' '.repeat(TAB_SIZE)
const LINE_HEIGHT = 32

interface SelectionState {
  start: number
  end: number
}

const MATCHING_PAIRS: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
  '"': '"',
  "'": "'",
  '`': '`',
}

function useCodeLines() {
  const [lines, setLines] = useState<CodeLine[]>(() =>
    Array(INITIAL_LINES)
      .fill(null)
      .map(() => ({
        id: crypto.randomUUID(),
        content: '',
      }))
  )
  const [currentLine, setCurrentLine] = useState(0)
  const [selection, setSelection] = useState<SelectionState | null>(null)

  const handleChange = useCallback((lineIndex: number, value: string) => {
    setLines((prevLines) => {
      const newLines = [...prevLines]
      newLines[lineIndex] = { ...newLines[lineIndex], content: value }

      if (
        lineIndex === newLines.length - 1 &&
        value !== '' &&
        value.length > prevLines[lineIndex].content.length
      ) {
        newLines.push({ id: crypto.randomUUID(), content: '' })
      }

      return newLines
    })
  }, [])

  return {
    lines,
    setLines,
    currentLine,
    setCurrentLine,
    handleChange,
    selection,
    setSelection,
  }
}

export function Code() {
  const {
    lines,
    setLines,
    currentLine,
    setCurrentLine,
    handleChange,
    selection,
    setSelection,
  } = useCodeLines()
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const contentWrapperRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [maxLineWidth, setMaxLineWidth] = useState(0)

  useEffect(() => {
    if (!contentWrapperRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(contentWrapperRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Update scroll handler to sync textareas with container
  const handleContainerScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollLeft = e.currentTarget.scrollLeft
      textareaRefs.current.forEach((textarea) => {
        if (textarea) {
          textarea.scrollLeft = scrollLeft
        }
      })
    },
    []
  )

  const handleAutoClose = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const closingChar = MATCHING_PAIRS[e.key]
      if (!closingChar) return false

      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const currentContent = lines[currentLine].content

      // Check if cursor is before a matching closing character
      if (start === end && currentContent[start] === closingChar) {
        // Just move the cursor past the existing closing character
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1
        }, 0)
        return true
      }

      // Handle selected text - wrap it in brackets/quotes
      if (start !== end) {
        const selectedText = currentContent.substring(start, end)
        const newContent =
          currentContent.substring(0, start) +
          e.key +
          selectedText +
          closingChar +
          currentContent.substring(end)

        const newLines = [...lines]
        newLines[currentLine] = {
          ...newLines[currentLine],
          content: newContent,
        }
        setLines(newLines)

        // Place cursor after the selected text but before closing character
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = end + 1
        }, 0)
        return true
      }

      // No selection - add opening and closing characters
      const newContent =
        currentContent.substring(0, start) +
        e.key +
        closingChar +
        currentContent.substring(end)

      const newLines = [...lines]
      newLines[currentLine] = {
        ...newLines[currentLine],
        content: newContent,
      }
      setLines(newLines)

      // Place cursor between the characters
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1
      }, 0)
      return true
    },
    [lines, currentLine, setLines]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleAutoClose(e)) {
      return
    }

    if (e.metaKey && e.key === 'a') {
      e.preventDefault()
      setSelection({ start: 0, end: lines.length - 1 })
      return
    }

    // Handle selection deletion
    if (e.key === 'Backspace' && selection) {
      e.preventDefault()
      const newLines = [
        ...lines.slice(0, selection.start),
        { id: crypto.randomUUID(), content: '' },
        ...lines.slice(selection.end + 1),
      ]
      setLines(newLines)
      setSelection(null)
      setCurrentLine(selection.start)

      // Focus the remaining line
      setTimeout(() => {
        const textarea = textareaRefs.current[selection.start]
        if (textarea) {
          textarea.focus()
          textarea.selectionStart = textarea.selectionEnd = 0
        }
      }, 0)
      return
    }

    // Clear selection when typing other keys
    if (selection) {
      setSelection(null)
    }

    if (e.key === 'Backspace') {
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      // Handle line deletion when cursor is at start of line
      if (start === 0 && end === 0 && currentLine > 0) {
        e.preventDefault()

        const previousLine = lines[currentLine - 1]
        const currentLineContent = lines[currentLine].content
        const previousLineLength = previousLine.content.length

        // Merge current line with previous line
        const newLines = [...lines]
        newLines[currentLine - 1] = {
          ...previousLine,
          content: previousLine.content + currentLineContent,
        }
        newLines.splice(currentLine, 1)

        setLines(newLines)
        setCurrentLine(currentLine - 1)

        // Set cursor position at the merge point
        setTimeout(() => {
          const textarea = textareaRefs.current[currentLine - 1]
          if (textarea) {
            textarea.focus()
            textarea.selectionStart = textarea.selectionEnd = previousLineLength
          }
        }, 0)
        return
      }

      // Handle matching pairs deletion
      if (start === end) {
        const currentContent = lines[currentLine].content
        const charBeforeCursor = currentContent[start - 1]
        const charAfterCursor = currentContent[start]

        if (MATCHING_PAIRS[charBeforeCursor] === charAfterCursor) {
          e.preventDefault()
          const newContent =
            currentContent.substring(0, start - 1) +
            currentContent.substring(start + 1)

          const newLines = [...lines]
          newLines[currentLine] = {
            ...newLines[currentLine],
            content: newContent,
          }
          setLines(newLines)

          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start - 1
          }, 0)
          return
        }
      }
    }

    if (e.key === 'ArrowUp' && currentLine > 0) {
      e.preventDefault()
      const newLine = currentLine - 1
      const currentPosition = e.currentTarget.selectionStart
      setCurrentLine(newLine)

      setTimeout(() => {
        const textarea = textareaRefs.current[newLine]
        if (textarea) {
          textarea.focus()
          textarea.selectionStart = textarea.selectionEnd = Math.min(
            currentPosition,
            lines[newLine].content.length
          )
        }
      }, 0)
    } else if (e.key === 'ArrowDown' && currentLine < lines.length - 1) {
      e.preventDefault()
      const newLine = currentLine + 1
      const currentPosition = e.currentTarget.selectionStart
      setCurrentLine(newLine)

      setTimeout(() => {
        const textarea = textareaRefs.current[newLine]
        if (textarea) {
          textarea.focus()
          textarea.selectionStart = textarea.selectionEnd = Math.min(
            currentPosition,
            lines[newLine].content.length
          )
        }
      }, 0)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      // Insert tab at cursor position
      const newLines = [...lines]
      newLines[currentLine] = {
        ...newLines[currentLine],
        content:
          newLines[currentLine].content.substring(0, start) +
          '    ' +
          newLines[currentLine].content.substring(end),
      }
      setLines(newLines)

      // Move cursor after tab
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4
      }, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart

      // Get the indentation level of the current line
      const currentIndentation =
        lines[currentLine].content.match(/^\s*/)?.[0] || ''

      // Check if cursor is between braces
      const currentContent = lines[currentLine].content
      const charBeforeCursor = currentContent[start - 1]
      const charAfterCursor = currentContent[start]
      const isBetweenBraces =
        charBeforeCursor === '{' && charAfterCursor === '}'

      if (isBetweenBraces) {
        // Split the content and create three lines
        const beforeCursor = currentContent.substring(0, start)
        const afterCursor = currentContent.substring(start)

        const newLines = [...lines]
        // Update current line to only have content before cursor
        newLines[currentLine] = {
          ...newLines[currentLine],
          content: beforeCursor,
        }

        // Insert new indented line
        newLines.splice(currentLine + 1, 0, {
          id: crypto.randomUUID(),
          content: currentIndentation + TAB_SPACES, // Add extra indentation
        })

        // Insert closing brace line
        newLines.splice(currentLine + 2, 0, {
          id: crypto.randomUUID(),
          content: currentIndentation + afterCursor,
        })

        setLines(newLines)
        setCurrentLine(currentLine + 1)

        // Focus the indented line
        setTimeout(() => {
          const nextTextarea = textareaRefs.current[currentLine + 1]
          if (nextTextarea) {
            nextTextarea.focus()
            nextTextarea.selectionStart = nextTextarea.selectionEnd =
              currentIndentation.length + TAB_SIZE
          }
        }, 0)
      } else {
        // Regular new line behavior with indentation preservation
        const newLines = [...lines]
        const currentContent = lines[currentLine].content
        newLines[currentLine] = {
          ...newLines[currentLine],
          content: currentContent.substring(0, start),
        }

        // Insert new line after current line
        newLines.splice(currentLine + 1, 0, {
          id: crypto.randomUUID(),
          content: currentIndentation + currentContent.substring(start),
        })

        setLines(newLines)
        setCurrentLine(currentLine + 1)

        // Set cursor position at the start of the new line after indentation
        setTimeout(() => {
          const nextTextarea = textareaRefs.current[currentLine + 1]
          if (nextTextarea) {
            nextTextarea.focus()
            nextTextarea.selectionStart = nextTextarea.selectionEnd =
              currentIndentation.length
          }
        }, 0)
      }
    }
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      const pastedText = e.clipboardData.getData('text')
      const pastedLines = pastedText.split('\n')

      // If there's a selection, replace the selected lines
      if (selection) {
        const newLines = [
          ...lines.slice(0, selection.start),
          ...pastedLines.map((content) => ({
            id: crypto.randomUUID(),
            content,
          })),
          ...lines.slice(selection.end + 1),
        ]
        setLines(newLines)
        setSelection(null)
        setCurrentLine(selection.start)

        // Focus the first line of pasted content
        setTimeout(() => {
          const textarea = textareaRefs.current[selection.start]
          if (textarea) {
            textarea.focus()
            textarea.selectionStart = textarea.selectionEnd = 0
          }
        }, 0)
        return
      }

      // Handle paste at current cursor position
      const textarea = textareaRefs.current[currentLine]
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const currentContent = lines[currentLine].content

      // Split current line content at cursor
      const beforeCursor = currentContent.substring(0, cursorPos)
      const afterCursor = currentContent.substring(textarea.selectionEnd)

      // Create new lines array
      const newLines = [
        ...lines.slice(0, currentLine),
        // First line combines with content before cursor
        { id: crypto.randomUUID(), content: beforeCursor + pastedLines[0] },
        // Middle lines (if any)
        ...pastedLines.slice(1, -1).map((content) => ({
          id: crypto.randomUUID(),
          content,
        })),
        // Last line combines with content after cursor
        {
          id: crypto.randomUUID(),
          content: pastedLines[pastedLines.length - 1] + afterCursor,
        },
        ...lines.slice(currentLine + 1),
      ]

      setLines(newLines)
      const newCurrentLine = currentLine + pastedLines.length - 1
      setCurrentLine(newCurrentLine)

      // Focus the last line of pasted content
      setTimeout(() => {
        const newTextarea = textareaRefs.current[newCurrentLine]
        if (newTextarea) {
          newTextarea.focus()
          newTextarea.selectionStart = newTextarea.selectionEnd =
            pastedLines[pastedLines.length - 1].length
        }
      }, 0)
    },
    [lines, currentLine, selection, setLines, setCurrentLine, setSelection]
  )

  const textareaClassName = useMemo(
    () =>
      cn(
        'w-full resize-none bg-transparent px-3 border-0',
        'focus:outline-none focus:ring-0',
        'text-muted-foreground placeholder:text-muted-foreground/50',
        'leading-none flex items-center',
        'whitespace-pre',
        selection && 'selection:bg-primary/20'
      ),
    [selection]
  )

  const textareaStyle = useMemo(
    () => ({
      height: `${LINE_HEIGHT}px`,
      minHeight: `${LINE_HEIGHT}px`,
      paddingTop: '8px',
      paddingBottom: '8px',
      margin: 0,
    }),
    []
  )

  // Add handler to prevent scroll propagation
  const handleScroll = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
  }, [])

  // Add effect to measure the longest line
  useEffect(() => {
    const measureText = (text: string) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return 0

      context.font = '14px monospace'
      const metrics = context.measureText(text)
      return metrics.width
    }

    const maxWidth = lines.reduce((max, line) => {
      const width = measureText(line.content)
      return Math.max(max, width)
    }, 0)

    setMaxLineWidth(maxWidth + 30)
  }, [lines])

  return (
    <div
      className="font-mono text-sm border rounded-md overflow-hidden relative"
      onWheel={handleScroll}
    >
      <div className="absolute top-0 left-0 z-50 h-full bg-background">
        {lines.map((_, i) => (
          <LineNumber key={`line-${i}`} number={i + 1} />
        ))}
      </div>

      <div ref={scrollContainerRef} className="relative h-full z-10">
        <div
          className="overflow-auto scrollbar-hide h-full"
          onScroll={handleContainerScroll}
          style={{
            maxWidth: `${Math.max(maxLineWidth + 35, contentWidth)}px`,
          }}
        >
          <div ref={contentWrapperRef} className="w-fit">
            {lines.map((line, i) => (
              <div
                key={line.id}
                className="flex pl-8 w-fit"
                style={{
                  width: `${Math.max(maxLineWidth + 35, contentWidth)}px`,
                }}
              >
                <textarea
                  ref={(el) => {
                    textareaRefs.current[i] = el
                  }}
                  rows={1}
                  value={line.content}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setCurrentLine(i)}
                  className={cn(
                    textareaClassName,
                    'overflow-hidden w-full',
                    selection &&
                      i >= selection.start &&
                      i <= selection.end &&
                      'bg-muted/30'
                  )}
                  style={textareaStyle}
                  wrap="off"
                  onPaste={handlePaste}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}

function LineNumber({ number }: { number: number }) {
  return (
    <div
      className="w-8 flex-none py-2 px-3 text-right text-muted-foreground/50 select-none border-r flex items-center justify-end"
      style={{ height: `${LINE_HEIGHT}px` }}
    >
      {number}
    </div>
  )
}
