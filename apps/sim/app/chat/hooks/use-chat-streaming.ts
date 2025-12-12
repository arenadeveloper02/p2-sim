'use client'

import { useRef, useState } from 'react'
import { createLogger } from '@/lib/logs/console/logger'
import type { ChatMessage } from '@/app/chat/components/message/message'
import { CHAT_ERROR_MESSAGES } from '@/app/chat/constants'

const logger = createLogger('UseChatStreaming')

export interface VoiceSettings {
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

// Thinking step for dynamic UI feedback
export interface ThinkingStep {
  blockId: string
  blockName: string
  blockType: string
  status: 'running' | 'complete'
  startTime: Date
  progressMessage?: string
}

// Convert block type to human-readable action description
function getHumanReadableName(blockType: string, blockName: string): string {
  // If we have a custom block name (not a UUID), use it
  if (blockName && !blockName.match(/^[a-f0-9-]{36}$/i)) {
    return blockName
  }

  // Map block types to descriptive action messages
  const actionMap: Record<string, string> = {
    agent: 'AI Agent is processing...',
    google_ads: 'Connecting to Google Ads...',
    google_ads_query: 'Connecting to Google Ads...',
    api: 'Making API request...',
    function: 'Executing function...',
    router: 'Routing request...',
    condition: 'Evaluating condition...',
    start_trigger: 'Starting workflow...',
    starter: 'Starting workflow...',
    evaluator: 'Evaluating response...',
    code: 'Running code...',
    webhook: 'Processing webhook...',
    database: 'Querying database...',
  }

  // Return action message if we have one for this block type
  if (actionMap[blockType]) {
    return actionMap[blockType]
  }

  // For unknown types, generate a readable message from the block name or type
  if (blockName && !blockName.match(/^[a-f0-9-]{36}$/i)) {
    return `Processing ${blockName}...`
  }

  return `Processing ${blockType.replace(/_/g, ' ')}...`
}

export function useChatStreaming() {
  const [isStreamingResponse, setIsStreamingResponse] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([])
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

      // Add a message indicating the response was stopped
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]

        // Only modify if the last message is from the assistant (as expected)
        if (lastMessage && lastMessage.type === 'assistant') {
          // Append a note that the response was stopped
          const updatedContent =
            lastMessage.content +
            (lastMessage.content
              ? '\n\n_Response stopped by user._'
              : '_Response stopped by user._')

          return [
            ...prev.slice(0, -1),
            { ...lastMessage, content: updatedContent, isStreaming: false },
          ]
        }

        return prev
      })

      // Reset streaming state immediately
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

    const reader = response.body?.getReader()
    if (!reader) {
      setIsLoading(false)
      setIsStreamingResponse(false)
      return
    }

    const decoder = new TextDecoder()
    let accumulatedText = ''
    let lastAudioPosition = 0
    let buffer = '' // Buffer for incomplete JSON strings

    // Track which blocks have streamed content (like chat panel)
    const messageIdMap = new Map<string, string>()
    const messageId = crypto.randomUUID()
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

    try {
      while (true) {
        // Check if aborted
        if (abortControllerRef.current === null) {
          break
        }

        const { done, value } = await reader.read()

        if (done) {
          // Process any remaining buffered data
          if (buffer.trim()) {
            const remainingLines = buffer.split('\n\n').filter((line) => line.trim())
            for (const line of remainingLines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6).trim()
                if (data && data !== '[DONE]') {
                  try {
                    const json = JSON.parse(data)
                    // Process the final JSON if it's valid
                    if (json.chunk) {
                      accumulatedText += json.chunk
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === messageId ? { ...msg, content: accumulatedText } : msg
                        )
                      )
                    }
                  } catch (parseError) {
                    logger.warn('Failed to parse final buffered data:', parseError, {
                      dataLength: data.length,
                    })
                  }
                }
              }
            }
          }

          // Stream any remaining text for TTS
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
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        // Process complete SSE lines (ending with \n\n)
        // We need to be careful not to split in the middle of a JSON string
        let lineEndIndex = buffer.indexOf('\n\n')

        while (lineEndIndex !== -1) {
          const line = buffer.substring(0, lineEndIndex)
          buffer = buffer.substring(lineEndIndex + 2) // Remove processed line and \n\n

          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim()

            if (data === '[DONE]') {
              lineEndIndex = buffer.indexOf('\n\n')
              continue
            }

            // Skip empty data
            if (!data) {
              lineEndIndex = buffer.indexOf('\n\n')
              continue
            }

            try {
              // Try to parse JSON - if it fails due to incomplete string, buffer it
              const json = JSON.parse(data)
              const { blockId, chunk: contentChunk, event: eventType } = json

              // Handle block_progress event
              if (eventType === 'block_progress') {
                setThinkingSteps((prev) =>
                  prev.map((step) =>
                    step.blockId === json.blockId
                      ? { ...step, progressMessage: json.message }
                      : step
                  )
                )
                lineEndIndex = buffer.indexOf('\n\n')
                continue
              }

              // Handle block_start event for dynamic "thinking" UI
              if (eventType === 'block_start') {
                const humanName = getHumanReadableName(json.blockType, json.blockName)
                setThinkingSteps((prev) => [
                  ...prev,
                  {
                    blockId: json.blockId,
                    blockName: humanName,
                    blockType: json.blockType,
                    status: 'running',
                    startTime: new Date(),
                    progressMessage: '', // Initialize generic progress
                  },
                ])
                lineEndIndex = buffer.indexOf('\n\n')
                continue
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
                return
              }

              if (eventType === 'final' && json.data) {
                const finalData = json.data as {
                  success: boolean
                  error?: string | { message?: string }
                  output?: Record<string, Record<string, any>>
                  executionId?: string
                }

                const outputConfigs = streamingOptions?.outputConfigs
                const formattedOutputs: string[] = []

                const formatValue = (value: any): string | null => {
                  if (value === null || value === undefined) {
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

                const getOutputValue = (blockOutputs: Record<string, any>, path?: string) => {
                  if (!path || path === 'content') {
                    if (blockOutputs.content !== undefined) return blockOutputs.content
                    if (blockOutputs.result !== undefined) return blockOutputs.result
                    return blockOutputs
                  }

                  if (blockOutputs[path] !== undefined) {
                    return blockOutputs[path]
                  }

                  if (path.includes('.')) {
                    return path.split('.').reduce<any>((current, segment) => {
                      if (current && typeof current === 'object' && segment in current) {
                        return current[segment]
                      }
                      return undefined
                    }, blockOutputs)
                  }

                  return undefined
                }

                if (outputConfigs?.length && finalData.output) {
                  for (const config of outputConfigs) {
                    const blockOutputs = finalData.output[config.blockId]
                    if (!blockOutputs) continue

                    const value = getOutputValue(blockOutputs, config.path)
                    const formatted = formatValue(value)
                    if (formatted) {
                      formattedOutputs.push(formatted)
                    }
                  }
                }

                let finalContent = accumulatedText

                if (formattedOutputs.length > 0) {
                  const trimmedStreamingContent = accumulatedText.trim()

                  const uniqueOutputs = formattedOutputs.filter((output) => {
                    const trimmedOutput = output.trim()
                    if (!trimmedOutput) return false

                    // Skip outputs that exactly match the streamed content to avoid duplication
                    if (trimmedStreamingContent && trimmedOutput === trimmedStreamingContent) {
                      return false
                    }

                    return true
                  })

                  if (uniqueOutputs.length > 0) {
                    const combinedOutputs = uniqueOutputs.join('\n\n')
                    finalContent = finalContent
                      ? `${finalContent.trim()}\n\n${combinedOutputs}`
                      : combinedOutputs
                  }
                }

                if (!finalContent) {
                  if (finalData.error) {
                    if (typeof finalData.error === 'string') {
                      finalContent = finalData.error
                    } else if (typeof finalData.error?.message === 'string') {
                      finalContent = finalData.error.message
                    }
                  } else if (finalData.success && finalData.output) {
                    const fallbackOutput = Object.values(finalData.output)
                      .map((block) => formatValue(block)?.trim())
                      .filter(Boolean)[0]
                    if (fallbackOutput) {
                      finalContent = fallbackOutput
                    }
                  }
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                        ...msg,
                        isStreaming: false,
                        content: finalContent ?? msg.content,
                        executionId: finalData?.executionId || msg.executionId,
                        liked: null,
                      }
                      : msg
                  )
                )

                accumulatedTextRef.current = ''
                lastStreamedPositionRef.current = 0
                lastDisplayedPositionRef.current = 0
                audioStreamingActiveRef.current = false

                return
              }

              if (blockId && contentChunk) {
                if (!messageIdMap.has(blockId)) {
                  messageIdMap.set(blockId, messageId)
                }

                logger.debug('[useChatStreaming] Received chunk', {
                  blockId,
                  chunkLength: contentChunk.length,
                  totalLength: accumulatedText.length,
                  messageId,
                  chunk: contentChunk.substring(0, 20),
                })
              }

              // Handle response chunk
              if (contentChunk || eventType === 'message' || eventType === 'streamed_response') {
                const text = contentChunk || json.content || ''
                if (text) {
                  // If we receive actual content, clear thinking steps immediately
                  // This ensures the thinking UI disappears as soon as response starts
                  setThinkingSteps((prev) => {
                    if (prev.length > 0) return []
                    return prev
                  })

                  accumulatedText += text

                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId ? { ...msg, content: accumulatedText } : msg
                    )
                  )

                  // Real-time TTS for voice mode
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
              }

              // Move to next line
              lineEndIndex = buffer.indexOf('\n\n')
            } catch (parseError) {
              // Check if this is an unterminated string error (common with large base64)
              if (
                parseError instanceof SyntaxError &&
                (parseError.message.includes('Unterminated string') ||
                  parseError.message.includes('Unexpected end of JSON') ||
                  parseError.message.includes('position'))
              ) {
                logger.debug(
                  'Incomplete JSON string detected (likely large base64), buffering for next chunk',
                  {
                    dataLength: data.length,
                    error: parseError.message,
                    bufferLength: buffer.length,
                  }
                )
                // Put the incomplete line back in buffer with its original format - it will be processed when more data arrives
                buffer = `${line}\n\n${buffer}`
                break // Exit the while loop to wait for more data
              }

              // For other parse errors, log and continue
              logger.error('Error parsing stream data:', parseError, {
                dataLength: data.length,
                dataPreview: data.substring(0, 200),
              })

              // Move to next line even on error
              lineEndIndex = buffer.indexOf('\n\n')
            }
          } else {
            // Not a data line, move to next
            lineEndIndex = buffer.indexOf('\n\n')
          }
        }
      }
    } catch (error) {
      logger.error('Error processing stream:', error)
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, isStreaming: false } : msg))
      )
    } finally {
      setIsStreamingResponse(false)
      setThinkingSteps([]) // Clear thinking steps when streaming ends
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
    thinkingSteps,
    setThinkingSteps,
    abortControllerRef,
    stopStreaming,
    handleStreamedResponse,
  }
}
