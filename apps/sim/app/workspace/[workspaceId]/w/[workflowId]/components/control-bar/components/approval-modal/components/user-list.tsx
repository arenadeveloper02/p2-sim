'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, RefreshCw, User } from 'lucide-react'
import type { UserType } from '@/stores/approver-list/store'

interface UserSearchProps {
  users: UserType[]
  selectedUser: UserType | null
  onSelectUser: (user: UserType) => void
  loading?: boolean
  error?: string | null
  disabled?: boolean
}

export default function UserSearch({
  users,
  selectedUser,
  onSelectUser,
  loading,
  error,
  disabled = false,
}: UserSearchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchValue.toLowerCase())
  )
  // Update search value when selectedUser changes (for disabled state)
  useEffect(() => {
    if (selectedUser && disabled) {
      setSearchValue('')
    }
  }, [selectedUser, disabled])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % filteredUsers.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev === 0 ? filteredUsers.length - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredUsers[highlightedIndex]) {
        onSelectUser(filteredUsers[highlightedIndex])
        setIsOpen(false)
        setSearchValue('')
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className='relative w-full' ref={containerRef}>
      {/* Input */}
      <div className='relative'>
        <input
          type='text'
          placeholder='Search Approver...'
          value={isOpen ? searchValue : selectedUser ? selectedUser.name : ''}
          onFocus={() => !disabled && setIsOpen(true)}
          onChange={(e) => {
            if (!disabled) {
              setSearchValue(e.target.value)
              setHighlightedIndex(0)
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`flex h-10 w-full rounded-[8px] border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
        />
        {isOpen ? (
          <ChevronUp className='absolute top-3 right-3 h-4 w-4 text-muted-foreground' />
        ) : (
          <ChevronDown className='absolute top-3 right-3 h-4 w-4 text-muted-foreground' />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className='absolute top-full right-0 left-0 z-50 mt-1 h-[100px] overflow-y-auto rounded-md border bg-popover shadow-md'>
          {loading ? (
            <div className='flex items-center justify-center p-4'>
              <RefreshCw className='h-4 w-4 animate-spin' />
              <span className='ml-2'>Loading users...</span>
            </div>
          ) : error ? (
            <div className='p-4 text-center'>
              <p className='text-destructive text-sm'>{error}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className='p-4 text-center text-sm'>No users found</div>
          ) : (
            filteredUsers.map((user, index) => (
              <div
                key={user.id}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${
                  index === highlightedIndex ? 'bg-accent text-accent-foreground' : ''
                }`}
                onClick={() => {
                  onSelectUser(user)
                  setIsOpen(false)
                  setSearchValue('')
                }}
              >
                <User className='h-4 w-4 text-muted-foreground' />
                <span className='text-sm'>{user.name}</span>
                {user.id === selectedUser?.id && <Check className='ml-auto h-4 w-4' />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
