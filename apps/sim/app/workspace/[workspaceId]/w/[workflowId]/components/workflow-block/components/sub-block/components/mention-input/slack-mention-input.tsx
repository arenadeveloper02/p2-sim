'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, X, AtSign, User } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  label?: string
  disabled?: boolean
  workflowId?: string
  isForeignCredential?: boolean
  placeholder?: string
}

export function SlackMentionInput({
  value,
  onChange,
  credential,
  label = 'Message',
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
    let actual = text

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
  const handleTextChange = (newDisplayValue: string) => {
    setDisplayValue(newDisplayValue)

    // Convert display value to actual value with mention format
    const newActualValue = convertToMentionFormat(newDisplayValue, users)
    setActualValue(newActualValue)

    // Send actual value to parent
    onChange(newActualValue)

    const cursorPosition = textareaRef.current?.selectionStart || 0
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
    if (!showMentionMenu) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedMentionIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : filteredUsers.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredUsers[selectedMentionIndex]) {
          handleUserSelect(filteredUsers[selectedMentionIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowMentionMenu(false)
        break
    }
  }

  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium text-foreground'>{label}</label>

      <div className='relative group'>
        <Textarea
          ref={textareaRef}
          value={displayValue}
          onChange={(e) => handleTextChange(e.target.value)}
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
            className='absolute top-full left-0 z-50 w-80 bg-popover border rounded-md shadow-md mt-1'
          >
            <Command>
              <CommandInput
                placeholder='Search users...'
                value={mentionQuery}
                onValueChange={setMentionQuery}
              />
              <CommandList>
                {loading && (
                  <CommandEmpty>
                    <div className='flex items-center justify-center py-4'>
                      <div className='text-sm text-muted-foreground'>Loading users...</div>
                    </div>
                  </CommandEmpty>
                )}
                {error && (
                  <CommandEmpty>
                    <div className='flex items-center justify-center py-4'>
                      <div className='text-sm text-destructive'>{error}</div>
                    </div>
                  </CommandEmpty>
                )}
                {!loading && !error && filteredUsers.length === 0 && (
                  <CommandEmpty>No users found.</CommandEmpty>
                )}
                {!loading && !error && filteredUsers.length > 0 && (
                  <CommandGroup>
                    {filteredUsers.map((user, index) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.name} ${user.realName} ${user.displayName}`}
                        onSelect={() => handleUserSelect(user)}
                        className={cn(
                          'cursor-pointer',
                          index === selectedMentionIndex && 'bg-accent'
                        )}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            index === selectedMentionIndex ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className='flex items-center gap-2'>
                          <User className='h-4 w-4' />
                          <div className='flex flex-col'>
                            <span className='font-medium'>
                              {user.displayName || user.realName || user.name}
                            </span>
                            <span className='text-xs text-muted-foreground'>
                              @{user.name} • {user.id}
                            </span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className='text-xs text-muted-foreground'>
        Type @ or click the @ button to mention users. Use ↑↓ to navigate, Enter to select, Esc to
        cancel.
        <br />
        <span className='text-xs text-muted-foreground'>
          Mentions will appear as: <code className='bg-muted px-1 rounded'>@DisplayName</code>
        </span>
      </div>
    </div>
  )
}
