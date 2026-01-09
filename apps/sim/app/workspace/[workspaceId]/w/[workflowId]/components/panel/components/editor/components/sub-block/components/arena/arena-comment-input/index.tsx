'use client'

import * as React from 'react'
import { createLogger } from '@sim/logger'
import axios from 'axios'
import { ChevronsUpDown, Wand2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Textarea } from '@/components/emcn'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'
import { env } from '@/lib/core/config/env'
import { cn } from '@/lib/core/utils/cn'
import { SubBlockInputController } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/sub-block-input-controller'
import { useSubBlockInput } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-input'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/hooks/use-sub-block-value'
import type { WandControlHandlers } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/sub-block'
import { WandPromptBar } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/wand-prompt-bar/wand-prompt-bar'
import { useAccessibleReferencePrefixes } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-accessible-reference-prefixes'
import { useWand } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-wand'
import type { SubBlockConfig } from '@/blocks/types'
import { useSubBlockStore, useWorkflowRegistry } from '@/stores'

const logger = createLogger('ArenaCommentInput')

const DEFAULT_ROWS = 5
const ROW_HEIGHT_PX = 24
const MIN_HEIGHT_PX = 80

interface ArenaUser {
  sysId: string
  name: string
}

interface ArenaCommentInputProps {
  placeholder?: string
  blockId: string
  subBlockId: string
  config: SubBlockConfig
  rows?: number
  isPreview?: boolean
  previewValue?: string | null
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  wandControlRef?: React.MutableRefObject<WandControlHandlers | null>
  hideInternalWand?: boolean
}

/**
 * Converts HTML with mentions to plain text for display
 */
function htmlToDisplayText(html: string): string {
  if (!html) return ''

  // Create a temporary DOM element to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Replace mention links with just the user name
  const mentions = temp.querySelectorAll('a.mention')
  mentions.forEach((mention) => {
    const textNode = document.createTextNode(mention.textContent || '')
    mention.parentNode?.replaceChild(textNode, mention)
  })

  // Convert <p> tags to newlines
  const paragraphs = temp.querySelectorAll('p')
  paragraphs.forEach((p, index) => {
    if (index > 0) {
      const br = document.createTextNode('\n')
      p.parentNode?.insertBefore(br, p)
    }
  })

  return temp.textContent || temp.innerText || ''
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Converts plain text with @mentions to HTML format
 * Handles user names with spaces by matching against the full user names
 */
function textToHtml(text: string, mentions: Map<string, ArenaUser>): string {
  if (!text) return ''

  // Get all user names sorted by length (longest first) to match full names before partial matches
  const users = Array.from(mentions.values()).sort((a, b) => b.name.length - a.name.length)

  // Split by lines and wrap in <p> tags
  const lines = text.split('\n')
  const htmlLines = lines.map((line) => {
    const parts: string[] = []
    let lastIndex = 0

    // Find all @ mentions in the line
    let searchIndex = 0
    while (searchIndex < line.length) {
      const atIndex = line.indexOf('@', searchIndex)
      if (atIndex === -1) {
        // No more @ symbols, add remaining text
        if (lastIndex < line.length) {
          parts.push(escapeHtml(line.substring(lastIndex)))
        }
        break
      }

      // Add text before the @
      if (atIndex > lastIndex) {
        parts.push(escapeHtml(line.substring(lastIndex, atIndex)))
      }

      // Try to match user names starting from this @ position
      let matched = false
      for (const user of users) {
        const mentionText = `@${user.name}`
        const endIndex = atIndex + mentionText.length

        // Check if this matches exactly
        if (endIndex <= line.length && line.substring(atIndex, endIndex) === mentionText) {
          // Check if it's followed by space, newline, punctuation, or end of string
          const nextChar = endIndex < line.length ? line[endIndex] : ''
          const isEndOfMention =
            endIndex === line.length || /\s/.test(nextChar) || /[.,;:!?]/.test(nextChar)

          if (isEndOfMention) {
            // Found a match!
            parts.push(
              `<a class="mention" data-mention="@${escapeHtml(user.name)}" data-user-id="${user.sysId}">@${escapeHtml(user.name)}</a>`
            )
            lastIndex = endIndex
            searchIndex = endIndex
            matched = true
            break
          }
        }
      }

      if (!matched) {
        // No match found, keep the @ as plain text and continue
        const nextAt = line.indexOf('@', atIndex + 1)
        const endIndex = nextAt === -1 ? line.length : nextAt
        parts.push(escapeHtml(line.substring(atIndex, endIndex)))
        lastIndex = endIndex
        searchIndex = endIndex
      }
    }

    return parts.join('')
  })

  return htmlLines.map((line) => `<p>${line || '&nbsp;'}</p>`).join('')
}

// Note: extractMentionedUserIds is exported from @/tools/arena/utils for server-side use

export function ArenaCommentInput({
  placeholder,
  blockId,
  subBlockId,
  config,
  rows,
  isPreview = false,
  previewValue,
  value: propValue,
  onChange,
  disabled,
  wandControlRef,
  hideInternalWand = false,
}: ArenaCommentInputProps) {
  const [localContent, setLocalContent] = React.useState<string>('')
  const [displayText, setDisplayText] = React.useState<string>('')
  const [htmlContent, setHtmlContent] = React.useState<string>('')
  const persistSubBlockValueRef = React.useRef<(value: string) => void>(() => {})

  // Mention state
  const [showMentionMenu, setShowMentionMenu] = React.useState(false)
  const [mentionQuery, setMentionQuery] = React.useState('')
  const [mentionPosition, setMentionPosition] = React.useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = React.useState(0)
  const [users, setUsers] = React.useState<ArenaUser[]>([])
  const [loadingUsers, setLoadingUsers] = React.useState(false)
  const mentionMenuRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const commandInputRef = React.useRef<HTMLInputElement>(null)
  const mentionsMap = React.useRef<Map<string, ArenaUser>>(new Map())

  // Get project and client from store
  const activeWorkflowId = useWorkflowRegistry((state) => state.activeWorkflowId)
  const values = useSubBlockStore((state) => state.workflowValues)
  const clientId = values?.[activeWorkflowId ?? '']?.[blockId]?.['comment-client']?.clientId
  const projectValue = values?.[activeWorkflowId ?? '']?.[blockId]?.['comment-project']
  const projectId = typeof projectValue === 'string' ? projectValue : projectValue?.sysId

  // Wand functionality
  const wandHook = useWand({
    wandConfig: config.wandConfig,
    currentValue: htmlContent,
    onStreamStart: () => {
      setLocalContent('')
      setHtmlContent('')
      setDisplayText('')
    },
    onStreamChunk: (chunk) => {
      const newHtml = htmlContent + chunk
      setHtmlContent(newHtml)
      setLocalContent(newHtml)
      setDisplayText(htmlToDisplayText(newHtml))
    },
    onGeneratedContent: (content) => {
      setHtmlContent(content)
      setLocalContent(content)
      setDisplayText(htmlToDisplayText(content))
      if (!isPreview && !disabled) {
        persistSubBlockValueRef.current(content)
      }
    },
  })

  const [, setSubBlockValue] = useSubBlockValue<string>(blockId, subBlockId, false, {
    isStreaming: wandHook.isStreaming,
  })

  React.useEffect(() => {
    persistSubBlockValueRef.current = (value: string) => {
      setSubBlockValue(value)
    }
  }, [setSubBlockValue])

  const isWandEnabled = config.wandConfig?.enabled ?? false

  const ctrl = useSubBlockInput({
    blockId,
    subBlockId,
    config,
    value: propValue,
    onChange,
    isPreview,
    disabled,
    isStreaming: wandHook.isStreaming,
    onStreamingEnd: () => {
      logger.debug('Wand streaming ended, value persisted', { blockId, subBlockId })
    },
    previewValue,
  })

  const [height, setHeight] = React.useState(() => {
    const rowCount = rows || DEFAULT_ROWS
    return Math.max(rowCount * ROW_HEIGHT_PX, MIN_HEIGHT_PX)
  })

  const overlayRef = React.useRef<HTMLDivElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isResizing = React.useRef(false)

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // Initialize from prop value
  React.useEffect(() => {
    if (!wandHook.isStreaming) {
      const baseValue = isPreview
        ? previewValue
        : propValue !== undefined
          ? propValue
          : ctrl.valueString

      const baseValueString = baseValue?.toString() ?? ''

      // Only update if the value has actually changed
      if (baseValueString !== htmlContent && baseValueString !== '') {
        // Check if it's HTML (contains mention tags) or plain text
        const isHtml =
          baseValueString.includes('<a class="mention"') ||
          baseValueString.includes("class='mention'")

        if (isHtml) {
          // It's HTML, store it as-is and convert to display text
          setHtmlContent(baseValueString)
          setLocalContent(baseValueString)
          setDisplayText(htmlToDisplayText(baseValueString))
        } else {
          // It's plain text, convert to HTML if we have users loaded
          if (mentionsMap.current.size > 0 && baseValueString.includes('@')) {
            const convertedHtml = textToHtml(baseValueString, mentionsMap.current)
            setHtmlContent(convertedHtml)
            setLocalContent(convertedHtml)
            setDisplayText(baseValueString)
            // Persist the converted HTML
            if (!isPreview && !disabled) {
              persistSubBlockValueRef.current(convertedHtml)
            }
          } else {
            // No users loaded yet or no mentions, store as plain text wrapped in <p> tags
            const plainHtml = baseValueString
              .split('\n')
              .map((line) => `<p>${escapeHtml(line || '&nbsp;')}</p>`)
              .join('')
            setHtmlContent(plainHtml)
            setLocalContent(plainHtml)
            setDisplayText(baseValueString)
          }
        }
      }
    }
  }, [isPreview, previewValue, propValue, ctrl.valueString, wandHook.isStreaming])

  // Fetch users when project is selected
  React.useEffect(() => {
    if (!clientId || !projectId) {
      setUsers([])
      mentionsMap.current.clear()
      return
    }

    const fetchUsers = async () => {
      setLoadingUsers(true)
      try {
        const v2Token = await getArenaToken()
        const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
        const url = `${arenaBackendBaseUrl}/sol/v1/users/list?cId=${clientId}&pId=${projectId}`

        const response = await axios.get(url, {
          headers: {
            Authorisation: v2Token || '',
          },
        })

        const userList = response.data?.userList || []
        const formattedUsers: ArenaUser[] = userList.map((user: any) => ({
          sysId: user.sysId,
          name: user.name,
        }))

        setUsers(formattedUsers)

        // Update mentions map
        mentionsMap.current.clear()
        formattedUsers.forEach((user) => {
          mentionsMap.current.set(user.sysId, user)
        })
      } catch (error) {
        logger.error('Error fetching users:', error)
        setUsers([])
        mentionsMap.current.clear()
      } finally {
        setLoadingUsers(false)
      }
    }

    fetchUsers()
  }, [clientId, projectId])

  // Re-convert display text to HTML when users are loaded (if we have plain text mentions)
  React.useEffect(() => {
    if (mentionsMap.current.size > 0 && displayText && displayText.includes('@')) {
      const newHtml = textToHtml(displayText, mentionsMap.current)
      // Only update if the HTML actually contains mention tags (meaning conversion worked)
      if (newHtml !== htmlContent && newHtml.includes('class="mention"')) {
        setHtmlContent(newHtml)
        setLocalContent(newHtml)
        // Update the stored value with the new HTML
        if (!isPreview && !disabled) {
          persistSubBlockValueRef.current(newHtml)
        }
      }
    }
  }, [users.length, displayText]) // Re-run when users are loaded or display text changes

  // Handle text change and detect @ mentions
  const handleTextChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newDisplayText = e.target.value
      setDisplayText(newDisplayText)

      // Convert display text to HTML (only if we have users loaded)
      const newHtml =
        mentionsMap.current.size > 0
          ? textToHtml(newDisplayText, mentionsMap.current)
          : newDisplayText
              .split('\n')
              .map((line) => `<p>${escapeHtml(line || '&nbsp;')}</p>`)
              .join('')
      setHtmlContent(newHtml)
      setLocalContent(newHtml)

      // Update the actual value (HTML)
      if (!isPreview && !disabled) {
        persistSubBlockValueRef.current(newHtml)
      }

      // Check for @ mention
      const cursorPos = e.target.selectionStart ?? newDisplayText.length
      const textBeforeCursor = newDisplayText.substring(0, cursorPos)
      const lastAtIndex = textBeforeCursor.lastIndexOf('@')

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)

        // Check if we're in a mention (no space after @ and not already a complete mention)
        const isInMention =
          !textAfterAt.includes(' ') && !textAfterAt.includes('\n') && textAfterAt.length >= 0

        if (isInMention) {
          setMentionQuery(textAfterAt)
          setMentionPosition(lastAtIndex)
          setShowMentionMenu(true)
          setSelectedMentionIndex(0)
          return
        }
      }

      setShowMentionMenu(false)
    },
    [isPreview, disabled]
  )

  // Filter users based on mention query
  const filteredUsers = React.useMemo(() => {
    if (!mentionQuery) return users
    return users.filter((user) => user.name.toLowerCase().includes(mentionQuery.toLowerCase()))
  }, [users, mentionQuery])

  // Handle user selection
  const handleUserSelect = React.useCallback(
    (user: ArenaUser) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const beforeMention = displayText.substring(0, mentionPosition)
      const afterMention = displayText.substring(textarea.selectionStart ?? displayText.length)

      const newDisplayText = `${beforeMention}@${user.name} ${afterMention}`
      setDisplayText(newDisplayText)

      // Convert to HTML (users should be loaded at this point)
      const newHtml = textToHtml(newDisplayText, mentionsMap.current)
      setHtmlContent(newHtml)
      setLocalContent(newHtml)

      // Update value - ensure HTML is persisted immediately
      if (!isPreview && !disabled) {
        // Use setTimeout to ensure state updates are complete before persisting
        setTimeout(() => {
          persistSubBlockValueRef.current(newHtml)
        }, 0)
      }

      setShowMentionMenu(false)
      setMentionQuery('')

      // Focus back to textarea
      setTimeout(() => {
        textarea.focus()
        const newCursorPosition = beforeMention.length + `@${user.name} `.length
        textarea.setSelectionRange(newCursorPosition, newCursorPosition)
      }, 0)
    },
    [displayText, mentionPosition, isPreview, disabled]
  )

  // Handle keyboard navigation in mention menu
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentionMenu && filteredUsers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedMentionIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : prev))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const selectedUser = filteredUsers[selectedMentionIndex]
          if (selectedUser) {
            handleUserSelect(selectedUser)
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowMentionMenu(false)
          return
        }
      }
    },
    [showMentionMenu, filteredUsers, selectedMentionIndex, handleUserSelect]
  )

  // Position mention menu
  const [mentionMenuPosition, setMentionMenuPosition] = React.useState<{
    top: number
    left: number
  } | null>(null)

  React.useEffect(() => {
    if (showMentionMenu && textareaRef.current) {
      const textarea = textareaRef.current
      const rect = textarea.getBoundingClientRect()
      const scrollTop = textarea.scrollTop

      // Calculate position based on cursor
      const textBeforeCursor = displayText.substring(0, mentionPosition)
      const lines = textBeforeCursor.split('\n')
      const lineNumber = lines.length - 1
      const lineHeight = ROW_HEIGHT_PX
      const topOffset = lineNumber * lineHeight - scrollTop

      setMentionMenuPosition({
        top: rect.top + topOffset + lineHeight + 4 + window.scrollY,
        left: rect.left + window.scrollX,
      })

      // Focus the search input when menu opens
      setTimeout(() => {
        commandInputRef.current?.focus()
      }, 0)
    } else {
      setMentionMenuPosition(null)
    }
  }, [showMentionMenu, mentionPosition, displayText])

  // Close mention menu when clicking outside
  React.useEffect(() => {
    if (!showMentionMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      // Check if click is outside the mention menu
      if (mentionMenuRef.current && !mentionMenuRef.current.contains(target)) {
        // Close the menu when clicking outside
        setShowMentionMenu(false)
        setMentionQuery('')
      }
    }

    // Use capture phase to catch the event early
    // Add a small delay to avoid closing immediately when menu opens
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 50)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [showMentionMenu])

  const value = React.useMemo(() => {
    if (wandHook.isStreaming) return displayText
    return displayText
  }, [wandHook.isStreaming, displayText])

  const baseValue = isPreview
    ? previewValue
    : propValue !== undefined
      ? propValue
      : ctrl.valueString

  React.useLayoutEffect(() => {
    const rowCount = rows || DEFAULT_ROWS
    const newHeight = Math.max(rowCount * ROW_HEIGHT_PX, MIN_HEIGHT_PX)
    setHeight(newHeight)

    if (textareaRef.current && overlayRef.current) {
      textareaRef.current.style.height = `${newHeight}px`
      overlayRef.current.style.height = `${newHeight}px`
    }
  }, [rows])

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }, [])

  React.useEffect(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [value])

  const startResize = React.useCallback(
    (e: React.MouseEvent) => {
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
        }
        if (containerRef.current) {
          containerRef.current.style.height = `${newHeight}px`
        }
        setHeight(newHeight)
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
    },
    [height]
  )

  React.useImperativeHandle(
    wandControlRef,
    () => ({
      onWandTrigger: (prompt: string) => {
        wandHook.generateStream({ prompt })
      },
      isWandActive: wandHook.isPromptVisible,
      isWandStreaming: wandHook.isStreaming,
    }),
    [wandHook]
  )

  return (
    <>
      {isWandEnabled && !hideInternalWand && (
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

      <SubBlockInputController
        blockId={blockId}
        subBlockId={subBlockId}
        config={config}
        value={propValue}
        onChange={onChange}
        isPreview={isPreview}
        disabled={disabled}
        isStreaming={wandHook.isStreaming}
        previewValue={previewValue}
      >
        {({ ref, onChange: handleChange, onKeyDown, onDrop, onDragOver, onFocus }) => {
          const setRefs = (el: HTMLTextAreaElement | null) => {
            textareaRef.current = el
            ;(ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
          }

          const combinedKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            handleKeyDown(e)
            onKeyDown?.(e as any)
          }

          const combinedOnChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            handleTextChange(e)
            handleChange?.(e as any)
          }

          return (
            <div
              ref={containerRef}
              className={cn('group relative w-full', wandHook.isStreaming && 'streaming-effect')}
              style={{ height: `${height}px` }}
            >
              <Textarea
                ref={setRefs}
                className={cn(
                  'allow-scroll box-border min-h-full w-full resize-none text-transparent caret-foreground placeholder:text-muted-foreground/50',
                  wandHook.isStreaming && 'pointer-events-none cursor-not-allowed opacity-50'
                )}
                rows={rows ?? DEFAULT_ROWS}
                placeholder={placeholder ?? ''}
                value={value}
                onChange={combinedOnChange}
                onDrop={onDrop as (e: React.DragEvent<HTMLTextAreaElement>) => void}
                onDragOver={onDragOver as (e: React.DragEvent<HTMLTextAreaElement>) => void}
                onScroll={handleScroll}
                onKeyDown={combinedKeyDown}
                onFocus={onFocus}
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
                className='pointer-events-none absolute inset-0 box-border overflow-auto whitespace-pre-wrap break-words border border-transparent bg-transparent px-[8px] py-[8px] font-medium font-sans text-sm'
                style={{
                  fontFamily: 'inherit',
                  lineHeight: 'inherit',
                  width: '100%',
                  height: `${height}px`,
                }}
              >
                {value}
              </div>

              {/* Mention Menu */}
              {showMentionMenu &&
                !loadingUsers &&
                filteredUsers.length > 0 &&
                mentionMenuPosition &&
                createPortal(
                  <div
                    ref={mentionMenuRef}
                    className='fixed z-[1000] w-[300px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
                    style={{
                      top: `${mentionMenuPosition.top}px`,
                      left: `${mentionMenuPosition.left}px`,
                    }}
                  >
                    <Command
                      key={`mention-${mentionPosition}`}
                      filter={(value, search) => {
                        // `value` is from CommandItem's "value" prop (user.sysId here)
                        // We want to match by user name
                        const user = users.find((u) => u.sysId === value)
                        if (!user) return 0
                        // Custom matching: case-insensitive substring
                        return user.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                      }}
                    >
                      <CommandInput
                        ref={commandInputRef}
                        placeholder='Search users...'
                        defaultValue={mentionQuery}
                        autoFocus
                      />
                      <CommandList>
                        <CommandEmpty>No users found.</CommandEmpty>
                        <CommandGroup>
                          {users.map((user, index) => (
                            <CommandItem
                              key={user.sysId}
                              value={user.sysId}
                              onSelect={() => handleUserSelect(user)}
                              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                              className={cn(index === selectedMentionIndex && 'bg-accent')}
                            >
                              {user.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>,
                  document.body
                )}

              {isWandEnabled && !isPreview && !wandHook.isStreaming && !hideInternalWand && (
                <div className='absolute top-2 right-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={
                      wandHook.isPromptVisible
                        ? wandHook.hidePromptInline
                        : wandHook.showPromptInline
                    }
                    disabled={wandHook.isLoading || wandHook.isStreaming || disabled}
                    aria-label='Generate content with AI'
                    className='h-8 w-8 rounded-full border border-transparent bg-muted/80 text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/20 hover:bg-muted hover:text-foreground hover:shadow'
                  >
                    <Wand2 className='h-4 w-4' />
                  </Button>
                </div>
              )}

              {!wandHook.isStreaming && (
                <div
                  className='absolute right-1 bottom-1 flex h-4 w-4 cursor-ns-resize items-center justify-center rounded-[4px] border border-[var(--border-1)] bg-[var(--surface-5)] dark:bg-[var(--surface-5)]'
                  onMouseDown={startResize}
                  onDragStart={(e) => {
                    e.preventDefault()
                  }}
                >
                  <ChevronsUpDown className='h-3 w-3 text-[var(--text-muted)]' />
                </div>
              )}
            </div>
          )
        }}
      </SubBlockInputController>
    </>
  )
}
