'use client'

import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { ArrowUp, Mic, Paperclip, X } from 'lucide-react'
import { Badge, Tooltip } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
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
  /** When set, this text is inserted into the input followed by a space and the input is focused; then onInsertConsumed is called */
  insertText?: string
  /** Called after insertText has been applied so the parent can clear it */
  onInsertConsumed?: () => void
  sttAvailable?: boolean
}> = ({
  onSubmit,
  isStreaming = false,
  onStopStreaming,
  onVoiceStart,
  voiceOnly = false,
  insertText,
  onInsertConsumed,
  sttAvailable = false,
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
    if (!inputValue.trim() && attachedFiles.length === 0) return
    onSubmit?.(inputValue.trim(), false, attachedFiles)
    setInputValue('')
    setAttachedFiles([])
    setUploadErrors([])
  }, [isStreaming, inputValue, attachedFiles, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    textareaRef.current?.focus()
  }, [])

  const canSubmit = (inputValue.trim().length > 0 || attachedFiles.length > 0) && !isStreaming

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
      <div className='fixed right-0 bottom-0 left-0 ml-[118px] flex w-full items-center justify-center bg-gradient-to-t from-white to-transparent px-4 pb-4 text-black md:px-0 md:pb-4'>
        <div ref={wrapperRef} className='w-full max-w-3xl md:max-w-[748px]'>
          {/* Error Messages */}
          {uploadErrors.length > 0 && (
            <div className='mb-3 flex flex-col gap-2'>
              {uploadErrors.map((error, idx) => (
                <Badge key={idx} variant='red' size='lg' dot className='max-w-full'>
                  {error}
                </Badge>
              ))}
            </div>
          )}

          {/* Input container */}
          <div
            onClick={handleContainerClick}
            className={cn(
              'relative z-10 cursor-text rounded-[20px] border border-[var(--border-1)] bg-white px-2.5 py-2',
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
            {attachedFiles.length > 0 && (
              <div className='mb-1.5 flex flex-wrap gap-1.5'>
                {attachedFiles.map((file) => (
                  <Tooltip.Root key={file.id}>
                    <Tooltip.Trigger asChild>
                      <div className='group relative h-[56px] w-[56px] flex-shrink-0 cursor-pointer overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--landing-bg)]'>
                        {file.dataUrl ? (
                          <img
                            src={file.dataUrl}
                            alt={file.name}
                            className='h-full w-full object-cover'
                          />
                        ) : (
                          <div className='flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--landing-text-muted)]'>
                            <Paperclip className='h-[18px] w-[18px]' />
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
                          className='absolute top-[2px] right-[2px] flex h-[16px] w-[16px] items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100'
                        >
                          <X className='h-[10px] w-[10px] text-white' />
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

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isDragOver ? 'Drop files here...' : 'Enter a message...'}
              rows={1}
              className='m-0 h-auto min-h-[24px] w-full resize-none overflow-y-auto overflow-x-hidden border-0 bg-transparent px-1 py-1 text-[15px] leading-[24px] caret-black outline-none [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-[var(--landing-text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden'
            />

            {/* Bottom row */}
            <div className='flex items-center justify-between'>
              {/* Left: attach */}
              <div>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type='button'
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || attachedFiles.length >= 15}
                      className='flex h-[28px] w-[28px] items-center justify-center rounded-full text-[var(--landing-text-muted)] transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#303030]'
                    >
                      <Paperclip className='h-[16px] w-[16px]' strokeWidth={2} />
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

              {/* Right: mic + send */}
              <div className='flex items-center gap-1.5'>
                {sttAvailable && (
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type='button'
                        onClick={onVoiceStart}
                        disabled={isStreaming}
                        className='flex h-[28px] w-[28px] items-center justify-center rounded-full text-[var(--landing-text-muted)] transition-colors hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#303030]'
                      >
                        <Mic className='h-[16px] w-[16px]' strokeWidth={2} />
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
                    className='flex h-[28px] w-[28px] items-center justify-center rounded-full border-0 bg-[#383838] p-0 transition-colors hover:bg-[#575757] dark:bg-[#E0E0E0] dark:hover:bg-[#CFCFCF]'
                    title='Stop generation'
                  >
                    <svg
                      className='block h-[14px] w-[14px] fill-white dark:fill-black'
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
                      className='block h-[16px] w-[16px] text-white dark:text-black'
                      strokeWidth={2.25}
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  )
}
