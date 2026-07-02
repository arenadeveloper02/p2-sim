'use client'

import { useMemo } from 'react'
import { Button } from '@/components/emcn/components'
import { cn } from '@/lib/core/utils/cn'
import {
  listConversationFileOptions,
  getConversationImageRefKey,
  toConversationImageRef,
} from '@/lib/chat/conversation-image-catalog'
import type { ConversationImageRef } from '@/lib/image-generation/reference-files'
import type { ChatMessage } from '@/stores/chat/types'

interface ConversationImagePickerProps {
  messages: ChatMessage[]
  workflowId?: string
  selectedConversationImages: ConversationImageRef[]
  onToggleConversationImage: (ref: ConversationImageRef) => void
  disabled?: boolean
  mode?: 'images' | 'all'
  emptyLabel?: string
  sectionLabel?: string
}

export function ConversationImagePicker({
  messages,
  workflowId,
  selectedConversationImages,
  onToggleConversationImage,
  disabled = false,
  mode = 'images',
  emptyLabel = 'No conversation images yet. Upload or generate images in chat, then select them here.',
  sectionLabel = 'Select images from this conversation',
}: ConversationImagePickerProps) {
  const workflowMessages = useMemo(() => {
    if (!workflowId) {
      return messages
    }
    return messages.filter((message) => message.workflowId === workflowId)
  }, [messages, workflowId])

  const options = useMemo(
    () => listConversationFileOptions(workflowMessages, { mode }),
    [workflowMessages, mode]
  )

  const selectedIds = useMemo(
    () => new Set(selectedConversationImages.map((image) => image.id)),
    [selectedConversationImages]
  )

  if (options.length === 0) {
    return <p className='mb-2 text-[var(--text-muted)] text-xs'>{emptyLabel}</p>
  }

  return (
    <div className='mb-2 space-y-2'>
      <p className='text-[var(--text-muted)] text-xs'>{sectionLabel}</p>
      <div className='flex flex-wrap gap-2'>
        {options.map((option) => {
          const isSelected = selectedIds.has(option.id)
          const ref = toConversationImageRef(option)
          return (
            <button
              key={getConversationImageRefKey(ref)}
              type='button'
              disabled={disabled || !option.url}
              onClick={() => onToggleConversationImage(ref)}
              className={cn(
                'relative overflow-hidden rounded-md border bg-[var(--surface-2)] transition-colors',
                option.previewUrl ? 'size-[56px]' : 'min-h-[56px] max-w-[160px] px-2 py-1',
                isSelected
                  ? 'border-[var(--selection)] ring-1 ring-[var(--selection)]'
                  : 'border-[var(--border-1)] hover:border-[var(--border-2)]'
              )}
              title={option.name}
            >
              {option.previewUrl ? (
                <img src={option.previewUrl} alt={option.name} className='size-full object-cover' />
              ) : (
                <span className='line-clamp-2 text-[var(--text-primary)] text-xs'>
                  {option.name}
                </span>
              )}
              {isSelected && (
                <span className='absolute inset-x-0 bottom-0 bg-[var(--selection)]/90 py-0.5 text-[9px] text-white'>
                  Selected
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface ConversationImagePickerActionsProps {
  hasConversationImages: boolean
  showConversationPicker: boolean
  onToggleConversationPicker: () => void
  disabled?: boolean
  actionLabel?: string
  hideLabel?: string
}

export function ConversationImagePickerActions({
  hasConversationImages,
  showConversationPicker,
  onToggleConversationPicker,
  disabled = false,
  actionLabel = 'Select from conversation',
  hideLabel = 'Hide conversation images',
}: ConversationImagePickerActionsProps) {
  if (!hasConversationImages) {
    return null
  }

  return (
    <Button
      type='button'
      variant='ghost'
      disabled={disabled}
      onClick={onToggleConversationPicker}
      className='mb-2 h-7 px-2 text-xs'
    >
      {showConversationPicker ? hideLabel : actionLabel}
    </Button>
  )
}
