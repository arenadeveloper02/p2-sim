import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronsUpDown, Wand2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useReactFlow } from 'reactflow'
import { Button } from '@/components/ui/button'
import { checkEnvVarTrigger, EnvVarDropdown } from '@/components/ui/env-var-dropdown'
import { formatDisplayText } from '@/components/ui/formatted-text'
import { checkTagTrigger, TagDropdown } from '@/components/ui/tag-dropdown'
import { Textarea } from '@/components/ui/textarea'
import { createLogger } from '@/lib/logs/console/logger'
import { cn } from '@/lib/utils'
import { WandPromptBar } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/wand-prompt-bar/wand-prompt-bar'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { useWand } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-wand'
import type { SubBlockConfig } from '@/blocks/types'
import { useTagSelection } from '@/hooks/use-tag-selection'

const logger = createLogger('LongInput')

interface LongInputProps {
  placeholder?: string
  blockId: string
  subBlockId: string
  isConnecting: boolean
  config: SubBlockConfig
  rows?: number
  isPreview?: boolean
  previewValue?: string | null
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
}

// Constants
const DEFAULT_ROWS = 4
const ROW_HEIGHT_PX = 24
const MIN_HEIGHT_PX = 80

/**
 * LongInput Component
 *
 * A multi-line textarea with formatted text overlay for syntax highlighting.
 *
 * Architecture:
 * 1. Base Textarea: User input with transparent text (shows only cursor)
 * 2. Overlay Div: Positioned absolutely on top, displays formatted/highlighted text
 * 3. Scroll Synchronization: Keeps overlay aligned with textarea using percentage-based scrolling
 *
 * Why percentage-based scrolling?
 * The textarea and overlay may have slightly different scrollHeights (~20px difference) due to:
 * - Browser rendering differences between <textarea> and <div> elements
 * - Border/padding box model calculations
 * - Font rendering variations
 *
 * Instead of copying exact scrollTop values (which would cause misalignment),
 * we calculate the scroll position as a percentage and apply it proportionally.
 *
 * Example:
 * - Textarea: scrollTop=2900, scrollHeight=3019, clientHeight=118
 *   → maxScroll = 2901, percentage = 2900/2901 = 99.96%
 * - Overlay: scrollHeight=2998, clientHeight=120
 *   → maxScroll = 2878, scrollTop = 0.9996 × 2878 = 2877
 *
 * This ensures both elements scroll proportionally, keeping text aligned with the cursor.
 */
export function LongInput({
  placeholder,
  blockId,
  subBlockId,
  isConnecting,
  config,
  rows,
  isPreview = false,
  previewValue,
  value: propValue,
  onChange,
  disabled,
}: LongInputProps) {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  // Local state for immediate UI updates during streaming
  const [localContent, setLocalContent] = useState<string>('')

  // Wand functionality (only if wandConfig is enabled) - define early to get streaming state
  const wandHook = config.wandConfig?.enabled
    ? useWand({
        wandConfig: config.wandConfig,
        currentValue: localContent,
        onStreamStart: () => {
          // Clear the content when streaming starts
          setLocalContent('')
        },
        onStreamChunk: (chunk) => {
          // Update local content with each chunk as it arrives
          setLocalContent((current) => current + chunk)
        },
        onGeneratedContent: (content) => {
          // Final content update (fallback)
          setLocalContent(content)
        },
      })
    : null

  // State management - useSubBlockValue with explicit streaming control
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlockId, false, {
    isStreaming: wandHook?.isStreaming || false, // Use wand streaming state
    onStreamingEnd: () => {
      logger.debug('Wand streaming ended, value persisted', { blockId, subBlockId })
    },
  })

  const emitTagSelection = useTagSelection(blockId, subBlockId)

  const [showEnvVars, setShowEnvVars] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use preview value when in preview mode, otherwise use store value or prop value
  const baseValue = isPreview ? previewValue : propValue !== undefined ? propValue : storeValue

  // During streaming, use local content; otherwise use base value
  const value = wandHook?.isStreaming ? localContent : baseValue

  // Sync local content with base value when not streaming
  useEffect(() => {
    if (!wandHook?.isStreaming) {
      const baseValueString = baseValue?.toString() ?? ''
      if (baseValueString !== localContent) {
        setLocalContent(baseValueString)
      }
    }
  }, [baseValue, wandHook?.isStreaming]) // Removed localContent to prevent infinite loop

  // Update store value during streaming (but won't persist until streaming ends)
  useEffect(() => {
    if (wandHook?.isStreaming && localContent !== '') {
      if (!isPreview && !disabled) {
        setStoreValue(localContent)
      }
    }
  }, [localContent, wandHook?.isStreaming, isPreview, disabled, setStoreValue])

  // Calculate initial height based on rows prop with reasonable defaults
  const getInitialHeight = () => {
    // Use provided rows or default, then convert to pixels with a minimum
    const rowCount = rows || DEFAULT_ROWS
    return Math.max(rowCount * ROW_HEIGHT_PX, MIN_HEIGHT_PX)
  }

  const [height, setHeight] = useState(getInitialHeight())
  const isResizing = useRef(false)

  // Get ReactFlow instance for zoom control
  const reactFlowInstance = useReactFlow()

  /**
   * Helper function to ensure trailing newlines are rendered
   *
   * Problem: When text ends with \n, React/DOM doesn't render the empty line
   * Solution: Append a zero-width space (\u200B) after trailing newlines
   * This forces the browser to render the empty line while remaining invisible
   */
  const ensureTrailingNewlineVisible = (text: string) => {
    // If text ends with one or more newlines, append zero-width space
    if (text.endsWith('\n')) {
      return `${text}\u200B`
    }
    return text
  }

  // Set initial height on first render
  useLayoutEffect(() => {
    const initialHeight = getInitialHeight()
    setHeight(initialHeight)

    if (textareaRef.current && overlayRef.current) {
      textareaRef.current.style.height = `${initialHeight}px`
      overlayRef.current.style.height = `${initialHeight}px`
    }
  }, [rows])

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Don't allow changes if disabled or streaming
    if (disabled || wandHook?.isStreaming) return

    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart ?? 0

    // Update local content immediately
    setLocalContent(newValue)

    if (onChange) {
      onChange(newValue)
    } else if (!isPreview) {
      // Only update store when not in preview mode
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

  /**
   * Sync scroll position between textarea and overlay
   *
   * Why percentage-based scrolling?
   * The textarea and overlay may have slightly different scrollHeights due to:
   * - Border rendering differences
   * - Text rendering engine variations
   * - Box model calculation differences
   *
   * Using percentage ensures the overlay scrolls proportionally with the textarea,
   * keeping the formatted text aligned with the cursor position even when
   * scrolling up from the bottom.
   */
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const overlay = overlayRef.current

    if (overlay && textarea) {
      // Calculate the maximum scrollable distance for the textarea
      // scrollHeight = total content height, clientHeight = visible height
      const maxScroll = textarea.scrollHeight - textarea.clientHeight

      // Calculate what percentage of the total scroll distance we're at
      // E.g., if scrolled 2900px out of 2901px max, percentage = 99.96%
      const scrollPercentage = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0

      // Calculate the maximum scrollable distance for the overlay
      const overlayMaxScroll = overlay.scrollHeight - overlay.clientHeight

      // Apply the same scroll percentage to the overlay
      // This ensures proportional scrolling even if heights differ slightly
      overlay.scrollTop = scrollPercentage * overlayMaxScroll
      overlay.scrollLeft = textarea.scrollLeft
    }
  }

  /**
   * Ensure overlay maintains scroll position when content changes
   *
   * This effect runs whenever the value changes (e.g., during typing or AI generation).
   * It recalculates and preserves the scroll position using the same percentage-based
   * approach to keep the overlay in sync as content is added or removed.
   */
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current

    if (textarea && overlay) {
      // Calculate current scroll position as a percentage
      const maxScroll = textarea.scrollHeight - textarea.clientHeight
      const scrollPercentage = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0
      const overlayMaxScroll = overlay.scrollHeight - overlay.clientHeight

      // Apply the same percentage to overlay to maintain relative scroll position
      overlay.scrollTop = scrollPercentage * overlayMaxScroll
      overlay.scrollLeft = textarea.scrollLeft
    }
  }, [value])

  /**
   * Set up continuous scroll sync with native event listener
   *
   * Why use native addEventListener in addition to React's onScroll?
   * - Native events fire more reliably for all scroll triggers (wheel, keyboard, touch)
   * - The 'passive: true' option improves scroll performance
   * - Ensures sync even if React's synthetic events miss some edge cases
   *
   * This effect runs once on mount and cleans up on unmount.
   */
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current

    if (!textarea || !overlay) return

    const syncScroll = () => {
      if (overlay && textarea) {
        // Calculate scroll percentage to handle height differences
        // Formula: current position / maximum scrollable distance
        const scrollPercentage =
          textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight)
        const overlayMaxScroll = overlay.scrollHeight - overlay.clientHeight

        // Apply the same percentage to overlay
        // Example: If textarea is 80% scrolled, overlay will also be 80% scrolled
        overlay.scrollTop = scrollPercentage * overlayMaxScroll
        overlay.scrollLeft = textarea.scrollLeft
      }
    }

    // Add native scroll event listener
    // 'passive: true' tells the browser we won't call preventDefault(),
    // allowing it to optimize scroll performance
    textarea.addEventListener('scroll', syncScroll, { passive: true })

    // Perform initial sync when component mounts
    syncScroll()

    // Cleanup: remove event listener when component unmounts
    return () => {
      textarea.removeEventListener('scroll', syncScroll)
    }
  }, [])

  // Handle resize functionality
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing.current = true

    const startY = e.clientY
    const startHeight = height

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return

      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(MIN_HEIGHT_PX, startHeight + deltaY)

      if (textareaRef.current && overlayRef.current) {
        textareaRef.current.style.height = `${newHeight}px`
        overlayRef.current.style.height = `${newHeight}px`
        if (containerRef.current) {
          containerRef.current.style.height = `${newHeight}px`
        }
      }
    }

    const handleMouseUp = () => {
      if (textareaRef.current) {
        const finalHeight = Number.parseInt(textareaRef.current.style.height, 10) || height
        setHeight(finalHeight)
      }

      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (config?.connectionDroppable === false) return
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (config?.connectionDroppable === false) return
    e.preventDefault()

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type !== 'connectionBlock') return

      // Get current cursor position or append to end
      const dropPosition = textareaRef.current?.selectionStart ?? value?.toString().length ?? 0

      // Insert '<' at drop position to trigger the dropdown
      const currentValue = value?.toString() ?? ''
      const newValue = `${currentValue.slice(0, dropPosition)}<${currentValue.slice(dropPosition)}`

      // Focus the textarea first
      textareaRef.current?.focus()

      // Update all state in a single batch
      Promise.resolve().then(() => {
        // Update local content immediately
        setLocalContent(newValue)

        if (onChange) {
          onChange(newValue)
        } else if (!isPreview) {
          setStoreValue(newValue)
        }
        setCursorPosition(dropPosition + 1)
        setShowTags(true)

        // Pass the source block ID from the dropped connection
        if (data.connectionData?.sourceBlockId) {
          setActiveSourceBlockId(data.connectionData.sourceBlockId)
        }

        // Set cursor position after state updates
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = dropPosition + 1
            textareaRef.current.selectionEnd = dropPosition + 1
          }
        }, 0)
      })
    } catch (error) {
      logger.error('Failed to parse drop data:', { error })
    }
  }

  // Handle key combinations
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setShowEnvVars(false)
      setShowTags(false)
    }
    // Prevent user input during streaming
    if (wandHook?.isStreaming) {
      e.preventDefault()
    }
  }

  // Handle wheel events to control ReactFlow zoom
  const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
    // Only handle zoom when Ctrl/Cmd key is pressed
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()

      // Get current zoom level and viewport
      const currentZoom = reactFlowInstance.getZoom()
      const { x: viewportX, y: viewportY } = reactFlowInstance.getViewport()

      // Calculate zoom factor based on wheel delta
      const delta = e.deltaY > 0 ? 1 : -1
      const zoomFactor = 0.96 ** delta

      // Calculate new zoom level with min/max constraints
      const newZoom = Math.min(Math.max(currentZoom * zoomFactor, 0.1), 1)

      // Get the position of the cursor in the page
      const { x: pointerX, y: pointerY } = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      })

      // Calculate the new viewport position to keep the cursor position fixed
      const newViewportX = viewportX + (pointerX * currentZoom - pointerX * newZoom)
      const newViewportY = viewportY + (pointerY * currentZoom - pointerY * newZoom)

      // Set the new viewport with the calculated position and zoom
      reactFlowInstance.setViewport(
        {
          x: newViewportX,
          y: newViewportY,
          zoom: newZoom,
        },
        { duration: 0 }
      )

      return false
    }

    // For regular scrolling (without Ctrl/Cmd), sync overlay scroll after default behavior
    // Use requestAnimationFrame to ensure the sync happens after the browser's next paint
    // This provides smooth, synchronized scrolling without blocking the main thread
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      const overlay = overlayRef.current

      if (textarea && overlay) {
        // Calculate scroll percentage
        const maxScroll = textarea.scrollHeight - textarea.clientHeight
        const scrollPercentage = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0
        const overlayMaxScroll = overlay.scrollHeight - overlay.clientHeight

        // Apply proportional scroll to overlay
        overlay.scrollTop = scrollPercentage * overlayMaxScroll
        overlay.scrollLeft = textarea.scrollLeft
      }
    })
  }

  return (
    <>
      {/* Wand Prompt Bar - positioned above the textarea */}
      {wandHook && (
        <WandPromptBar
          isVisible={wandHook.isPromptVisible}
          isLoading={wandHook.isLoading}
          isStreaming={wandHook.isStreaming}
          promptValue={wandHook.promptInputValue}
          onSubmit={(prompt: string) => wandHook.generateStream({ prompt })}
          onCancel={wandHook.isStreaming ? wandHook.cancelGeneration : wandHook.hidePromptInline}
          onChange={wandHook.updatePromptValue}
          placeholder={config.wandConfig?.placeholder || 'Describe what you want to generate...'}
        />
      )}

      <div
        ref={containerRef}
        className={cn('group relative w-full', wandHook?.isStreaming && 'streaming-effect')}
        style={{ height: `${height}px` }}
      >
        <Textarea
          ref={textareaRef}
          className={cn(
            'allow-scroll min-h-full w-full resize-none text-transparent caret-foreground placeholder:text-muted-foreground/50',
            isConnecting &&
              config?.connectionDroppable !== false &&
              'ring-2 ring-blue-500 ring-offset-2 focus-visible:ring-blue-500',
            wandHook?.isStreaming && 'pointer-events-none cursor-not-allowed opacity-50'
          )}
          rows={rows ?? DEFAULT_ROWS}
          placeholder={placeholder ?? ''}
          value={value?.toString() ?? ''}
          onChange={handleChange}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setShowEnvVars(false)
            setShowTags(false)
            setSearchTerm('')
          }}
          disabled={isPreview || disabled}
          style={{
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            height: `${height}px`,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />
        {/* 
          Overlay div for displaying formatted text with syntax highlighting
          
          Why is this needed?
          - The textarea has 'text-transparent' to hide raw text
          - This overlay shows the formatted/highlighted version on top
          - Must be perfectly synchronized with textarea scroll to keep text aligned
          
          Key styling decisions:
          - 'pointer-events-none': Allows clicks to pass through to textarea
          - 'absolute left-0 top-0': Positioned exactly over the textarea
          - 'overflow-auto': Must be scrollable to sync with textarea
          - '[&::-webkit-scrollbar]:hidden': Hide scrollbars (only textarea shows scrollbars)
          - 'border border-transparent': Matches textarea border to maintain same box model
          - 'rounded-md': Matches textarea border-radius
          - 'px-3 py-2': Matches textarea padding exactly
          - 'boxSizing: border-box': Ensures padding is included in height calculations
          - 'whiteSpace: pre-wrap': Preserves newlines and spaces, crucial for Enter key
        */}
        <div
          ref={overlayRef}
          className='pointer-events-none absolute top-0 left-0 overflow-auto rounded-md border border-transparent bg-transparent px-3 py-2 text-sm [&::-webkit-scrollbar]:hidden'
          style={{
            width: '100%',
            height: `${height}px`,
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            whiteSpace: 'pre-wrap', // CRITICAL: Preserves newlines from Enter key
            wordBreak: 'break-word',
          }}
        >
          {/* 
            Inner <pre> element holds the actual formatted content
            - Must expand naturally to create scrollable content
            - Uses <pre> tag for consistent whitespace/newline handling
            - Matches all text styling from textarea for pixel-perfect alignment
            - The <pre> tag naturally handles \n characters as line breaks
            - Uses ensureTrailingNewlineVisible() to render trailing newlines properly
          */}
          <pre
            className='m-0 whitespace-pre-wrap break-words font-sans text-sm'
            style={{
              fontFamily: 'inherit',
              lineHeight: 'inherit',
              wordBreak: 'break-word',
            }}
          >
            {formatDisplayText(ensureTrailingNewlineVisible(value?.toString() ?? ''), true)}
          </pre>
        </div>

        {/* Wand Button */}
        {wandHook && !isPreview && !wandHook.isStreaming && (
          <div className='absolute top-2 right-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
            <Button
              variant='ghost'
              size='icon'
              onClick={
                wandHook.isPromptVisible ? wandHook.hidePromptInline : wandHook.showPromptInline
              }
              disabled={wandHook.isLoading || wandHook.isStreaming || disabled}
              aria-label='Generate content with AI'
              className='h-8 w-8 rounded-full border border-transparent bg-muted/80 text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/20 hover:bg-muted hover:text-foreground hover:shadow'
            >
              <Wand2 className='h-4 w-4' />
            </Button>
          </div>
        )}

        {/* Custom resize handle */}
        {!wandHook?.isStreaming && (
          <div
            className='absolute right-1 bottom-1 flex h-4 w-4 cursor-s-resize items-center justify-center rounded-sm bg-background'
            onMouseDown={startResize}
            onDragStart={(e) => {
              e.preventDefault()
            }}
          >
            <ChevronsUpDown className='h-3 w-3 text-muted-foreground/70' />
          </div>
        )}

        {!wandHook?.isStreaming && (
          <>
            <EnvVarDropdown
              visible={showEnvVars}
              onSelect={(newValue) => {
                if (onChange) {
                  onChange(newValue)
                } else if (!isPreview) {
                  emitTagSelection(newValue)
                }
              }}
              searchTerm={searchTerm}
              inputValue={value?.toString() ?? ''}
              cursorPosition={cursorPosition}
              workspaceId={workspaceId}
              onClose={() => {
                setShowEnvVars(false)
                setSearchTerm('')
              }}
            />
            <TagDropdown
              visible={showTags}
              onSelect={(newValue) => {
                if (onChange) {
                  onChange(newValue)
                } else if (!isPreview) {
                  emitTagSelection(newValue)
                }
              }}
              blockId={blockId}
              activeSourceBlockId={activeSourceBlockId}
              inputValue={value?.toString() ?? ''}
              cursorPosition={cursorPosition}
              onClose={() => {
                setShowTags(false)
                setActiveSourceBlockId(null)
              }}
            />
          </>
        )}
      </div>
    </>
  )
}
