import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
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

const logger = createLogger('MentionInput')

interface SlackUser {
  id: string
  name: string
  realName: string
  displayName: string
}

interface MentionInputProps {
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

export function MentionInput({
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
}: MentionInputProps) {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const workflowId = params.workflowId as string

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
  const [showMentions, setShowMentions] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [mentionSearchTerm, setMentionSearchTerm] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [users, setUsers] = useState<SlackUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)

  // Get the current value (either from props or store)
  const value = propValue !== undefined ? propValue : storeValue

  // Get credential and auth method from the block's sub-block values
  const [credential] = useSubBlockValue(blockId, 'credential')
  const [authMethod] = useSubBlockValue(blockId, 'authMethod')
  const [botToken] = useSubBlockValue(blockId, 'botToken')

  // Choose credential based on auth method (same pattern as channel-selector)
  const effectiveCredential: string =
    (authMethod as string) === 'bot_token'
      ? (botToken as string) || ''
      : (credential as string) || ''

  // Fetch Slack users when credential changes
  useEffect(() => {
    if (effectiveCredential && workflowId) {
      fetchSlackUsers()
    }
  }, [effectiveCredential, workflowId])

  const fetchSlackUsers = async () => {
    if (!effectiveCredential || !workflowId) {
      console.log('MentionInput: Missing credential or workflowId', {
        effectiveCredential,
        workflowId,
      })
      return
    }

    console.log('MentionInput: Fetching Slack users', { effectiveCredential, workflowId })
    setLoadingUsers(true)
    try {
      const response = await fetch('/api/tools/slack/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: effectiveCredential,
          workflowId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log('MentionInput: Fetched users', data.users?.length || 0)
        setUsers(data.users || [])
      } else {
        const errorText = await response.text()
        console.error('Failed to fetch Slack users:', response.status, errorText)
        setUsers([])
      }
    } catch (error) {
      console.error('Failed to fetch Slack users:', error)
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }

  // Check for @ mention trigger and get search term
  const checkMentionTrigger = (text: string, cursorPosition: number) => {
    if (cursorPosition >= 1) {
      const textBeforeCursor = text.slice(0, cursorPosition)
      const match = textBeforeCursor.match(/@(\w*)$/)
      if (match) {
        return { show: true, searchTerm: match[1] }
      }
    }
    return { show: false, searchTerm: '' }
  }

  // Filter users based on search term
  const filteredUsers = users
    .filter(
      (user) =>
        user.name.toLowerCase().includes(mentionSearchTerm.toLowerCase()) ||
        user.realName.toLowerCase().includes(mentionSearchTerm.toLowerCase()) ||
        user.displayName.toLowerCase().includes(mentionSearchTerm.toLowerCase())
    )
    .slice(0, 10) // Limit to 10 results

  // Handle user selection
  const handleUserSelect = (user: SlackUser) => {
    console.log('MentionInput: handleUserSelect called', user.name)

    if (!textareaRef.current) {
      console.log('MentionInput: No textarea ref')
      return
    }

    const textarea = textareaRef.current
    const cursorPosition = textarea.selectionStart || 0
    const value = textarea.value

    console.log('MentionInput: Current state', { cursorPosition, value })

    const textBeforeCursor = value.slice(0, cursorPosition)
    const textAfterCursor = value.slice(cursorPosition)

    // Find the start of the @ mention
    const lastAt = textBeforeCursor.lastIndexOf('@')
    if (lastAt === -1) {
      console.log('MentionInput: No @ found in text before cursor')
      return
    }

    const startText = textBeforeCursor.slice(0, lastAt)
    const newValue = `${startText}@${user.name} ${textAfterCursor}`

    console.log('MentionInput: New value', newValue)

    // Update the textarea value
    textarea.value = newValue

    // Set cursor position after the mention
    const newCursorPosition = lastAt + user.name.length + 2
    textarea.setSelectionRange(newCursorPosition, newCursorPosition)

    // Update the state and trigger change
    setStoreValue(newValue)
    onChange?.(newValue)

    // Hide mentions
    setShowMentions(false)
    setMentionSearchTerm('')

    // Focus back to textarea
    textarea.focus()
  }

  // Handle text change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0

    // Check for @ mention trigger
    const { show: showMention, searchTerm: mentionTerm } = checkMentionTrigger(newValue, cursorPos)

    if (showMention) {
      console.log('MentionInput: @ mention triggered', { mentionTerm, usersCount: users.length })
      setShowMentions(true)
      setMentionSearchTerm(mentionTerm)
      setSelectedMentionIndex(0)
    } else {
      setShowMentions(false)
      setMentionSearchTerm('')
    }

    // Check for environment variable trigger
    const { show: showEnvVar, searchTerm: envVarTerm } = checkEnvVarTrigger(newValue, cursorPos)
    if (showEnvVar) {
      setShowEnvVars(true)
      setSearchTerm(envVarTerm)
    } else {
      setShowEnvVars(false)
      setSearchTerm('')
    }

    // Check for tag trigger
    const { show: showTag } = checkTagTrigger(newValue, cursorPos)
    if (showTag) {
      setShowTags(true)
      setSearchTerm('')
    } else {
      setShowTags(false)
      setSearchTerm('')
    }

    // Update cursor position
    setCursorPosition(cursorPos)

    // Update local content for streaming
    if (wandHook?.isStreaming) {
      setLocalContent(newValue)
    }

    // Update store value
    setStoreValue(newValue)

    // Call external onChange if provided
    onChange?.(newValue)
  }

  // Handle keyboard navigation for mentions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredUsers.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedMentionIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : 0))
          return
        case 'ArrowUp':
          e.preventDefault()
          setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : filteredUsers.length - 1))
          return
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (filteredUsers[selectedMentionIndex]) {
            handleUserSelect(filteredUsers[selectedMentionIndex])
          }
          return
        case 'Escape':
          setShowMentions(false)
          setMentionSearchTerm('')
          return
      }
    }

    // Handle other keyboard events (env vars, tags, etc.)
    if (showEnvVars) {
      // Handle env var navigation
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        // Let EnvVarDropdown handle this
      }
    }

    if (showTags) {
      // Handle tag navigation
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        // Let TagDropdown handle this
      }
    }
  }

  // Calculate height based on content
  const calculateHeight = () => {
    const lineCount = value?.split('\n').length || 1
    const calculatedHeight = Math.max(lineCount * ROW_HEIGHT_PX, MIN_HEIGHT_PX)
    return Math.min(calculatedHeight, 300) // Max height of 300px
  }

  const height = calculateHeight()

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    // Handle drop logic here if needed
  }

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
  }

  // Handle scroll
  const handleScroll = () => {
    // Handle scroll logic if needed
  }

  // Handle wheel
  const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
    // Handle wheel logic if needed
  }

  // Handle mouse down for connection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isConnecting && config?.connectionDroppable !== false) {
      e.preventDefault()
      // Handle connection logic
    }
  }

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Add a small delay to prevent interference with button clicks
      setTimeout(() => {
        // Only close if the click is outside both the textarea and the dropdown
        if (
          showMentions &&
          mentionDropdownRef.current &&
          !mentionDropdownRef.current.contains(event.target as Node) &&
          textareaRef.current &&
          !textareaRef.current.contains(event.target as Node)
        ) {
          console.log('MentionInput: Click outside, closing mentions')
          setShowMentions(false)
          setMentionSearchTerm('')
        }
      }, 10)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMentions])

  return (
    <div className='relative'>
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-input bg-background',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'ring-2 ring-blue-500 ring-offset-2',
          wandHook?.isStreaming && 'pointer-events-none cursor-not-allowed opacity-50'
        )}
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
            setShowMentions(false)
            setSearchTerm('')
            setMentionSearchTerm('')
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
        <div
          ref={overlayRef}
          className='pointer-events-none absolute inset-0 whitespace-pre-wrap break-words bg-transparent px-3 py-2 text-sm'
          style={{
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            width: '100%',
            height: `${height}px`,
            overflow: 'hidden',
          }}
        >
          {formatDisplayText(value?.toString() ?? '', true)}
        </div>

        {/* Wand Button */}
        {wandHook && !isPreview && (
          <div className='absolute right-2 bottom-2'>
            <WandPromptBar
              isVisible={wandHook.isPromptVisible}
              isLoading={wandHook.isLoading}
              isStreaming={wandHook.isStreaming}
              promptValue={wandHook.promptInputValue}
              onSubmit={(prompt: string) => wandHook.generateStream({ prompt })}
              onCancel={
                wandHook.isStreaming ? wandHook.cancelGeneration : wandHook.hidePromptInline
              }
              onChange={wandHook.updatePromptValue}
              placeholder={
                config.wandConfig?.placeholder || 'Describe what you want to generate...'
              }
            />
          </div>
        )}
      </div>

      {/* Environment Variable Dropdown */}
      {showEnvVars && (
        <EnvVarDropdown
          visible={showEnvVars}
          onSelect={(newValue) => {
            setStoreValue(newValue)
            onChange?.(newValue)
            setShowEnvVars(false)
          }}
          searchTerm={searchTerm}
          inputValue={value?.toString() ?? ''}
          cursorPosition={cursorPosition}
          onClose={() => setShowEnvVars(false)}
        />
      )}

      {/* Tag Dropdown */}
      {showTags && (
        <TagDropdown
          visible={showTags}
          onSelect={(tag) => {
            const newValue = value?.toString() ?? ''
            const textBeforeCursor = newValue.slice(0, cursorPosition)
            const textAfterCursor = newValue.slice(cursorPosition)
            const lastOpenBracket = textBeforeCursor.lastIndexOf('<')

            if (lastOpenBracket !== -1) {
              const startText = textBeforeCursor.slice(0, lastOpenBracket)
              const newText = `${startText}<${tag}>${textAfterCursor}`
              setStoreValue(newText)
              onChange?.(newText)
              emitTagSelection(tag)
            }
            setShowTags(false)
          }}
          blockId={blockId}
          activeSourceBlockId={activeSourceBlockId}
          inputValue={value?.toString() ?? ''}
          cursorPosition={cursorPosition}
          onClose={() => setShowTags(false)}
        />
      )}

      {/* Mention Dropdown */}
      {showMentions && (
        <div
          ref={mentionDropdownRef}
          className='absolute z-50 max-h-48 w-64 overflow-y-auto rounded-md border bg-popover shadow-md'
          style={{
            top: '100%',
            left: 0,
            marginTop: '4px',
          }}
        >
          {loadingUsers ? (
            <div className='px-3 py-2 text-muted-foreground text-sm'>Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className='px-3 py-2 text-muted-foreground text-sm'>No users found</div>
          ) : (
            <div className='py-1'>
              {filteredUsers.map((user, index) => (
                <button
                  key={user.id}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none',
                    index === selectedMentionIndex && 'bg-accent text-accent-foreground'
                  )}
                  onMouseEnter={() => setSelectedMentionIndex(index)}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('MentionInput: User clicked', user.name)
                    handleUserSelect(user)
                  }}
                >
                  <div className='font-medium'>@{user.name}</div>
                  <div className='text-muted-foreground text-xs'>{user.displayName}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
