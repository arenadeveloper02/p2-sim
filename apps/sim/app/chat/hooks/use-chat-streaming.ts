'use client'

import { useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import {
  type AssistantChatFile as ChatFile,
  extractAssistantFilesFromData,
  extractGeneratedImagesFromData,
} from '@/lib/chat/assistant-assets'
import { readSSEEvents } from '@/lib/core/utils/sse'
import type { ChatMessage } from '@/app/chat/components/message/message'
import { CHAT_ERROR_MESSAGES } from '@/app/chat/constants'
import { resolveMessageImagesAndProse } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'

const logger = createLogger('UseChatStreaming')

interface VoiceSettings {
  isVoiceEnabled: boolean
  voiceId: string
  autoPlayResponses: boolean
  voiceFirstMode?: boolean
  textStreamingInVoiceMode?: 'hidden' | 'synced' | 'normal'
  conversationMode?: boolean
}

export interface StreamingOptions {
  voiceSettings?: VoiceSettings
  onAudioStart?: () => void
  onAudioEnd?: () => void
  audioStreamHandler?: (text: string) => Promise<void>
  outputConfigs?: Array<{ blockId: string; path?: string }>
}

type GeneratedImage = ReturnType<typeof extractGeneratedImagesFromData>[number]

interface StreamFinalData {
  success: boolean
  error?: string | { message?: string }
  output?: Record<string, Record<string, unknown>>
  executionId?: string
}

type StreamSSEPayload = {
  blockId?: string
  chunk?: string
  event?: string
  error?: string
  data?: StreamFinalData | ChatMessage['knowledgeResults']
}

export function useChatStreaming() {
  const [isStreamingResponse, setIsStreamingResponse] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const accumulatedTextRef = useRef<string>('')
  const lastStreamedPositionRef = useRef<number>(0)
  const audioStreamingActiveRef = useRef<boolean>(false)
  const lastDisplayedPositionRef = useRef<number>(0) // Track displayed text in synced mode

  const stopStreaming = (setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>) => {
    if (abortControllerRef.current) {
      // Abort the fetch request
      abortControllerRef.current.abort()
      abortControllerRef.current = null

      const latestContent = accumulatedTextRef.current

      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]

        if (lastMessage && lastMessage.type === 'assistant') {
          const content = latestContent || lastMessage.content
          const updatedContent =
            content + (content ? '\n\n_Response stopped by user._' : '_Response stopped by user._')

          return [
            ...prev.slice(0, -1),
            { ...lastMessage, content: updatedContent, isStreaming: false },
          ]
        }

        return prev
      })

      setIsStreamingResponse(false)
      accumulatedTextRef.current = ''
      lastStreamedPositionRef.current = 0
      lastDisplayedPositionRef.current = 0
      audioStreamingActiveRef.current = false
    }
  }

  const handleStreamedResponse = async (
    response: Response,
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
    scrollToBottom: () => void,
    userHasScrolled?: boolean,
    streamingOptions?: StreamingOptions
  ) => {
    logger.info('[useChatStreaming] handleStreamedResponse called')
    // Set streaming state
    setIsStreamingResponse(true)
    abortControllerRef.current = new AbortController()

    // Check if we should stream audio
    const shouldPlayAudio =
      streamingOptions?.voiceSettings?.isVoiceEnabled &&
      streamingOptions?.voiceSettings?.autoPlayResponses &&
      streamingOptions?.audioStreamHandler

    if (!response.body) {
      setIsLoading(false)
      setIsStreamingResponse(false)
      return
    }

    let accumulatedText = ''
    let lastAudioPosition = 0
    let pendingKnowledgeResults: ChatMessage['knowledgeResults']

    const messageIdMap = new Map<string, string>()
    const messageId = generateId()

    const UI_BATCH_MAX_MS = 50
    let uiDirty = false
    let uiRAF: number | null = null
    let uiTimer: ReturnType<typeof setTimeout> | null = null
    let lastUIFlush = 0

    const flushUI = () => {
      if (uiRAF !== null) {
        cancelAnimationFrame(uiRAF)
        uiRAF = null
      }
      if (uiTimer !== null) {
        clearTimeout(uiTimer)
        uiTimer = null
      }
      if (!uiDirty) return
      uiDirty = false
      lastUIFlush = performance.now()
      const snapshot = accumulatedText
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg
          if (!msg.isStreaming) return msg
          return { ...msg, content: snapshot }
        })
      )
    }

    const scheduleUIFlush = () => {
      if (uiRAF !== null) return
      const elapsed = performance.now() - lastUIFlush
      if (elapsed >= UI_BATCH_MAX_MS) {
        flushUI()
        return
      }
      uiRAF = requestAnimationFrame(flushUI)
      if (uiTimer === null) {
        uiTimer = setTimeout(flushUI, Math.max(0, UI_BATCH_MAX_MS - elapsed))
      }
    }
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        content: '',
        type: 'assistant',
        timestamp: new Date(),
        isStreaming: true,
      },
    ])

    setIsLoading(false)

    let terminated = false

    try {
      await readSSEEvents<StreamSSEPayload>(response.body, {
        signal: abortControllerRef.current.signal,
        onParseError: (_data, parseError) => {
          logger.error('Error parsing stream data:', parseError)
        },
        onEvent: async (json) => {
          const { blockId, chunk: contentChunk, event: eventType } = json

          const forkKnowledgeResults = readForkKnowledgeResultsEvent(json)
          if (forkKnowledgeResults !== undefined) {
            pendingKnowledgeResults = forkKnowledgeResults
            return
          }

          if (eventType === 'error' || json.event === 'error') {
            const errorMessage = json.error || CHAT_ERROR_MESSAGES.GENERIC_ERROR
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content: errorMessage,
                      isStreaming: false,
                      type: 'assistant' as const,
                    }
                  : msg
              )
            )
            setIsLoading(false)
            terminated = true
            return true
          }

          if (eventType === 'final' && json.data && !Array.isArray(json.data)) {
            flushUI()
            const forkFinal = resolveForkFinalStreamState({
              accumulatedText,
              finalData: json.data,
              outputConfigs: streamingOptions?.outputConfigs,
              pendingKnowledgeResults,
            })

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      isStreaming: false,
                      content: forkFinal.content,
                      executionId: forkFinal.executionId ?? msg.executionId,
                      liked: null,
                      files: forkFinal.files,
                      generatedImages: forkFinal.generatedImages,
                      knowledgeResults: forkFinal.knowledgeResults,
                    }
                  : msg
              )
            )

            pendingKnowledgeResults = undefined
            accumulatedTextRef.current = ''
            lastStreamedPositionRef.current = 0
            lastDisplayedPositionRef.current = 0
            audioStreamingActiveRef.current = false

            terminated = true
            return true
          }

          if (blockId && contentChunk) {
            if (!messageIdMap.has(blockId)) {
              messageIdMap.set(blockId, messageId)
            }

            accumulatedText += contentChunk
            accumulatedTextRef.current = accumulatedText
            logger.debug('[useChatStreaming] Received chunk', {
              blockId,
              chunkLength: contentChunk.length,
              totalLength: accumulatedText.length,
              messageId,
              chunk: contentChunk.substring(0, 20),
            })
            uiDirty = true
            scheduleUIFlush()

            if (shouldPlayAudio && streamingOptions?.audioStreamHandler) {
              const newText = accumulatedText.substring(lastAudioPosition)
              const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '.', '!', '?']
              let sentenceEnd = -1

              for (const ending of sentenceEndings) {
                const index = newText.indexOf(ending)
                if (index > 0) {
                  sentenceEnd = index + ending.length
                  break
                }
              }

              if (sentenceEnd > 0) {
                const sentence = newText.substring(0, sentenceEnd).trim()
                if (sentence && sentence.length >= 3) {
                  try {
                    await streamingOptions.audioStreamHandler(sentence)
                    lastAudioPosition += sentenceEnd
                  } catch (error) {
                    logger.error('TTS error:', error)
                  }
                }
              }
            }
          } else if (blockId && eventType === 'end') {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg))
            )
          }
        },
      })

      if (!terminated) {
        flushUI()
        if (
          shouldPlayAudio &&
          streamingOptions?.audioStreamHandler &&
          accumulatedText.length > lastAudioPosition
        ) {
          const remainingText = accumulatedText.substring(lastAudioPosition).trim()
          if (remainingText) {
            try {
              await streamingOptions.audioStreamHandler(remainingText)
            } catch (error) {
              logger.error('TTS error for remaining text:', error)
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error processing stream:', error)
      flushUI()
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg))
      )
    } finally {
      if (uiRAF !== null) cancelAnimationFrame(uiRAF)
      if (uiTimer !== null) clearTimeout(uiTimer)
      setIsStreamingResponse(false)
      abortControllerRef.current = null

      if (!userHasScrolled) {
        setTimeout(() => {
          scrollToBottom()
        }, 300)
      }

      if (shouldPlayAudio) {
        streamingOptions?.onAudioEnd?.()
      }
    }
  }

  return {
    isStreamingResponse,
    setIsStreamingResponse,
    abortControllerRef,
    stopStreaming,
    handleStreamedResponse,
  }
}

interface ForkFinalStreamInput {
  accumulatedText: string
  finalData: StreamFinalData
  outputConfigs?: StreamingOptions['outputConfigs']
  pendingKnowledgeResults?: ChatMessage['knowledgeResults']
}

interface ForkFinalStreamState {
  content: string | Record<string, unknown>
  executionId?: string
  files?: ChatFile[]
  generatedImages?: GeneratedImage[]
  knowledgeResults?: ChatMessage['knowledgeResults']
}

/**
 * Reads a fork-specific `knowledgeResults` SSE event without touching the main event dispatch flow.
 */
function readForkKnowledgeResultsEvent(
  json: StreamSSEPayload
): ChatMessage['knowledgeResults'] | undefined {
  if (json.event !== 'knowledgeResults' || !Array.isArray(json.data)) {
    return undefined
  }

  return json.data as ChatMessage['knowledgeResults']
}

/**
 * Resolves the assistant message produced by a `final` SSE event, including fork extensions
 * for knowledge results, generated images, and assistant file attachments.
 */
function resolveForkFinalStreamState(input: ForkFinalStreamInput): ForkFinalStreamState {
  const { accumulatedText, finalData, outputConfigs, pendingKnowledgeResults } = input
  const collected = collectForkConfiguredOutputs(outputConfigs, finalData.output)

  let finalContent = accumulatedText

  if (collected.formattedOutputs.length > 0) {
    const nonEmptyOutputs = collected.formattedOutputs.filter((output) => output.trim())
    if (nonEmptyOutputs.length > 0) {
      const combinedOutputs = nonEmptyOutputs.join('\n\n')
      finalContent = finalContent ? `${finalContent.trim()}\n\n${combinedOutputs}` : combinedOutputs
    }
  }

  if (!finalContent && collected.extractedFiles.length === 0) {
    const fallbackContent = resolveForkFallbackContent(finalData)
    if (fallbackContent) {
      finalContent = fallbackContent
    }
  }

  const { content, generatedImages } = resolveForkContentWithImages(
    finalContent,
    collected.generatedImages
  )

  return {
    content,
    executionId: finalData.executionId,
    files: collected.extractedFiles.length > 0 ? collected.extractedFiles : undefined,
    generatedImages,
    knowledgeResults: pendingKnowledgeResults,
  }
}

function collectForkConfiguredOutputs(
  outputConfigs: StreamingOptions['outputConfigs'],
  blockOutputMap?: Record<string, Record<string, unknown>>
) {
  const formattedOutputs: string[] = []
  const extractedFiles: ChatFile[] = []
  let generatedImages: GeneratedImage[] = []

  if (!outputConfigs?.length || !blockOutputMap) {
    return { formattedOutputs, extractedFiles, generatedImages }
  }

  for (const config of outputConfigs) {
    const blockOutputs = blockOutputMap[config.blockId]
    if (!blockOutputs) continue

    const value = getForkBlockOutputValue(blockOutputs, config.path)

    if (config.path === 'results' && isForkKnowledgeResultsArray(value)) {
      continue
    }

    const images = extractGeneratedImagesFromData(value)
    if (images.length > 0) {
      generatedImages = extractGeneratedImagesFromData(value, generatedImages)
      continue
    }

    const files = extractAssistantFilesFromData(value)
    if (files.length > 0) {
      extractedFiles.push(...files)
      generatedImages = extractGeneratedImagesFromData(value, generatedImages)
      continue
    }

    const formatted = formatForkStreamOutputValue(value)
    if (formatted) {
      formattedOutputs.push(formatted)
    }
  }

  return { formattedOutputs, extractedFiles, generatedImages }
}

function resolveForkFallbackContent(finalData: StreamFinalData): string | undefined {
  if (finalData.error) {
    if (typeof finalData.error === 'string') {
      return finalData.error
    }

    if (typeof finalData.error.message === 'string') {
      return finalData.error.message
    }
  }

  if (!finalData.success || !finalData.output) {
    return undefined
  }

  return (
    Object.values(finalData.output)
      .filter((block) => !isForkKnowledgeResultsArray(block?.results))
      .map((block) => formatForkStreamOutputValue(block)?.trim())
      .filter(Boolean)[0] ?? undefined
  )
}

function resolveForkContentWithImages(
  finalContent: string,
  generatedImages: GeneratedImage[]
): { content: string | Record<string, unknown>; generatedImages?: GeneratedImage[] } {
  let content: string | Record<string, unknown> = finalContent

  if (generatedImages.length > 0) {
    const { prose } = resolveMessageImagesAndProse(finalContent)
    const imageUrls = generatedImages.map((image) => image.url)
    content = {
      content: prose,
      image: imageUrls[0] ?? '',
      images: imageUrls,
    }
  }

  const resolvedGeneratedImages =
    generatedImages.length > 0 ? generatedImages : extractGeneratedImagesFromData(content)

  return {
    content,
    generatedImages: resolvedGeneratedImages.length > 0 ? resolvedGeneratedImages : undefined,
  }
}

function isForkKnowledgeResultsArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        'documentId' in item &&
        'documentName' in item &&
        'content' in item &&
        'chunkIndex' in item
    )
  )
}

function getForkBlockOutputValue(blockOutputs: Record<string, unknown>, path?: string) {
  if (!path || path === 'content') {
    if (blockOutputs.content !== undefined) return blockOutputs.content
    if (blockOutputs.result !== undefined) return blockOutputs.result
    return blockOutputs
  }

  if (blockOutputs[path] !== undefined) {
    return blockOutputs[path]
  }

  if (path.includes('.')) {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment]
      }

      return undefined
    }, blockOutputs)
  }

  return undefined
}

function formatForkStreamOutputValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (extractAssistantFilesFromData(value).length > 0) {
    return null
  }

  if (extractGeneratedImagesFromData(value).length > 0) {
    return null
  }

  if (Array.isArray(value) && value.length === 0) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object') {
    try {
      return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
    } catch {
      return String(value)
    }
  }

  return String(value)
}
