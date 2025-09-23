'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronDown, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SlackUserInfo {
  id: string
  name: string
  realName: string
  displayName: string
}

interface SlackUserSelectorProps {
  value?: string | string[]
  onChange: (userId: string | string[]) => void
  credential?: string
  label?: string
  disabled?: boolean
  workflowId?: string
  isForeignCredential?: boolean
  multiple?: boolean
}

export function SlackUserSelector({
  value,
  onChange,
  credential,
  label = 'Select Slack user',
  disabled = false,
  workflowId,
  isForeignCredential = false,
  multiple = false,
}: SlackUserSelectorProps) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<SlackUserInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle both single and multiple values
  const selectedUserIds = Array.isArray(value) ? value : value ? [value] : []
  const selectedUsers = users.filter((user) => selectedUserIds.includes(user.id))

  const fetchUsers = async () => {
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
  }

  useEffect(() => {
    if (open && users.length === 0 && !loading) {
      fetchUsers()
    }
  }, [open, credential, workflowId])

  const handleSelect = (userId: string) => {
    if (multiple) {
      const isSelected = selectedUserIds.includes(userId)
      let newSelection: string[]

      if (isSelected) {
        // Remove user from selection
        newSelection = selectedUserIds.filter((id) => id !== userId)
      } else {
        // Add user to selection
        newSelection = [...selectedUserIds, userId]
      }

      onChange(newSelection)
    } else {
      // Single select - close popover
      onChange(userId)
      setOpen(false)
    }
  }

  const handleClear = () => {
    onChange(multiple ? [] : '')
  }

  const handleRemoveUser = (userId: string) => {
    if (multiple) {
      const newSelection = selectedUserIds.filter((id) => id !== userId)
      onChange(newSelection)
    } else {
      onChange('')
    }
  }

  return (
    <div className='space-y-2'>
      {/* <label className='text-sm font-medium text-foreground'>{label}</label> */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='w-full justify-between min-h-[40px] h-auto'
            disabled={disabled || !credential}
          >
            <div className='flex flex-wrap items-center gap-1 flex-1'>
              {selectedUsers.length > 0 ? (
                selectedUsers.map((user) => (
                  <Badge key={user.id} variant='secondary' className='flex items-center gap-1'>
                    <User className='h-3 w-3' />
                    <span className='text-xs'>
                      {user.displayName || user.realName || user.name}
                    </span>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveUser(user.id)
                      }}
                      className='ml-1 hover:bg-destructive/20 rounded-full p-0.5'
                    >
                      <X className='h-3 w-3' />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className='text-muted-foreground'>
                  {!credential
                    ? 'Select Slack account first'
                    : multiple
                      ? 'Select users...'
                      : 'Select user...'}
                </span>
              )}
            </div>
            <div className='flex items-center gap-1 ml-2'>
              {selectedUsers.length > 0 && (
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClear()
                  }}
                  className='hover:bg-destructive/20 rounded-full p-1'
                >
                  <X className='h-3 w-3' />
                </button>
              )}
              <ChevronDown className='h-4 w-4 shrink-0 opacity-50' />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-full p-0' align='start'>
          <Command>
            <CommandInput placeholder='Search users...' />
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
              {!loading && !error && users.length === 0 && (
                <CommandEmpty>No users found.</CommandEmpty>
              )}
              {!loading && !error && users.length > 0 && (
                <CommandGroup>
                  {users.map((user) => {
                    const isSelected = selectedUserIds.includes(user.id)
                    return (
                      <CommandItem
                        key={user.id}
                        value={`${user.name} ${user.realName} ${user.displayName}`}
                        onSelect={() => handleSelect(user.id)}
                      >
                        <Check
                          className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                        />
                        <div className='flex items-center gap-2'>
                          <User className='h-4 w-4' />
                          <div className='flex flex-col'>
                            <span className='font-medium'>
                              {user.displayName || user.realName || user.name}
                            </span>
                            <span className='text-xs text-muted-foreground'>@{user.name}</span>
                          </div>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
