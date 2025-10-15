'use client'

import { useRef, useState } from 'react'
import { createLogger } from '@/lib/logs/console/logger'
import type { ChatMessage } from '@/app/chat/components/message/message'
// No longer need complex output extraction - backend handles this
import type { ExecutionResult } from '@/executor/types'

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
    let partialData = '' // Buffer for incomplete JSON data

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
        // Append to partial data buffer
        partialData += chunk

        // Split by double newlines to separate complete messages
        const parts = partialData.split('\n\n')

        // Keep the last part as it might be incomplete
        partialData = parts.pop() || ''

        // Process complete parts
        for (const part of parts) {
          const lines = part.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonString = line.substring(6)
                const json = JSON.parse(jsonString)
                const { blockId, chunk: contentChunk, event: eventType } = json

                if (eventType === 'final' && json.data) {
                  // Final event received - check if we need to add additional content
                  const result = json.data as ExecutionResult

                  logger.info('Final event received:', {
                    hasDirectOutput: !!result.output?.content,
                    hasLogs: !!result.logs,
                    outputType: typeof result.output?.content,
                    outputLength: result.output?.content?.length || 0,
                    accumulatedTextLength: accumulatedText.length,
                  })

                  // Check if there's additional content that wasn't streamed
                  let additionalContent = ''

                  // For base64 images or other direct output content that wasn't streamed
                  if (result.output?.content && typeof result.output.content === 'string') {
                    // Only use direct output if it's different from accumulated text (e.g., base64 images)
                    if (result.output.content !== accumulatedText.trim()) {
                      additionalContent = result.output.content
                      logger.info(
                        'Found additional direct output content, length:',
                        additionalContent.length
                      )
                    }
                  }

                  // Check for additional content in logs that wasn't streamed
                  if (!additionalContent && result.logs) {
                    const contentParts: string[] = []

                    result.logs.forEach((log) => {
                      if (log.output?.content && typeof log.output.content === 'string') {
                        // Only add if it's different from what was already streamed
                        if (log.output.content !== accumulatedText.trim()) {
                          contentParts.push(log.output.content)
                        }
                      }
                    })

                    if (contentParts.length > 0) {
                      additionalContent = contentParts.join('')
                    }
                  }

                  // Determine final content
                  let finalContent = accumulatedText
                  if (additionalContent) {
                    // Only append additional content if it's truly different
                    finalContent = `${accumulatedText}\n\n${additionalContent}`
                  }

                  // Update the streaming message to final state
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            content: finalContent,
                            isStreaming: false,
                            executionId: result?.executionId || msg?.executionId,
                            liked: null,
                          }
                        : msg
                    )
                  )

                  return
                }

                if (blockId && contentChunk) {
                  // Track that this block has streamed content (like chat panel)
                  if (!messageIdMap.has(blockId)) {
                    messageIdMap.set(blockId, messageId)
                  }

                  accumulatedText += contentChunk
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
                } else if (eventType === 'error') {
                  // Handle error events from the server
                  const errorData = json.data || {}
                  const errorMessage = errorData.error || 'An error occurred during processing'

                  logger.error('Server error event received:', errorData)

                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            content: `⚠️ Error: ${errorMessage}`,
                            isStreaming: false,
                          }
                        : msg
                    )
                  )

                  // Stop streaming on error
                  setIsStreamingResponse(false)
                  return
                }
              } catch (parseError) {
                logger.error('Error parsing stream data:', {
                  error: parseError,
                  lineLength: line.length,
                  lineStart: line.substring(0, 100),
                  lineEnd: line.substring(Math.max(0, line.length - 100)),
                })
              }
            }
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
