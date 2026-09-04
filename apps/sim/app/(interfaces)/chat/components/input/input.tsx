'use client'

import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Badge, Button, cn, handleKeyboardActivation, Tooltip } from '@sim/emcn'
import { ArrowUp, Paperclip, X } from '@sim/emcn/icons'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import type { SelectedGeneratedImage } from '@/lib/chat/generated-image-selection'
import { CHAT_ACCEPT_ATTRIBUTE } from '@/lib/uploads/utils/validation'

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
  /** @deprecated Voice UI removed; kept for call-site compat. */
  onVoiceStart?: () => void
  /** @deprecated Voice UI removed; kept for call-site compat. */
  voiceOnly?: boolean
  selectedGeneratedImages?: SelectedGeneratedImage[]
  onRemoveSelectedGeneratedImage?: (imageId: string) => void
  /** When set, this text is inserted into the input followed by a space and the input is focused; then onInsertConsumed is called */
  insertText?: string
  /** Called after insertText has been applied so the parent can clear it */
  onInsertConsumed?: () => void
  /** @deprecated Voice UI removed; kept for call-site compat. */
  sttAvailable?: boolean
  /** When true, input is positioned within the flex main column instead of fixed viewport offsets */
  embedded?: boolean
  /** Landing-page layout; same in-flow positioning as `embedded` */
  landing?: boolean
  placeholder?: string
}> = ({
  onSubmit,
  isStreaming = false,
  onStopStreaming,
  selectedGeneratedImages = [],
  onRemoveSelectedGeneratedImage,
  insertText,
  onInsertConsumed,
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

  const inFlow = landing || embedded

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [inputValue])

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

  return (
    <Tooltip.Provider>
      <div
        className={cn(
          'flex w-full items-center justify-center',
          inFlow
            ? 'relative w-full shrink-0 px-0 pb-0'
            : 'fixed right-0 bottom-0 left-0 bg-linear-to-t from-[var(--bg)] to-transparent px-4 pb-4 md:px-0 md:pb-4'
        )}
      >
        <div ref={wrapperRef} className={cn('w-full', !inFlow && 'max-w-3xl md:max-w-[768px]')}>
          {uploadErrors.length > 0 && (
            <div className='mb-3 flex flex-col gap-2'>
              {uploadErrors.map((error, idx) => (
                <Badge key={`${error}-${idx}`} variant='red' size='lg' dot className='max-w-full'>
                  {error}
                </Badge>
              ))}
            </div>
          )}

          <div className='w-full'>
            <div
              role='group'
              aria-label='Chat message input'
              onClick={handleContainerClick}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                handleKeyboardActivation(event, focusTextarea)
              }}
              className={cn(
                'relative z-10 w-full cursor-text rounded-2xl border border-[var(--border-1)] bg-[var(--surface-2)] px-2.5 py-2',
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
              {selectedGeneratedImages.length > 0 && (
                <div className='mb-1.5 flex flex-wrap gap-1.5'>
                  {selectedGeneratedImages.map((image) => (
                    <Tooltip.Root key={image.id}>
                      <Tooltip.Trigger asChild>
                        <div className='group relative size-[56px] shrink-0 cursor-pointer overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-3)]'>
                          <img
                            src={image.url}
                            alt={image.name}
                            className='h-full w-full object-cover'
                          />
                          {onRemoveSelectedGeneratedImage && (
                            <Button
                              type='button'
                              variant='ghost'
                              aria-label={`Remove ${image.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveSelectedGeneratedImage(image.id)
                              }}
                              className='absolute top-[2px] right-[2px] size-[16px] rounded-full bg-black/60 p-0 text-white opacity-0 hover-hover:text-white group-hover:opacity-100'
                            >
                              <X className='size-[10px]' />
                            </Button>
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
                        <div className='group relative size-[56px] shrink-0 cursor-pointer overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-3)]'>
                          {file.dataUrl ? (
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className='h-full w-full object-cover'
                            />
                          ) : (
                            <div className='flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--text-muted)]'>
                              <Paperclip className='size-[18px]' />
                              <span className='max-w-[48px] truncate px-[2px] text-[9px]'>
                                {file.name.split('.').pop()}
                              </span>
                            </div>
                          )}
                          <Button
                            type='button'
                            variant='ghost'
                            aria-label={`Remove ${file.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveFile(file.id)
                            }}
                            className='absolute top-[2px] right-[2px] size-[16px] rounded-full bg-black/60 p-0 text-white opacity-0 hover-hover:text-white group-hover:opacity-100'
                          >
                            <X className='size-[10px]' />
                          </Button>
                        </div>
                      </Tooltip.Trigger>
                      <Tooltip.Content side='top'>
                        <p className='max-w-[200px] truncate'>{file.name}</p>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  ))}
                </div>
              )}

              <>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isDragOver ? 'Drop files here...' : placeholder}
                  rows={1}
                  className='m-0 h-auto min-h-[24px] w-full resize-none overflow-y-auto overflow-x-hidden border-0 bg-transparent p-1 text-[15px] text-[var(--text-primary)] leading-[24px] caret-[var(--text-primary)] outline-hidden [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-[var(--text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden'
                />

                <div className='flex items-center justify-between'>
                  <div>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <Button
                          type='button'
                          variant='quiet'
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isStreaming || attachedFiles.length >= 15}
                          className='size-[28px] rounded-full p-0'
                          aria-label='Attach files'
                        >
                          <Paperclip className='size-[16px]' />
                        </Button>
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
                    {isStreaming ? (
                      <Button
                        type='button'
                        variant='primary'
                        onClick={onStopStreaming}
                        className='size-[28px] rounded-full p-0'
                        aria-label='Stop generation'
                      >
                        <svg
                          className='block size-[14px] fill-current'
                          viewBox='0 0 24 24'
                          xmlns='http://www.w3.org/2000/svg'
                        >
                          <rect x='4' y='4' width='16' height='16' rx='3' ry='3' />
                        </svg>
                      </Button>
                    ) : (
                      <Button
                        type='button'
                        variant='primary'
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        aria-label='Send message'
                        className='size-[28px] rounded-full p-0'
                      >
                        <ArrowUp className='block size-[16px]' />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            </div>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  )
}
