'use client'

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUp,
  MoreVertical,
  Paperclip,
  Square,
  X,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverScrollArea,
  PopoverTrigger,
  Tooltip,
  Trash,
} from '@/components/emcn'
import { useSession } from '@/lib/auth/auth-client'
import {
  extractAssistantFilesFromData,
  extractGeneratedImagesFromData,
  isAssistantImageUrl,
} from '@/lib/chat/assistant-assets'
import { useGeneratedImageReuse } from '@/lib/chat/use-generated-image-reuse'
import { cn } from '@/lib/core/utils/cn'
import {
  extractBlockIdFromOutputId,
  extractPathFromOutputId,
  parseOutputContentSafely,
} from '@/lib/core/utils/response-format'
import { useWorkspaceSettings } from '@/hooks/queries/workspace'
import { CHAT_ACCEPT_ATTRIBUTE } from '@/lib/uploads/utils/validation'
import { getCustomInputFields, normalizeInputFormatValue } from '@/lib/workflows/input-format'
import { StartBlockPath, TriggerUtils } from '@/lib/workflows/triggers/triggers'
import { type InputFormatField, START_BLOCK_RESERVED_FIELDS } from '@/lib/workflows/types'
import {
  workflowChatAddInputEvent,
  workflowChatMsgSentEvent,
} from '@/app/arenaMixpanelEvents/mixpanelEvents'
import type { ChatMessageAttachment } from '@/app/workspace/[workspaceId]/home/types'
import {
  ChatMessage,
  OutputSelect,
  StartBlockInputModal,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components'
import { useChatFileUpload } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/hooks'
import { usePreventZoom, useScrollManagement } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks'
import {
  useFloatBoundarySync,
  useFloatDrag,
  useFloatResize,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/float'
import { useWorkflowExecution } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-workflow-execution'
import type { BlockLog, ExecutionResult } from '@/executor/types'
import { useChatStore } from '@/stores/chat/store'
import { getChatPosition } from '@/stores/chat/utils'
import { useCurrentWorkflowExecution } from '@/stores/execution'
import { useOperationQueue } from '@/stores/operation-queue/store'
import { useTerminalConsoleStore, useWorkflowConsoleEntries } from '@/stores/terminal'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'
import { useSubBlockStore } from '@/stores/workflows/subblock/store'
import { useWorkflowStore } from '@/stores/workflows/workflow/store'

const logger = createLogger('FloatingChat')

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round((bytes / 1024 ** i) * 10) / 10} ${units[i]}`
}

interface ChatFile {
  id: string
  name: string
  type: string
  size: number
  file: File
}

const FILE_READ_TIMEOUT_MS = 60000

const processFileAttachments = async (chatFiles: ChatFile[]): Promise<ChatMessageAttachment[]> => {
  return Promise.all(
    chatFiles.map(async (file) => {
      let previewUrl: string | undefined
      if (file.type.startsWith('image/')) {
        try {
          previewUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            let settled = false

            const timeoutId = setTimeout(() => {
              if (!settled) {
                settled = true
                reader.abort()
                reject(new Error(`File read timed out after ${FILE_READ_TIMEOUT_MS}ms`))
              }
            }, FILE_READ_TIMEOUT_MS)

            reader.onload = () => {
              if (!settled) {
                settled = true
                clearTimeout(timeoutId)
                resolve(reader.result as string)
              }
            }
            reader.onerror = () => {
              if (!settled) {
                settled = true
                clearTimeout(timeoutId)
                reject(reader.error)
              }
            }
            reader.onabort = () => {
              if (!settled) {
                settled = true
                clearTimeout(timeoutId)
                reject(new Error('File read aborted'))
              }
            }
            reader.readAsDataURL(file.file)
          })
        } catch (error) {
          logger.error('Error reading file as data URL:', error)
        }
      }
      return {
        id: file.id,
        filename: file.name,
        media_type: file.type,
        size: file.size,
        previewUrl,
      }
    })
  )
}

const extractOutputFromLogs = (logs: BlockLog[] | undefined, outputId: string): unknown => {
  const blockId = extractBlockIdFromOutputId(outputId)
  const path = extractPathFromOutputId(outputId, blockId)
  const log = logs?.find((l) => l.blockId === blockId)

  if (!log) return undefined

  let output = log.output

  if (path) {
    output = parseOutputContentSafely(output)
    const pathParts = path.split('.')
    let current = output
    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        return undefined
      }
    }
    return current
  }

  return output
}

const formatOutputContent = (output: unknown): string => {
  if (typeof output === 'string') {
    return output
  }
  if (output && typeof output === 'object') {
    return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``
  }
  return ''
}

interface StartInputFormatField {
  id?: string
  name?: string
  type?: string
  value?: unknown
  collapsed?: boolean
}

export function P2Chat() {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const activeWorkflowId = useWorkflowRegistry((s) => s.activeWorkflowId)
  const blocks = useWorkflowStore((state) => state.blocks)
  const triggerWorkflowUpdate = useWorkflowStore((state) => state.triggerUpdate)
  const setSubBlockValue = useSubBlockStore((state) => state.setValue)
  const { data: workspaceData } = useWorkspaceSettings(workspaceId)
  const workspaceName = workspaceData?.settings?.workspace?.name || 'Unknown Workspace'

  const {
    isChatOpen,
    chatPosition,
    chatWidth,
    chatHeight,
    setIsChatOpen,
    setChatPosition,
    setChatDimensions,
    messages,
    addMessage,
    selectedWorkflowOutputs,
    setSelectedWorkflowOutput,
    appendMessageContent,
    finalizeMessageStream,
    getConversationId,
    clearChat,
    exportChatCSV,
  } = useChatStore(
    useShallow((s) => ({
      isChatOpen: s.isChatOpen,
      chatPosition: s.chatPosition,
      chatWidth: s.chatWidth,
      chatHeight: s.chatHeight,
      setIsChatOpen: s.setIsChatOpen,
      setChatPosition: s.setChatPosition,
      setChatDimensions: s.setChatDimensions,
      messages: s.messages,
      addMessage: s.addMessage,
      selectedWorkflowOutputs: s.selectedWorkflowOutputs,
      setSelectedWorkflowOutput: s.setSelectedWorkflowOutput,
      appendMessageContent: s.appendMessageContent,
      finalizeMessageStream: s.finalizeMessageStream,
      getConversationId: s.getConversationId,
      clearChat: s.clearChat,
      exportChatCSV: s.exportChatCSV,
    }))
  )

  const hasConsoleHydrated = useTerminalConsoleStore((state) => state._hasHydrated)
  const entries = useWorkflowConsoleEntries(
    hasConsoleHydrated && typeof activeWorkflowId === 'string' ? activeWorkflowId : undefined
  )
  const { isExecuting } = useCurrentWorkflowExecution()
  const { handleRunWorkflow, handleCancelExecution } = useWorkflowExecution()
  const { data: session } = useSession()
  const { addToQueue } = useOperationQueue()

  const [chatMessage, setChatMessage] = useState('')
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [startBlockInputs, setStartBlockInputs] = useState<Record<string, unknown>>({})
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasShownModalRef = useRef<boolean>(false)
  const hasCheckedModalRef = useRef<boolean>(false)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const preventZoomRef = usePreventZoom()

  const {
    chatFiles,
    uploadErrors,
    isDragOver,
    removeFile,
    clearFiles,
    clearErrors,
    handleFileInputChange,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useChatFileUpload()
  const filePreviewUrls = useRef<Map<string, string>>(new Map())

  const getFilePreviewUrl = useCallback((file: ChatFile): string | null => {
    if (!file.type.startsWith('image/')) return null

    const existing = filePreviewUrls.current.get(file.id)
    if (existing) return existing

    const url = URL.createObjectURL(file.file)
    filePreviewUrls.current.set(file.id, url)
    return url
  }, [])

  useEffect(() => {
    const currentFileIds = new Set(chatFiles.map((f) => f.id))
    const urlMap = filePreviewUrls.current

    for (const [fileId, url] of urlMap.entries()) {
      if (!currentFileIds.has(fileId)) {
        URL.revokeObjectURL(url)
        urlMap.delete(fileId)
      }
    }

    return () => {
      for (const url of urlMap.values()) {
        URL.revokeObjectURL(url)
      }
      urlMap.clear()
    }
  }, [chatFiles])

  const startBlockCandidate = useMemo(() => {
    if (!activeWorkflowId) {
      return null
    }

    if (!blocks || Object.keys(blocks).length === 0) {
      return null
    }

    const candidate = TriggerUtils.findStartBlock(blocks, 'chat')
    if (!candidate || candidate.path !== StartBlockPath.UNIFIED) {
      return null
    }

    return candidate
  }, [activeWorkflowId, blocks])

  const startBlockId = startBlockCandidate?.blockId ?? null

  const startBlockInputFormat = useSubBlockStore((state) => {
    if (!activeWorkflowId || !startBlockId) {
      return null
    }

    const workflowValues = state.workflowValues[activeWorkflowId]
    const fromStore = workflowValues?.[startBlockId]?.inputFormat
    if (fromStore !== undefined && fromStore !== null) {
      return fromStore
    }

    const startBlock = blocks[startBlockId]
    return startBlock?.subBlocks?.inputFormat?.value ?? null
  })

  const missingStartReservedFields = useMemo(() => {
    if (!startBlockId) {
      return START_BLOCK_RESERVED_FIELDS
    }

    const normalizedFields = normalizeInputFormatValue(startBlockInputFormat)
    const existingNames = new Set(
      normalizedFields
        .map((field) => field.name)
        .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
        .map((name) => name.trim().toLowerCase())
    )

    return START_BLOCK_RESERVED_FIELDS.filter(
      (fieldName) => !existingNames.has(fieldName.toLowerCase())
    )
  }, [startBlockId, startBlockInputFormat])

  const shouldShowConfigureStartInputsButton =
    Boolean(startBlockId) && missingStartReservedFields.length > 0

  const actualPosition = useMemo(
    () => getChatPosition(chatPosition, chatWidth, chatHeight),
    [chatPosition, chatWidth, chatHeight]
  )

  const { handleMouseDown } = useFloatDrag({
    position: actualPosition,
    width: chatWidth,
    height: chatHeight,
    onPositionChange: setChatPosition,
  })

  useFloatBoundarySync({
    isOpen: isChatOpen,
    position: actualPosition,
    width: chatWidth,
    height: chatHeight,
    onPositionChange: setChatPosition,
  })

  const {
    cursor: resizeCursor,
    handleMouseMove: handleResizeMouseMove,
    handleMouseLeave: handleResizeMouseLeave,
    handleMouseDown: handleResizeMouseDown,
  } = useFloatResize({
    position: actualPosition,
    width: chatWidth,
    height: chatHeight,
    onPositionChange: setChatPosition,
    onDimensionsChange: setChatDimensions,
  })

  const outputEntries = useMemo(() => {
    return entries.filter((entry) => entry.output)
  }, [entries])

  const workflowMessages = useMemo(() => {
    if (!activeWorkflowId) return []
    return messages
      .filter((msg) => msg.workflowId === activeWorkflowId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [messages, activeWorkflowId])

  const {
    selectedGeneratedImages,
    effectiveGeneratedImages,
    selectedGeneratedImageIds,
    toggleGeneratedImageSelection,
    removeSelectedGeneratedImage,
    clearSelectedGeneratedImages,
    materializeSelectedGeneratedImages,
  } = useGeneratedImageReuse(workflowMessages)

  const isStreaming = useMemo(() => {
    const lastMessage = workflowMessages[workflowMessages.length - 1]
    return Boolean(lastMessage?.isStreaming)
  }, [workflowMessages])

  const customFields = useMemo(() => {
    return getCustomInputFields(startBlockInputFormat as InputFormatField[])
  }, [startBlockInputFormat])

  useEffect(() => {
    if (workflowMessages.length > 0) {
      hasShownModalRef.current = false
      hasCheckedModalRef.current = false
    }
  }, [workflowMessages.length, activeWorkflowId])

  useEffect(() => {
    if (!isChatOpen) {
      hasCheckedModalRef.current = false
    }
  }, [isChatOpen])

  useEffect(() => {
    if (isChatOpen && !hasCheckedModalRef.current && workflowMessages.length === 0) {
      hasCheckedModalRef.current = true

      if (customFields.length > 0 && !hasShownModalRef.current) {
        hasShownModalRef.current = true
        setIsInputModalOpen(true)
      }
    }
  }, [isChatOpen, workflowMessages.length, customFields.length])

  const messagesForScrollHook = useMemo(() => {
    return workflowMessages.map((msg) => ({
      ...msg,
      role: msg.type,
    }))
  }, [workflowMessages])

  const { scrollAreaRef, scrollToBottom } = useScrollManagement(messagesForScrollHook, isStreaming, {
    behavior: 'auto',
  })

  const userMessages = useMemo(() => {
    return workflowMessages
      .filter((msg) => msg.type === 'user')
      .map((msg) => msg.content)
      .filter((content): content is string => typeof content === 'string')
  }, [workflowMessages])

  const handleToggleUserAttachmentImageSelection = useCallback(
    (messageId: string, attachment: ChatMessageAttachment) => {
      if (!attachment.previewUrl || !attachment.media_type.startsWith('image/')) {
        return
      }

      toggleGeneratedImageSelection(messageId, {
        id: attachment.id,
        name: attachment.filename,
        url: attachment.previewUrl,
        type: attachment.media_type,
      })
    },
    [toggleGeneratedImageSelection]
  )

  useEffect(() => {
    if (!activeWorkflowId) {
      setPromptHistory([])
      setHistoryIndex(-1)
      return
    }

    setPromptHistory(userMessages)
    setHistoryIndex(-1)
  }, [activeWorkflowId, userMessages])

  useEffect(() => {
    if (workflowMessages.length > 0 && isChatOpen) {
      scrollToBottom()
    }
  }, [workflowMessages.length, scrollToBottom, isChatOpen])

  const selectedOutputs = useMemo(() => {
    if (!activeWorkflowId) return []
    const selected = selectedWorkflowOutputs[activeWorkflowId]
    return selected && selected.length > 0 ? [...new Set(selected)] : []
  }, [selectedWorkflowOutputs, activeWorkflowId])

  const focusInput = useCallback((delay = 0) => {
    timeoutRef.current && clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      if (inputRef.current && document.contains(inputRef.current)) {
        inputRef.current.focus({ preventScroll: true })
      }
    }, delay)
  }, [])

  useEffect(() => {
    return () => {
      timeoutRef.current && clearTimeout(timeoutRef.current)
      streamReaderRef.current?.cancel()
    }
  }, [])

  const handleStopStreaming = useCallback(() => {
    streamReaderRef.current?.cancel()
    streamReaderRef.current = null
    handleCancelExecution()
  }, [handleCancelExecution])

  const processStreamingResponse = useCallback(
    async (stream: ReadableStream, responseMessageId: string) => {
      const reader = stream.getReader()
      streamReaderRef.current = reader
      const decoder = new TextDecoder()
      let accumulatedContent = ''
      let buffer = ''
      let receivedFinalEvent = false
      let finalEventData: ExecutionResult | null = null
      let chunkCount = 0

      const BATCH_MAX_MS = 50
      let pendingChunks = ''
      let batchRAF: number | null = null
      let batchTimer: ReturnType<typeof setTimeout> | null = null
      let lastFlush = 0

      const flushChunks = () => {
        if (batchRAF !== null) {
          cancelAnimationFrame(batchRAF)
          batchRAF = null
        }
        if (batchTimer !== null) {
          clearTimeout(batchTimer)
          batchTimer = null
        }
        if (pendingChunks) {
          appendMessageContent(responseMessageId, pendingChunks)
          pendingChunks = ''
        }
        lastFlush = performance.now()
      }

      const scheduleFlush = () => {
        if (batchRAF !== null) return
        const elapsed = performance.now() - lastFlush
        if (elapsed >= BATCH_MAX_MS) {
          flushChunks()
          return
        }
        batchRAF = requestAnimationFrame(flushChunks)
        if (batchTimer === null) {
          batchTimer = setTimeout(flushChunks, Math.max(0, BATCH_MAX_MS - elapsed))
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split('\n\n').filter((line) => line.trim())
              for (const line of lines) {
                if (!line.startsWith('data: ')) {
                  const trimmed = line.trim()
                  if (trimmed && trimmed !== '[DONE]') {
                    try {
                      const json = JSON.parse(trimmed)
                      const { event, data: eventData, chunk: contentChunk } = json
                      if (event === 'final' && eventData) {
                        receivedFinalEvent = true
                        finalEventData = eventData as ExecutionResult
                      } else if (contentChunk && typeof contentChunk === 'string') {
                        accumulatedContent += contentChunk
                        appendMessageContent(responseMessageId, contentChunk)
                        chunkCount++
                      }
                    } catch {}
                  }
                  continue
                }

                const data = line.substring(6).trim()
                if (data === '[DONE]' || !data) continue

                try {
                  const json = JSON.parse(data)
                  const { event, data: eventData, chunk: contentChunk } = json

                  if (event === 'final' && eventData) {
                    receivedFinalEvent = true
                    finalEventData = eventData as ExecutionResult
                  } else if (contentChunk && typeof contentChunk === 'string') {
                    accumulatedContent += contentChunk
                    appendMessageContent(responseMessageId, contentChunk)
                    chunkCount++
                  }
                } catch {}
              }
            }

            let contentToSet: string | Record<string, unknown> | undefined
            if (receivedFinalEvent && finalEventData) {
              const result = finalEventData as ExecutionResult & {
                output?: Record<string, Record<string, unknown>>
              }
              if ('success' in result && !result.success) {
                const errorMessage = result.error || 'Workflow execution failed'
                appendMessageContent(
                  responseMessageId,
                  `${accumulatedContent ? '\n\n' : ''}Error: ${errorMessage}`
                )
              } else if (result.output) {
                const imageUrlsFromOutput = (obj: unknown): string[] => {
                  if (!obj || typeof obj !== 'object') return []
                  const o = obj as Record<string, unknown>
                  const extractedUrls = extractGeneratedImagesFromData(o).map((image) => image.url)
                  if (extractedUrls.length > 0) {
                    return extractedUrls
                  }
                  const fallbackUrl =
                    (o.output as Record<string, unknown> | undefined)?.image ??
                    o.image ??
                    (isAssistantImageUrl(o.content) ? o.content : null)
                  if (typeof fallbackUrl === 'string' && isAssistantImageUrl(fallbackUrl)) {
                    return [fallbackUrl]
                  }
                  return []
                }

                for (const block of Object.values(result.output)) {
                  const imageUrls = imageUrlsFromOutput(block)
                  if (imageUrls.length > 0) {
                    const blockObj = block as Record<string, unknown>
                    const output = blockObj.output as Record<string, unknown> | undefined
                    const s3UploadFailed = output?.s3UploadFailed ?? blockObj.s3UploadFailed
                    contentToSet = {
                      content: accumulatedContent || '',
                      image: imageUrls[0] ?? '',
                      images: imageUrls,
                      ...(s3UploadFailed === true && { s3UploadFailed: true }),
                    }
                    break
                  }
                }
              }
            }

            logger.debug('Finalizing stream', {
              messageId: responseMessageId,
              finalAccumulatedLength: accumulatedContent.length,
              totalChunks: chunkCount,
            })

            flushChunks()
            finalizeMessageStream(responseMessageId, contentToSet, {
              files:
                receivedFinalEvent && finalEventData && finalEventData.output
                  ? extractAssistantFilesFromData(finalEventData.output)
                  : undefined,
              generatedImages:
                receivedFinalEvent && finalEventData && finalEventData.output
                  ? extractGeneratedImagesFromData(finalEventData.output)
                  : undefined,
            })
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          if (!chunk) continue

          buffer += chunk

          const separatorIndex = buffer.lastIndexOf('\n\n')
          if (separatorIndex === -1) {
            continue
          }

          const processable = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          const lines = processable.split('\n\n').filter((line) => line.trim())

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue
            }

            const data = line.substring(6).trim()
            if (data === '[DONE]' || !data) continue

            try {
              const json = JSON.parse(data)
              const { event, data: eventData, chunk: contentChunk } = json

              if (event === 'final' && eventData) {
                receivedFinalEvent = true
                finalEventData = eventData as ExecutionResult
                if (
                  selectedOutputs.length > 0 &&
                  'logs' in finalEventData &&
                  Array.isArray(finalEventData.logs) &&
                  activeWorkflowId
                ) {
                  if ('success' in finalEventData && !finalEventData.success) {
                    const errorMessage = finalEventData.error || 'Workflow execution failed'
                    flushChunks()
                    appendMessageContent(
                      responseMessageId,
                      `${accumulatedContent ? '\n\n' : ''}Error: ${errorMessage}`
                    )
                    finalizeMessageStream(responseMessageId)
                    return
                  }
                  continue
                }

                flushChunks()
                finalizeMessageStream(responseMessageId)
              } else if (contentChunk) {
                accumulatedContent += contentChunk
                pendingChunks += contentChunk
                scheduleFlush()
              }
            } catch (e) {
              logger.error('Error parsing stream data:', e)
            }
          }
        }
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          logger.error('Error processing stream:', error)
        }
        flushChunks()
        finalizeMessageStream(responseMessageId)
      } finally {
        if (batchRAF !== null) cancelAnimationFrame(batchRAF)
        if (batchTimer !== null) clearTimeout(batchTimer)
        if (streamReaderRef.current === reader) {
          streamReaderRef.current = null
        }
        try {
          reader.releaseLock()
        } catch {}
        focusInput(100)
      }
    },
    [appendMessageContent, finalizeMessageStream, focusInput, selectedOutputs, activeWorkflowId]
  )

  const handleWorkflowResponse = useCallback(
    (result: unknown) => {
      if (!result || !activeWorkflowId) return
      if (typeof result !== 'object') return

      if ('stream' in result && result.stream instanceof ReadableStream) {
        const responseMessageId = crypto.randomUUID()
        addMessage({
          id: responseMessageId,
          content: '',
          workflowId: activeWorkflowId,
          type: 'workflow',
          isStreaming: true,
        })
        processStreamingResponse(result.stream, responseMessageId)
        return
      }

      if ('success' in result && result.success && 'logs' in result && Array.isArray(result.logs)) {
        selectedOutputs
          .map((outputId) => extractOutputFromLogs(result.logs as BlockLog[], outputId))
          .filter((output) => output !== undefined)
          .forEach((output) => {
            const content = formatOutputContent(output)
            const files = extractAssistantFilesFromData(output)
            const generatedImages = extractGeneratedImagesFromData(output)
            if (content || files.length > 0 || generatedImages.length > 0) {
              addMessage({
                content: content || '',
                workflowId: activeWorkflowId,
                type: 'workflow',
                ...(files.length > 0 ? { files } : {}),
                ...(generatedImages.length > 0 ? { generatedImages } : {}),
              })
            }
          })
        return
      }

      if ('success' in result && !result.success) {
        const errorMessage =
          'error' in result && typeof result.error === 'string'
            ? result.error
            : 'Workflow execution failed.'
        addMessage({
          content: `Error: ${errorMessage}`,
          workflowId: activeWorkflowId,
          type: 'workflow',
        })
      }
    },
    [activeWorkflowId, selectedOutputs, addMessage, processStreamingResponse]
  )

  const buildCompleteWorkflowInput = useCallback(
    (
      userInput: string,
      conversationId: string,
      files?: Array<{ name: string; size: number; type: string; file: File }>,
      overrideValues?: Record<string, unknown>
    ) => {
      const normalizedFields = normalizeInputFormatValue(startBlockInputFormat)
      const completeInput: Record<string, unknown> = {}

      for (const field of normalizedFields) {
        const fieldName = field.name?.trim()
        if (fieldName) {
          if (overrideValues && fieldName in overrideValues) {
            completeInput[fieldName] = overrideValues[fieldName] ?? ''
          } else if (field.value !== undefined && field.value !== null) {
            completeInput[fieldName] = field.value
          } else {
            completeInput[fieldName] = startBlockInputs[fieldName] ?? ''
          }
        }
      }

      completeInput.input = userInput
      completeInput.conversationId = conversationId

      if (files && files.length > 0) {
        completeInput.files = files
      }

      return completeInput
    },
    [startBlockInputFormat, startBlockInputs]
  )

  const handleSendMessage = useCallback(async () => {
    if (
      (!chatMessage.trim() && chatFiles.length === 0 && effectiveGeneratedImages.length === 0) ||
      !activeWorkflowId ||
      isExecuting
    ) {
      return
    }

    const sentMessage = chatMessage.trim()

    if (sentMessage && promptHistory[promptHistory.length - 1] !== sentMessage) {
      setPromptHistory((prev) => [...prev, sentMessage])
    }
    setHistoryIndex(-1)

    const conversationId = getConversationId(activeWorkflowId)

    try {
      workflowChatMsgSentEvent({
        'Message Content': sentMessage,
        'Message Type':
          chatFiles?.length > 0 && sentMessage
            ? 'Text + Attachment'
            : chatFiles?.length > 0 && !sentMessage
              ? 'Attachment'
              : 'Text',
        'Message ID': conversationId,
        'Workspace Name': workspaceName,
        'Workspace ID': workspaceId,
      })
      const selectedImageFiles = await materializeSelectedGeneratedImages()
      const combinedChatFiles = [
        ...chatFiles,
        ...selectedImageFiles.map((image) => ({
          id: image.id,
          name: image.name,
          size: image.size,
          type: image.type,
          file: image.file,
        })),
      ]
      const attachmentsWithData = await processFileAttachments(combinedChatFiles)

      addMessage({
        content: sentMessage,
        workflowId: activeWorkflowId,
        type: 'user',
        attachments: attachmentsWithData,
      })

      const fileArray =
        combinedChatFiles.length > 0
          ? combinedChatFiles.map((chatFile) => ({
              name: chatFile.name,
              size: chatFile.size,
              type: chatFile.type,
              file: chatFile.file,
            }))
          : undefined

      const workflowInput = buildCompleteWorkflowInput(sentMessage, conversationId, fileArray)

      if (fileArray && fileArray.length > 0) {
        workflowInput.onUploadError = (message: string) => {
          logger.error('File upload error:', message)
        }
      }

      setChatMessage('')
      clearFiles()
      clearSelectedGeneratedImages()
      clearErrors()
      focusInput(10)

      const result = await handleRunWorkflow(workflowInput)
      handleWorkflowResponse(result)
    } catch (error) {
      logger.error('Error in handleSendMessage:', error)
    }

    focusInput(100)
  }, [
    chatMessage,
    chatFiles,
    effectiveGeneratedImages,
    activeWorkflowId,
    isExecuting,
    promptHistory,
    getConversationId,
    addMessage,
    handleRunWorkflow,
    handleWorkflowResponse,
    focusInput,
    clearFiles,
    clearErrors,
    buildCompleteWorkflowInput,
    clearSelectedGeneratedImages,
    materializeSelectedGeneratedImages,
    workspaceName,
    workspaceId,
  ])

  const handleStartBlockInputsSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!activeWorkflowId || isExecuting || !startBlockId) return

      setStartBlockInputs(values)
      setIsInputModalOpen(false)

      let updatedFields: InputFormatField[] = []
      try {
        const normalizedFields = normalizeInputFormatValue(startBlockInputFormat)
        updatedFields = normalizedFields.map((field) => {
          const fieldName = field.name?.trim()
          if (fieldName && fieldName in values) {
            return {
              ...field,
              value: values[fieldName] ?? '',
            }
          }
          return field
        })

        setSubBlockValue(startBlockId, 'inputFormat', updatedFields)

        const userId = session?.user?.id || 'unknown'
        addToQueue({
          id: crypto.randomUUID(),
          operation: {
            operation: 'subblock-update',
            target: 'subblock',
            payload: {
              blockId: startBlockId,
              subblockId: 'inputFormat',
              value: updatedFields,
            },
          },
          workflowId: activeWorkflowId,
          userId,
        })

        triggerWorkflowUpdate()
      } catch (error) {
        logger.error('Error updating Start Block inputFormat values:', error)
        updatedFields = normalizeInputFormatValue(startBlockInputFormat)
      }

      const conversationId = getConversationId(activeWorkflowId)
      const completeInput: Record<string, unknown> = {}
      for (const field of updatedFields) {
        const fieldName = field.name?.trim()
        if (fieldName) {
          completeInput[fieldName] =
            field.value !== undefined && field.value !== null ? field.value : ''
        }
      }

      completeInput.input = ''
      completeInput.conversationId = conversationId

      try {
        const result = await handleRunWorkflow(completeInput)
        handleWorkflowResponse(result)
      } catch (error) {
        logger.error('Error executing workflow from modal submit:', error)
      }

      focusInput(100)
    },
    [
      activeWorkflowId,
      isExecuting,
      startBlockId,
      startBlockInputFormat,
      setSubBlockValue,
      session,
      addToQueue,
      triggerWorkflowUpdate,
      getConversationId,
      handleRunWorkflow,
      handleWorkflowResponse,
      focusInput,
    ]
  )

  const handleRerun = useCallback(() => {
    setIsInputModalOpen(true)
  }, [])

  const handleKeyPress = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming && !isExecuting) {
          handleSendMessage()
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (promptHistory.length > 0) {
          const newIndex =
            historyIndex === -1 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1)
          setHistoryIndex(newIndex)
          setChatMessage(promptHistory[newIndex])
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIndex >= 0) {
          const newIndex = historyIndex + 1
          if (newIndex >= promptHistory.length) {
            setHistoryIndex(-1)
            setChatMessage('')
          } else {
            setHistoryIndex(newIndex)
            setChatMessage(promptHistory[newIndex])
          }
        }
      }
    },
    [handleSendMessage, promptHistory, historyIndex, isStreaming, isExecuting]
  )

  const handleOutputSelection = useCallback(
    (values: string[]) => {
      if (!activeWorkflowId) return

      const dedupedValues = [...new Set(values)]
      setSelectedWorkflowOutput(activeWorkflowId, dedupedValues)
    },
    [activeWorkflowId, setSelectedWorkflowOutput]
  )

  const handleClose = useCallback(() => {
    setIsChatOpen(false)
  }, [setIsChatOpen])

  const handleConfigureStartInputs = useCallback(() => {
    if (!activeWorkflowId || !startBlockId) {
      logger.warn('Cannot configure start inputs: missing active workflow ID or start block ID')
      return
    }

    try {
      const normalizedExisting = normalizeInputFormatValue(startBlockInputFormat)

      const newReservedFields: StartInputFormatField[] = missingStartReservedFields.map(
        (fieldName) => {
          const defaultType = fieldName === 'files' ? 'file[]' : 'string'

          return {
            id: crypto.randomUUID(),
            name: fieldName,
            type: defaultType,
            value: '',
            collapsed: false,
          }
        }
      )

      const updatedFields: StartInputFormatField[] = [...newReservedFields, ...normalizedExisting]

      setSubBlockValue(startBlockId, 'inputFormat', updatedFields)

      const userId = session?.user?.id || 'unknown'
      addToQueue({
        id: crypto.randomUUID(),
        operation: {
          operation: 'subblock-update',
          target: 'subblock',
          payload: {
            blockId: startBlockId,
            subblockId: 'inputFormat',
            value: updatedFields,
          },
        },
        workflowId: activeWorkflowId,
        userId,
      })

      triggerWorkflowUpdate()
    } catch (error) {
      logger.error('Failed to configure start block reserved inputs', error)
    }
  }, [
    activeWorkflowId,
    missingStartReservedFields,
    setSubBlockValue,
    startBlockId,
    startBlockInputFormat,
    triggerWorkflowUpdate,
    session,
    addToQueue,
  ])

  if (!isChatOpen) return null

  return (
    <div
      ref={preventZoomRef}
      className='fixed z-30 flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 pt-0.5 pb-2'
      style={{
        left: `${actualPosition.x}px`,
        top: `${actualPosition.y}px`,
        width: `${chatWidth}px`,
        height: `${chatHeight}px`,
        cursor: resizeCursor || undefined,
      }}
      onMouseMove={handleResizeMouseMove}
      onMouseLeave={handleResizeMouseLeave}
      onMouseDown={handleResizeMouseDown}
    >
      <div
        className='flex h-[32px] flex-shrink-0 cursor-grab items-center justify-between gap-2.5 bg-[var(--surface-1)] p-0 active:cursor-grabbing'
        onMouseDown={handleMouseDown}
      >
        <span className='flex-shrink-0 pr-0.5 font-medium text-[var(--text-primary)] text-sm'>
          Chat
        </span>

        <div
          className='ml-auto flex min-w-0 flex-shrink items-center gap-1.5'
          onMouseDown={(e) => e.stopPropagation()}
        >
          {customFields.length > 0 && (
            <Badge
              variant='outline'
              className='flex-none cursor-pointer whitespace-nowrap rounded-[6px]'
              title='Re-run with new inputs'
              onMouseDown={(e) => {
                e.stopPropagation()
                handleRerun()
              }}
            >
              <span className='whitespace-nowrap text-[12px]'>Re-run</span>
            </Badge>
          )}

          {shouldShowConfigureStartInputsButton && (
            <div
              className='flex flex-none cursor-pointer items-center whitespace-nowrap rounded-md border border-[var(--border-1)] bg-[var(--surface-5)] px-2.5 py-0.5 font-medium font-sans text-[var(--text-primary)] text-caption hover-hover:bg-[var(--surface-active)]'
              title='Add chat inputs to Start block'
              onMouseDown={(e) => {
                e.stopPropagation()
                handleConfigureStartInputs()
                workflowChatAddInputEvent({
                  'Workspace Name': workspaceName,
                  'Workspace ID': workspaceId,
                })
              }}
            >
              <span className='whitespace-nowrap'>Add inputs</span>
            </div>
          )}

          <OutputSelect
            workflowId={activeWorkflowId}
            selectedOutputs={selectedOutputs}
            onOutputSelect={handleOutputSelection}
            disabled={!activeWorkflowId}
            placeholder='Outputs'
            align='end'
            maxHeight={180}
            workspaceName={workspaceName}
            workspaceId={workspaceId}
          />
        </div>

        <div className='flex flex-shrink-0 items-center gap-2'>
          <Popover variant='default' size='sm' open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='ghost'
                className='!p-1.5 -m-1.5'
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className='h-[14px] w-[14px]' strokeWidth={2} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side='bottom'
              align='end'
              sideOffset={8}
              maxHeight={100}
              style={{ width: '110px', minWidth: '110px' }}
            >
              <PopoverScrollArea>
                <PopoverItem
                  onClick={() => {
                    if (activeWorkflowId) exportChatCSV(activeWorkflowId)
                    setMoreMenuOpen(false)
                  }}
                  disabled={workflowMessages.length === 0}
                >
                  <ArrowDownToLine className='h-[13px] w-[13px]' />
                  <span>Download</span>
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    if (activeWorkflowId) clearChat(activeWorkflowId)
                    setMoreMenuOpen(false)
                  }}
                  disabled={workflowMessages.length === 0}
                >
                  <Trash className='h-[13px] w-[13px]' />
                  <span>Clear</span>
                </PopoverItem>
              </PopoverScrollArea>
            </PopoverContent>
          </Popover>

          <Button variant='ghost' className='!p-1.5 -m-1.5' onClick={handleClose}>
            <X className='h-[16px] w-[16px]' />
          </Button>
        </div>
      </div>

      <div className='flex flex-1 flex-col overflow-hidden'>
        <div className='flex-1 overflow-hidden'>
          {workflowMessages.length === 0 ? (
            <div className='flex h-full items-center justify-center text-[var(--text-placeholder)] text-small'>
              No messages yet
            </div>
          ) : (
            <div ref={scrollAreaRef} className='h-full overflow-y-auto overflow-x-hidden'>
              <div className='w-full max-w-full space-y-2 overflow-hidden py-2'>
                {workflowMessages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onToggleGeneratedImage={toggleGeneratedImageSelection}
                    onToggleUserAttachmentImage={handleToggleUserAttachmentImageSelection}
                    selectedGeneratedImageIds={selectedGeneratedImageIds}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className='flex-none'
          onDragEnter={!activeWorkflowId || isExecuting ? undefined : handleDragEnter}
          onDragOver={!activeWorkflowId || isExecuting ? undefined : handleDragOver}
          onDragLeave={!activeWorkflowId || isExecuting ? undefined : handleDragLeave}
          onDrop={!activeWorkflowId || isExecuting ? undefined : handleDrop}
        >
          {uploadErrors.length > 0 && (
            <div>
              <div className='rounded-lg border border-[var(--terminal-status-error-border)] bg-[var(--terminal-status-error-bg)]'>
                <div className='flex items-start gap-2'>
                  <AlertCircle className='mt-0.5 h-3 w-3 shrink-0 text-[var(--text-error)]' />
                  <div className='flex-1'>
                    <div className='mb-1 font-medium text-[var(--text-error)] text-caption'>
                      File upload error
                    </div>
                    <div className='space-y-1'>
                      {uploadErrors.map((err, idx) => (
                        <div key={idx} className='text-[var(--text-error)] text-micro'>
                          {err}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`rounded-sm border bg-[var(--surface-5)] py-0 pr-1.5 pl-1 transition-colors ${
              isDragOver ? 'border-[var(--brand-secondary)]' : 'border-[var(--border-1)]'
            }`}
          >
            {effectiveGeneratedImages.length > 0 && (
              <div className='mt-1 flex flex-wrap gap-1.5'>
                {effectiveGeneratedImages.map((image) => (
                  <div
                    key={image.id}
                    className='group relative h-[40px] w-[40px] flex-shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]'
                    title={
                      selectedGeneratedImages.length > 0
                        ? `${image.name} (selected from chat)`
                        : `${image.name} (latest image)`
                    }
                  >
                    <img src={image.url} alt={image.name} className='h-full w-full object-cover' />
                    <Button
                      variant='ghost'
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSelectedGeneratedImage(image.id)
                      }}
                      className='absolute top-0.5 right-0.5 h-4 w-4 p-0 opacity-0 transition-opacity group-hover:opacity-100'
                    >
                      <X className='h-2.5 w-2.5' />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {chatFiles.length > 0 && (
              <div className='mt-1 flex flex-wrap gap-1.5'>
                {chatFiles.map((file) => {
                  const previewUrl = getFilePreviewUrl(file)

                  return (
                    <div
                      key={file.id}
                      className={cn(
                        'group relative flex-shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]',
                        previewUrl
                          ? 'h-[40px] w-[40px]'
                          : 'flex min-w-[80px] max-w-[120px] items-center justify-center px-2 py-0.5'
                      )}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        <div className='min-w-0 flex-1'>
                          <div className='truncate font-medium text-[var(--white)] text-micro'>
                            {file.name}
                          </div>
                          <div className='text-[9px] text-[var(--text-tertiary)]'>
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                      )}

                      <Button
                        variant='ghost'
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(file.id)
                        }}
                        className='absolute top-0.5 right-0.5 h-4 w-4 p-0 opacity-0 transition-opacity group-hover:opacity-100'
                      >
                        <X className='h-2.5 w-2.5' />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className='relative'>
              <Input
                ref={inputRef}
                value={chatMessage}
                onChange={(e) => {
                  setChatMessage(e.target.value)
                  setHistoryIndex(-1)
                }}
                onKeyDown={handleKeyPress}
                placeholder={isDragOver ? 'Drop files here...' : 'Type a message...'}
                className='w-full border-0 bg-transparent pr-[56px] pl-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
                disabled={!activeWorkflowId}
              />

              <div className='-translate-y-1/2 absolute top-1/2 right-[2px] flex items-center gap-2.5'>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Badge
                      onClick={() => document.getElementById('floating-chat-file-input')?.click()}
                      className={cn(
                        '!bg-transparent !border-0 cursor-pointer rounded-md p-[0px]',
                        (!activeWorkflowId || isExecuting || chatFiles.length >= 15) &&
                          'cursor-not-allowed opacity-50'
                      )}
                    >
                      <Paperclip className='!h-3.5 !w-3.5' />
                    </Badge>
                  </Tooltip.Trigger>
                  <Tooltip.Content>Attach file</Tooltip.Content>
                </Tooltip.Root>

                {isStreaming ? (
                  <Button
                    onClick={handleStopStreaming}
                    className='h-[22px] w-[22px] rounded-full border-0 bg-[var(--text-primary)] p-0 transition-colors hover-hover:bg-[var(--text-secondary)] dark:bg-[var(--border-1)] dark:hover-hover:bg-[var(--text-body)]'
                  >
                    <Square className='h-2.5 w-2.5 fill-white text-white dark:fill-black dark:text-black' />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendMessage}
                    disabled={
                      (!chatMessage.trim() &&
                        chatFiles.length === 0 &&
                        effectiveGeneratedImages.length === 0) ||
                      !activeWorkflowId ||
                      isExecuting ||
                      isStreaming
                    }
                    className={cn(
                      'h-[22px] w-[22px] rounded-full border-0 p-0 transition-colors',
                      chatMessage.trim() || chatFiles.length > 0 || effectiveGeneratedImages.length > 0
                        ? 'bg-[var(--text-primary)] hover-hover:bg-[var(--text-secondary)] dark:bg-[var(--border-1)] dark:hover-hover:bg-[var(--text-body)]'
                        : 'bg-[var(--text-subtle)] dark:bg-[var(--text-subtle)]'
                    )}
                  >
                    <ArrowUp
                      className='h-3.5 w-3.5 text-white dark:text-black'
                      strokeWidth={2.25}
                    />
                  </Button>
                )}
              </div>
            </div>

            <input
              id='floating-chat-file-input'
              type='file'
              multiple
              accept={CHAT_ACCEPT_ATTRIBUTE}
              onChange={handleFileInputChange}
              className='hidden'
              disabled={!activeWorkflowId || isExecuting}
            />
          </div>
        </div>
      </div>

      {customFields.length > 0 && (
        <StartBlockInputModal
          open={isInputModalOpen}
          onOpenChange={setIsInputModalOpen}
          inputFormat={startBlockInputFormat as InputFormatField[] | null | undefined}
          onSubmit={handleStartBlockInputsSubmit}
          initialValues={startBlockInputs}
        />
      )}
    </div>
  )
}
