'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AtSign, Check, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/core/utils/cn'

export interface SlackUserInfo {
  id: string
  name: string
  realName: string
  displayName: string
}

interface SlackMentionInputProps {
  value: string
  onChange: (value: string) => void
  credential?: string
  disabled?: boolean
  workflowId?: string
  isForeignCredential?: boolean
  placeholder?: string
}

export function SlackMentionInput({
  value,
  onChange,
  credential,
  disabled = false,
  workflowId,
  isForeignCredential = false,
  placeholder = 'Type your message... Use @ to mention users',
}: SlackMentionInputProps) {
  const [users, setUsers] = useState<SlackUserInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)

  // Display value (user-friendly) and actual value (with mention format)
  const [displayValue, setDisplayValue] = useState('')
  const [actualValue, setActualValue] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionMenuRef = useRef<HTMLDivElement>(null)

  // Fetch users when credential is available
  const fetchUsers = useCallback(async () => {
    if (!credential) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/tools/slack/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential,
          workflowId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error('Error fetching Slack users:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [credential, workflowId])

  // Load users when credential changes
  useEffect(() => {
    if (credential && users.length === 0) {
      fetchUsers()
    }
  }, [credential, fetchUsers, users.length])

  // Initialize display and actual values from prop
  useEffect(() => {
    if (value !== undefined) {
      const { display, actual } = convertToDisplayFormat(value, users)
      setDisplayValue(display)
      setActualValue(actual)
    }
  }, [value, users])

  // Convert mention format to display format
  const convertToDisplayFormat = (text: string, userList: SlackUserInfo[]) => {
    let display = text
    const actual = text

    // Replace <@USER_ID> with @DisplayName for display
    const mentionRegex = /<@([A-Z0-9]+)>/g
    display = display.replace(mentionRegex, (match, userId) => {
      const user = userList.find((u) => u.id === userId)
      return user ? `@${user.displayName || user.realName || user.name}` : match
    })

    return { display, actual }
  }

  // Convert display format back to mention format
  const convertToMentionFormat = (displayText: string, userList: SlackUserInfo[]) => {
    let actual = displayText

    // Replace @DisplayName with <@USER_ID> for actual value
    userList.forEach((user) => {
      const displayName = user.displayName || user.realName || user.name
      const regex = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
      actual = actual.replace(regex, `<@${user.id}>`)
    })

    return actual
  }

  // Detect @ mentions when displayValue changes (backup mechanism)
  useEffect(() => {
    if (!textareaRef.current || !displayValue) return

    // Use setTimeout to ensure cursor position is updated
    const timeoutId = setTimeout(() => {
      const cursorPosition = textareaRef.current?.selectionStart ?? displayValue.length
      const textBeforeCursor = displayValue.substring(0, cursorPosition)
      const lastAtIndex = textBeforeCursor.lastIndexOf('@')

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)

        // Check if we're in a mention (no space after @ and not already a complete mention)
        const isInMention =
          !textAfterAt.includes(' ') &&
          !textAfterAt.includes('\n') &&
          !textAfterAt.includes('<@') &&
          !textAfterAt.includes('>') &&
          textAfterAt.length >= 0

        if (isInMention && users.length > 0) {
          setMentionQuery(textAfterAt)
          setMentionPosition(lastAtIndex)
          setShowMentionMenu(true)
          setSelectedMentionIndex(0)
        } else if (!isInMention) {
          setShowMentionMenu(false)
        }
      } else {
        setShowMentionMenu(false)
      }
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [displayValue, users.length])

  // Close mention menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowMentionMenu(false)
      }
    }

    if (showMentionMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMentionMenu])

  // Handle text change and detect @ mentions
  const handleTextChange = (newDisplayValue: string, cursorPos?: number) => {
    setDisplayValue(newDisplayValue)

    // Convert display value to actual value with mention format
    const newActualValue = convertToMentionFormat(newDisplayValue, users)
    setActualValue(newActualValue)

    // Send actual value to parent
    onChange(newActualValue)

    // Use provided cursor position or get from textarea ref
    const cursorPosition =
      cursorPos ?? textareaRef.current?.selectionStart ?? newDisplayValue.length
    const textBeforeCursor = newDisplayValue.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)

      // Check if we're in a mention (no space after @ and not already a complete mention)
      const isInMention =
        !textAfterAt.includes(' ') &&
        !textAfterAt.includes('\n') &&
        !textAfterAt.includes('<@') &&
        !textAfterAt.includes('>') &&
        textAfterAt.length >= 0

      if (isInMention) {
        setMentionQuery(textAfterAt)
        setMentionPosition(lastAtIndex)
        setShowMentionMenu(true)
        setSelectedMentionIndex(0)
        return
      }
    }

    setShowMentionMenu(false)
  }

  // Filter users based on mention query
  const filteredUsers = users.filter((user) => {
    const searchText = mentionQuery.toLowerCase()
    return (
      user.name.toLowerCase().includes(searchText) ||
      user.realName.toLowerCase().includes(searchText) ||
      user.displayName.toLowerCase().includes(searchText)
    )
  })

  // Handle user selection
  const handleUserSelect = (user: SlackUserInfo) => {
    const beforeMention = displayValue.substring(0, mentionPosition)
    const afterMention = displayValue.substring(
      textareaRef.current?.selectionStart || displayValue.length
    )

    const newDisplayValue = `${beforeMention}@${user.displayName || user.realName || user.name} ${afterMention}`
    handleTextChange(newDisplayValue)

    setShowMentionMenu(false)
    setMentionQuery('')

    // Focus back to textarea
    setTimeout(() => {
      textareaRef.current?.focus()
      const newCursorPosition =
        beforeMention.length + `@${user.displayName || user.realName || user.name} `.length
      textareaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
    }, 0)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentionMenu || filteredUsers.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setSelectedMentionIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : filteredUsers.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (filteredUsers[selectedMentionIndex]) {
          handleUserSelect(filteredUsers[selectedMentionIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setShowMentionMenu(false)
        break
      case 'Tab':
        if (filteredUsers[selectedMentionIndex]) {
          e.preventDefault()
          e.stopPropagation()
          handleUserSelect(filteredUsers[selectedMentionIndex])
        }
        break
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (showMentionMenu && mentionMenuRef.current) {
      const selectedElement = mentionMenuRef.current.querySelector(
        `[data-mention-index="${selectedMentionIndex}"]`
      )
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedMentionIndex, showMentionMenu])

  return (
    <div className='space-y-2'>
      <div className='group relative'>
        <Textarea
          ref={textareaRef}
          value={displayValue}
          onChange={(e) => {
            const cursorPos = e.target.selectionStart
            handleTextChange(e.target.value, cursorPos)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || !credential}
          className='min-h-[100px] resize-none pr-10'
        />

        {/* Insert < button */}
        {!disabled && credential && (
          <div className='absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
            <Button
              variant='ghost'
              size='icon'
              onClick={() => {
                const cursorPosition = textareaRef.current?.selectionStart || 0
                const beforeCursor = displayValue.substring(0, cursorPosition)
                const afterCursor = displayValue.substring(cursorPosition)
                const newValue = `${beforeCursor}@${afterCursor}`
                handleTextChange(newValue)

                // Focus and position cursor after @
                setTimeout(() => {
                  textareaRef.current?.focus()
                  const newCursorPosition = beforeCursor.length + 1
                  textareaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
                }, 0)
              }}
              disabled={disabled}
              aria-label='Insert @ to mention users'
              className='h-8 w-8 rounded-full border border-transparent bg-muted/80 text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/20 hover:bg-muted hover:text-foreground hover:shadow'
            >
              <AtSign className='h-4 w-4' />
            </Button>
          </div>
        )}

        {/* Mention menu */}
        {showMentionMenu && (
          <div
            ref={mentionMenuRef}
            className='absolute top-full left-0 z-50 mt-1 max-h-60 w-80 overflow-auto rounded-md border bg-popover shadow-md'
            onKeyDown={(e) => {
              // Prevent arrow keys from scrolling the menu
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
          >
            {loading && (
              <div className='flex items-center justify-center py-4'>
                <div className='text-muted-foreground text-sm'>Loading users...</div>
              </div>
            )}
            {error && (
              <div className='flex items-center justify-center py-4'>
                <div className='text-destructive text-sm'>{error}</div>
              </div>
            )}
            {!loading && !error && filteredUsers.length === 0 && (
              <div className='py-4 text-center text-muted-foreground text-sm'>No users found.</div>
            )}
            {!loading && !error && filteredUsers.length > 0 && (
              <div className='p-1'>
                {filteredUsers.map((user, index) => (
                  <div
                    key={user.id}
                    data-mention-index={index}
                    onClick={() => handleUserSelect(user)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
                      index === selectedMentionIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        index === selectedMentionIndex ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <User className='h-4 w-4 shrink-0' />
                    <div className='flex min-w-0 flex-col'>
                      <span className='truncate font-medium'>
                        {user.displayName || user.realName || user.name}
                      </span>
                      <span className='truncate text-muted-foreground text-xs'>@{user.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className='text-muted-foreground text-xs'>
        Type @ or click the @ button to mention users.
        <br />
      </div>
    </div>
  )
}
