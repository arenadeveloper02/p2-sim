'use client'

import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { ArrowUp, Mic, Paperclip, X } from 'lucide-react'
import { Badge, Tooltip } from '@/components/emcn'
import type { SelectedGeneratedImage } from '@/lib/chat/generated-image-selection'
import { cn } from '@/lib/core/utils/cn'
import { handleKeyboardActivation } from '@/lib/core/utils/keyboard'
import { CHAT_ACCEPT_ATTRIBUTE } from '@/lib/uploads/utils/validation'
import { VoiceInput } from '@/app/chat/components/input/voice-input'

const logger = createLogger('ChatInput')

const MAX_TEXTAREA_HEIGHT = 200

interface AttachedFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  dataUrl?: string
}

export const ChatInput: React.FC<{
  onSubmit?: (value: string, isVoiceInput?: boolean, files?: AttachedFile[]) => void
  isStreaming?: boolean
  onStopStreaming?: () => void
  onVoiceStart?: () => void
  voiceOnly?: boolean
  selectedGeneratedImages?: SelectedGeneratedImage[]
  onRemoveSelectedGeneratedImage?: (imageId: string) => void
  /** When set, this text is inserted into the input followed by a space and the input is focused; then onInsertConsumed is called */
  insertText?: string
  /** Called after insertText has been applied so the parent can clear it */
  onInsertConsumed?: () => void
  sttAvailable?: boolean
  /** When true, input is positioned within the flex main column instead of fixed viewport offsets */
  embedded?: boolean
  /** Landing-page styling with gradient border */
  landing?: boolean
  placeholder?: string
}> = ({
  onSubmit,
  isStreaming = false,
  onStopStreaming,
  onVoiceStart,
  voiceOnly = false,
  selectedGeneratedImages = [],
  onRemoveSelectedGeneratedImage,
  insertText,
  onInsertConsumed,
  sttAvailable = false,
  embedded = false,
  landing = false,
  placeholder = 'Enter a message...',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [dragCounter, setDragCounter] = useState(0)
  const isDragOver = dragCounter > 0

  // When parent injects text (e.g. "Ask this in chat"), append it + space and focus the input.
  useEffect(() => {
    const text = insertText?.trim()
    if (!text) return

    setInputValue((prev) => {
      const prefix = prev.length > 0 ? `${prev.replace(/\s+$/, '')} ` : ''
      return `${prefix}${text} `
    })

    onInsertConsumed?.()

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const end = el.value.length
        el.setSelectionRange(end, end)
      })
    })
  }, [insertText, onInsertConsumed])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = landing ? 24 : MAX_TEXTAREA_HEIGHT
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [inputValue, landing])

  const useDeployedChrome = landing || embedded

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const newFiles: AttachedFile[] = []
    const maxSize = 10 * 1024 * 1024
    const maxFiles = 15
    const preparedFiles: AttachedFile[] = []
    const errors: string[] = []

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]

      if (file.size > maxSize) {
        errors.push(`${file.name} is too large (max 10MB)`)
        continue
      }

      let dataUrl: string | undefined
      if (file.type.startsWith('image/')) {
        try {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        } catch (error) {
          logger.error('Error reading file:', error)
        }
      }

      preparedFiles.push({
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        dataUrl,
      })
    }

    setAttachedFiles((current) => {
      if (preparedFiles.length === 0) return current

      const remainingSlots = Math.max(0, maxFiles - current.length)
      if (remainingSlots === 0) {
        errors.push(`Maximum of ${maxFiles} files allowed`)
        return current
      }

      const next: AttachedFile[] = [...current]
      for (const candidate of preparedFiles) {
        if (next.length >= maxFiles) break

        const isDuplicate = next.some(
          (existingFile) =>
            existingFile.name === candidate.name && existingFile.size === candidate.size
        )
        if (isDuplicate) {
          errors.push(`${candidate.name} already added`)
          continue
        }

        next.push(candidate)
      }

      return next
    })

    if (errors.length > 0) {
      setUploadErrors(errors)
    } else if (preparedFiles.length > 0) {
      setUploadErrors([]) // Clear errors when files are successfully added
    }
  }

  const handleRemoveFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId))
  }, [])

  const handleSubmit = useCallback(() => {
    if (isStreaming) return
    if (!inputValue.trim() && attachedFiles.length === 0 && selectedGeneratedImages.length === 0)
      return
    onSubmit?.(inputValue.trim(), false, attachedFiles)
    setInputValue('')
    setAttachedFiles([])
    setUploadErrors([])
  }, [isStreaming, inputValue, attachedFiles, onSubmit, selectedGeneratedImages.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const focusTextarea = useCallback(() => {
    textareaRef.current?.focus()
  }, [])

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    textareaRef.current?.focus()
  }, [])

  const canSubmit =
    (inputValue.trim().length > 0 ||
      attachedFiles.length > 0 ||
      selectedGeneratedImages.length > 0) &&
    !isStreaming

  const renderDeployedControls = () => (
    <div className={cn('flex gap-1', landing ? 'items-center' : 'items-start')}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || attachedFiles.length >= 15}
            className={cn(
              'flex size-[28px] shrink-0 items-center justify-center rounded-full text-[var(--text-icon)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50',
              !landing && 'mt-0.5'
            )}
          >
            <Paperclip className='size-[16px]' strokeWidth={2} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content side='top'>
          <p>Attach files</p>
        </Tooltip.Content>
      </Tooltip.Root>

      <input
        ref={fileInputRef}
        type='file'
        multiple
        accept={CHAT_ACCEPT_ATTRIBUTE}
        onChange={(e) => {
          handleFileSelect(e.target.files)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
        className='hidden'
        disabled={isStreaming}
      />

      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isDragOver ? 'Drop files here...' : placeholder}
        rows={1}
        className={cn(
          'm-0 min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-[24px] outline-none placeholder:text-[#94A3B8] focus-visible:ring-0 focus-visible:ring-offset-0',
          landing
            ? 'min-h-[24px] overflow-hidden'
            : 'min-h-[24px] overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      />

      {isStreaming ? (
        <button
          type='button'
          onClick={onStopStreaming}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-[#DCE6F3] p-0 transition-colors hover:bg-[#CED9EA]',
            !landing && 'mt-0.5'
          )}
          title='Stop generation'
        >
          <svg
            className='block size-[14px] fill-[#64748B]'
            viewBox='0 0 24 24'
            xmlns='http://www.w3.org/2000/svg'
          >
            <rect x='4' y='4' width='16' height='16' rx='3' ry='3' />
          </svg>
        </button>
      ) : (
        <button
          type='button'
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg border-0 p-0 transition-colors',
            canSubmit ? 'bg-[#DCE6F3] hover:bg-[#CED9EA]' : 'bg-[#E8EEF7] opacity-60',
            !landing && 'mt-0.5'
          )}
        >
          <ArrowUp className='block size-[16px] text-[#64748B]' strokeWidth={2.25} />
        </button>
      )}
    </div>
  )

  if (voiceOnly) {
    return (
      <Tooltip.Provider>
        <div className='flex items-center justify-center'>
          {sttAvailable && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <div>
                  <VoiceInput
                    onVoiceStart={onVoiceStart ?? (() => {})}
                    disabled={isStreaming}
                    large={true}
                  />
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content side='top'>
                <p>Start voice conversation</p>
              </Tooltip.Content>
            </Tooltip.Root>
          )}
        </div>
      </Tooltip.Provider>
    )
  }

  return (
    <Tooltip.Provider>
      <div
        className={cn(
          'flex w-full items-center justify-center',
          useDeployedChrome
            ? 'relative w-full shrink-0 px-0 pb-0'
            : cn(
                'bg-gradient-to-t from-[var(--bg)] to-transparent px-4 pb-4 md:px-0 md:pb-4',
                'fixed right-0 bottom-0 left-0 ml-[118px]'
              )
        )}
      >
        <div ref={wrapperRef} className='w-full max-w-3xl md:max-w-[748px]'>
          {/* Error Messages */}
          {uploadErrors.length > 0 && (
            <div className='mb-3 flex flex-col gap-2'>
              {uploadErrors.map((error, idx) => (
                <Badge key={`${error}-${idx}`} variant='red' size='lg' dot className='max-w-full'>
                  {error}
                </Badge>
              ))}
            </div>
          )}

          {/* Input container */}
          <div
            className={cn(
              useDeployedChrome &&
                'rounded-[20px] bg-gradient-to-r from-[#93c5fd] via-[#c4b5fd] to-[#f9a8d4] p-[1px] shadow-sm'
            )}
          >
            <div
              role='group'
              aria-label='Chat message input'
              onClick={handleContainerClick}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                handleKeyboardActivation(event, focusTextarea)
              }}
              className={cn(
                'relative z-10 cursor-text bg-white',
                useDeployedChrome
                  ? 'rounded-[19px] px-2 py-1.5'
                  : 'rounded-2xl border border-[var(--border-1)] px-2.5 py-2',
                isDragOver && 'border-purple-500'
              )}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isStreaming) setDragCounter((prev) => prev + 1)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isStreaming) e.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragCounter((prev) => Math.max(0, prev - 1))
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragCounter(0)
              if (!isStreaming) handleFileSelect(e.dataTransfer.files)
            }}
          >
            {/* File thumbnails */}
            {selectedGeneratedImages.length > 0 && (
              <div className='mb-1.5 flex flex-wrap gap-1.5'>
                {selectedGeneratedImages.map((image) => (
                  <Tooltip.Root key={image.id}>
                    <Tooltip.Trigger asChild>
                      <div className='group relative h-[56px] w-[56px] flex-shrink-0 cursor-pointer overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-5)] dark:bg-[var(--landing-bg)]'>
                        <img
                          src={image.url}
                          alt={image.name}
                          className='h-full w-full object-cover'
                        />
                        {onRemoveSelectedGeneratedImage && (
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemoveSelectedGeneratedImage(image.id)
                            }}
                            className='absolute top-[2px] right-[2px] flex h-[16px] w-[16px] items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100'
                          >
                            <X className='h-[10px] w-[10px] text-white' />
                          </button>
                        )}
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Content side='top'>
                      <p className='max-w-[240px] truncate'>{image.name}</p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                ))}
              </div>
            )}

            {attachedFiles.length > 0 && (
              <div className='mb-1.5 flex flex-wrap gap-1.5'>
                {attachedFiles.map((file) => (
                  <Tooltip.Root key={file.id}>
                    <Tooltip.Trigger asChild>
                      <div className='group relative size-[56px] flex-shrink-0 cursor-pointer overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-5)] dark:bg-[var(--landing-bg)]'>
                        {file.dataUrl ? (
                          <img
                            src={file.dataUrl}
                            alt={file.name}
                            className='h-full w-full object-cover'
                          />
                        ) : (
                          <div className='flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--landing-text-muted)]'>
                            <Paperclip className='size-[18px]' />
                            <span className='max-w-[48px] truncate px-[2px] text-[9px]'>
                              {file.name.split('.').pop()}
                            </span>
                          </div>
                        )}
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFile(file.id)
                          }}
                          className='absolute top-[2px] right-[2px] flex size-[16px] items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100'
                        >
                          <X className='size-[10px] text-white' />
                        </button>
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Content side='top'>
                      <p className='max-w-[200px] truncate'>{file.name}</p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                ))}
              </div>
            )}

            {/* Textarea + controls */}
            {useDeployedChrome ? (
              renderDeployedControls()
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isDragOver ? 'Drop files here...' : placeholder}
                  rows={1}
                  className='m-0 h-auto min-h-[24px] w-full resize-none overflow-y-auto overflow-x-hidden border-0 bg-transparent p-1 text-[15px] leading-[24px] outline-none [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-[var(--landing-text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden'
                />

                <div className='flex items-center justify-between'>
                  <div>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type='button'
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isStreaming || attachedFiles.length >= 15}
                          className='flex size-[28px] items-center justify-center rounded-full text-[var(--text-icon)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--landing-text-muted)] dark:hover:bg-[#303030]'
                        >
                          <Paperclip className='size-[16px]' strokeWidth={2} />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Content side='top'>
                        <p>Attach files</p>
                      </Tooltip.Content>
                    </Tooltip.Root>

                    <input
                      ref={fileInputRef}
                      type='file'
                      multiple
                      accept={CHAT_ACCEPT_ATTRIBUTE}
                      onChange={(e) => {
                        handleFileSelect(e.target.files)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className='hidden'
                      disabled={isStreaming}
                    />
                  </div>

                  <div className='flex items-center gap-1.5'>
                    {sttAvailable && (
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            type='button'
                            onClick={onVoiceStart}
                            disabled={isStreaming}
                            className='flex size-[28px] items-center justify-center rounded-full text-[var(--text-icon)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--landing-text-muted)] dark:hover:bg-[#303030]'
                          >
                            <Mic className='size-[16px]' strokeWidth={2} />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content side='top'>
                          <p>Start voice conversation</p>
                        </Tooltip.Content>
                      </Tooltip.Root>
                    )}

                    {isStreaming ? (
                      <button
                        type='button'
                        onClick={onStopStreaming}
                        className='flex size-[28px] items-center justify-center rounded-full border-0 bg-[#383838] p-0 transition-colors hover:bg-[#575757] dark:bg-[#E0E0E0] dark:hover:bg-[#CFCFCF]'
                        title='Stop generation'
                      >
                        <svg
                          className='block size-[14px] fill-white dark:fill-black'
                          viewBox='0 0 24 24'
                          xmlns='http://www.w3.org/2000/svg'
                        >
                          <rect x='4' y='4' width='16' height='16' rx='3' ry='3' />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type='button'
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={cn(
                          'flex h-[28px] w-[28px] items-center justify-center rounded-full border-0 p-0 transition-colors',
                          canSubmit
                            ? 'bg-[#383838] hover:bg-[#575757] dark:bg-[#E0E0E0] dark:hover:bg-[#CFCFCF]'
                            : 'bg-[#808080] dark:bg-[#808080]'
                        )}
                      >
                        <ArrowUp
                          className='block size-[16px] text-white dark:text-black'
                          strokeWidth={2.25}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </Tooltip.Provider>
  )
}
