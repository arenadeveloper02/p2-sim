'use client'

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cookies from 'js-cookie'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { LoadingAgentP2 } from '@/components/ui/loading-agent-arena'
import { client } from '@/lib/auth/auth-client'
import { noop } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'
import { getCustomInputFields, normalizeInputFormatValue } from '@/lib/workflows/input-format-utils'
import type { InputFormatField } from '@/lib/workflows/types'
import { getFormattedGitHubStars } from '@/app/(landing)/actions/github'
import {
  ChatErrorState,
  ChatInput,
  ChatLoadingState,
  type ChatMessage,
  ChatMessageContainer,
  EmailAuth,
  PasswordAuth,
  SSOAuth,
  VoiceInterface,
} from '@/app/chat/components'
import { CHAT_ERROR_MESSAGES, CHAT_REQUEST_TIMEOUT_MS } from '@/app/chat/constants'
import { useAudioStreaming, useChatStreaming } from '@/app/chat/hooks'
import { StartBlockInputModal } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components'
import { ArenaChatHeader } from '../components/header/arenaHeader'
import LeftNavThread from './leftNavThread'

const logger = createLogger('ChatClient')

interface ChatConfig {
  id: string
  title: string
  description: string
  customizations: {
    primaryColor?: string
    logoUrl?: string
    imageUrl?: string
    welcomeMessage?: string
    headerText?: string
  }
  authType?: 'public' | 'password' | 'email' | 'sso'
  outputConfigs?: Array<{ blockId: string; path?: string }>
  inputFormat?: InputFormatField[]
}

interface ThreadRecord {
  chatId: string
  title: string
  workflowId: string
  createdAt: string
  updatedAt: string
}

interface AudioStreamingOptions {
  voiceId: string
  onError: (error: Error) => void
}

const DEFAULT_VOICE_SETTINGS = {
  voiceId: 'EXAVITQu4vr4xnSDxMaL', // Default ElevenLabs voice (Bella)
}

/**
 * Converts a File object to a base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Creates an audio stream handler for text-to-speech conversion
 * @param streamTextToAudio - Function to stream text to audio
 * @param voiceId - The voice ID to use for TTS
 * @returns Audio stream handler function or undefined
 */
function createAudioStreamHandler(
  streamTextToAudio: (text: string, options: AudioStreamingOptions) => Promise<void>,
  voiceId: string
) {
  return async (text: string) => {
    try {
      await streamTextToAudio(text, {
        voiceId,
        onError: (error: Error) => {
          logger.error('Audio streaming error:', error)
        },
      })
    } catch (error) {
      logger.error('TTS error:', error)
    }
  }
}

function throttle<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null
  let lastExecTime = 0

  return ((...args: Parameters<T>) => {
    const currentTime = Date.now()

    if (currentTime - lastExecTime > delay) {
      func(...args)
      lastExecTime = currentTime
    } else {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(
        () => {
          func(...args)
          lastExecTime = Date.now()
        },
        delay - (currentTime - lastExecTime)
      )
    }
  }) as T
}

export default function ChatClient({ identifier }: { identifier: string }) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [starCount, setStarCount] = useState('3.4k')
  const [conversationId, setConversationId] = useState('')

  // Left threads state managed here
  const [currentChatId, setCurrentChatId] = useState<string | null>()
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isThreadsLoading, setIsThreadsLoading] = useState<boolean>(true)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState<any>(true) // Start as true to prevent early modal
  const [isConversationFinished, setIsConversationFinished] = useState<any>(false)
  const [hasCheckedHistory, setHasCheckedHistory] = useState<boolean>(false)

  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const isUserScrollingRef = useRef(false)

  const [authRequired, setAuthRequired] = useState<'password' | 'email' | 'sso' | null>(null)
  const [isAutoLoginInProgress, setIsAutoLoginInProgress] = useState<boolean>(false)

  // Start Block input modal state
  const [isInputModalOpen, setIsInputModalOpen] = useState(false)
  const [startBlockInputs, setStartBlockInputs] = useState<Record<string, unknown>>({})
  const hasShownModalRef = useRef<boolean>(false)

  const [isVoiceFirstMode, setIsVoiceFirstMode] = useState(false)
  const { isStreamingResponse, abortControllerRef, stopStreaming, handleStreamedResponse } =
    useChatStreaming()
  const audioContextRef = useRef<AudioContext | null>(null)
  const { isPlayingAudio, streamTextToAudio, stopAudio } = useAudioStreaming(audioContextRef)

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const scrollToMessage = useCallback(
    (messageId: string, scrollToShowOnlyMessage = false) => {
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
      if (messageElement && messagesContainerRef.current) {
        const container = messagesContainerRef.current
        const containerRect = container.getBoundingClientRect()
        const messageRect = messageElement.getBoundingClientRect()

        if (scrollToShowOnlyMessage) {
          const scrollTop = container.scrollTop + messageRect.top - containerRect.top

          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth',
          })
        } else {
          const scrollTop = container.scrollTop + messageRect.top - containerRect.top - 80

          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth',
          })
        }
      }
    },
    [messagesContainerRef]
  )

  const handleScroll = useCallback(
    throttle(() => {
      const container = messagesContainerRef.current
      if (!container) return

      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setShowScrollButton(distanceFromBottom > 100)

      // Track if user is manually scrolling during streaming
      if (isStreamingResponse && !isUserScrollingRef.current) {
        setUserHasScrolled(true)
      }
    }, 100),
    [isStreamingResponse]
  )

  // Fetch history messages
  useEffect(() => {
    const workflowId = identifier

    const fetchHistory = async (workflowId: string, chatId: string | null) => {
      // Only fetch history if we have a chatId
      if (!chatId) {
        // No chatId means no history - can show modal
        hasShownModalRef.current = false
        setIsHistoryLoading(false)
        setHasCheckedHistory(true)
        return
      }

      try {
        setIsHistoryLoading(true)
        const response = await fetch(`/api/chat/${workflowId}/history?chatId=${chatId}`)
        if (response.ok) {
          const data = await response.json()

          // Check if there's any chat history in the API response
          if (data?.logs?.length === 0) {
            // No history found - mark that we can show modal after loading completes
            hasShownModalRef.current = false
            setIsHistoryLoading(false)
            setHasCheckedHistory(true)
          } else {
            // History exists - load messages and prevent modal from showing
            setMessages([
              ...(chatConfig?.customizations?.welcomeMessage
                ? [
                    {
                      id: 'welcome',
                      content: chatConfig.customizations.welcomeMessage,
                      type: 'assistant',
                      isInitialMessage: true,
                      timestamp: new Date(),
                    },
                  ]
                : []),
              ...data.logs.flatMap((log: any) => {
                const messages = []
                if (log.userInput) {
                  messages.push({
                    id: `${log.id}-user`,
                    content: log.userInput,
                    type: 'user',
                    timestamp: new Date(log.startedAt),
                  })
                }
                if (log.modelOutput) {
                  messages.push({
                    id: `${log.id}-assistant`,
                    content: log.modelOutput,
                    type: 'assistant',
                    timestamp: new Date(log.endedAt || log.startedAt),
                    isStreaming: false,
                    executionId: log?.executionId || '',
                    liked: log.liked,
                  })
                }
                return messages
              }),
            ])
            // History exists - mark modal as shown so it won't appear
            hasShownModalRef.current = true
            setTimeout(() => {
              setTimeout(() => {
                scrollToBottom()
              }, 100)
            }, 500)
            setIsHistoryLoading(false)
            setHasCheckedHistory(true)
          }
        } else {
          // If history fetch fails (404, etc.), treat as no history - can show modal
          logger.warn(`History fetch failed with status ${response.status}, treating as no history`)
          hasShownModalRef.current = false
          setIsHistoryLoading(false)
          setHasCheckedHistory(true)
        }
      } catch (error) {
        // If history fetch errors, treat as no history - can show modal
        logger.error('Error fetching history, treating as no history:', error)
        hasShownModalRef.current = false
        setIsHistoryLoading(false)
        setHasCheckedHistory(true)
      }
    }

    if (workflowId && Object.keys(chatConfig || {}).length > 0 && currentChatId) {
      fetchHistory(workflowId, currentChatId)
    } else if (workflowId && Object.keys(chatConfig || {}).length > 0 && !currentChatId) {
      // Chat config loaded but no chatId yet - no history, can show modal
      hasShownModalRef.current = false
      setIsHistoryLoading(false)
      setHasCheckedHistory(true)
    }
  }, [identifier, chatConfig, currentChatId])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Reset user scroll tracking when streaming starts
  useEffect(() => {
    if (isStreamingResponse) {
      // Reset userHasScrolled when streaming starts
      setUserHasScrolled(false)

      // Give a small delay to distinguish between programmatic scroll and user scroll
      isUserScrollingRef.current = true
      setTimeout(() => {
        isUserScrollingRef.current = false
      }, 1000)
    }
  }, [isStreamingResponse])

  const fetchChatConfig = async () => {
    try {
      const response = await fetch(`/api/chat/${identifier}`, {
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      if (!response.ok) {
        // Check if auth is required or unauthorized
        if (response.status === 401 || response.status === 403) {
          const errorData = await response.json()

          // Attempt a safe, one-time auto-login for email-gated chats when an email cookie exists
          if (errorData.error === 'auth_required_email') {
            try {
              const autoLoginKey = `chat:autoLoginTried:${identifier}:${
                new URLSearchParams(window.location.search).get('chatId') || 'nochat'
              }`
              const alreadyTried =
                typeof window !== 'undefined' && localStorage.getItem(autoLoginKey)
              const cookieEmail = Cookies.get('email')

              // Only attempt if we have an email cookie, have not tried already, and there is no active session
              if (cookieEmail && !alreadyTried) {
                const sessionRes = await client.getSession()
                const hasSession = !!sessionRes?.data?.user?.id
                if (!hasSession) {
                  setIsAutoLoginInProgress(true)
                  localStorage.setItem(autoLoginKey, '1')
                  await client.signIn.email(
                    {
                      email: cookieEmail,
                      password: 'Position2!',
                      callbackURL: typeof window !== 'undefined' ? window.location.href : undefined,
                    },
                    {}
                  )
                  return
                }
              }
            } catch (_e) {
              // Swallow and proceed to existing auth UI
            }
          }

          if (errorData.error === 'auth_required_password') {
            setAuthRequired('password')
            return
          }
          if (errorData.error === 'auth_required_email') {
            setAuthRequired('email')
            return
          }
          // If user email is not authorized, show error and redirect
          if (
            errorData.error === 'Email not authorized' ||
            errorData.message === 'Email not authorized' ||
            errorData.error === 'You do not have access to this chat' ||
            errorData.message === 'You do not have access to this chat'
          ) {
            setError('You do not have access to this chat.')
            // Redirect after 3 seconds
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }, 3000)
            return
          }
        }

        throw new Error(`Failed to load chat configuration: ${response.status}`)
      }

      // Reset auth required state when authentication is successful
      setAuthRequired(null)

      const data = await response.json()

      setChatConfig(data)

      if (data?.customizations?.welcomeMessage) {
        setMessages([
          {
            id: 'welcome',
            content: data.customizations.welcomeMessage,
            type: 'assistant',
            timestamp: new Date(),
            isInitialMessage: true,
          },
        ])
      }

      // Don't show modal here - let the useEffect handle it after history check completes
      // This ensures modal only shows when there's no chat history
    } catch (error) {
      logger.error('Error fetching chat config:', error)
      setError('This chat is currently unavailable. Please try again later.')
    }
  }

  // Fetch chat config on mount and generate new conversation ID
  useEffect(() => {
    fetchChatConfig()
    setConversationId(uuidv4())

    getFormattedGitHubStars()
      .then((formattedStars) => {
        setStarCount(formattedStars)
      })
      .catch((err) => {
        logger.error('Failed to fetch GitHub stars:', err)
      })
  }, [identifier])

  const refreshChat = () => {
    fetchChatConfig()
  }

  const handleAuthSuccess = () => {
    setAuthRequired(null)
    setTimeout(() => {
      refreshChat()
    }, 800)
  }

  // Handle sending a message
  const handleSendMessage = async (
    messageParam?: string,
    isVoiceInput = false,
    files?: Array<{
      id: string
      name: string
      size: number
      type: string
      file: File
      dataUrl?: string
    }>,
    forceExecution = false, // Allow execution even with empty input (e.g., when form is submitted)
    overrideValues?: Record<string, unknown> // Override values for Start Block inputs (e.g., from form submission)
  ) => {
    const messageToSend = messageParam ?? inputValue
    // Allow execution if forceExecution is true (form submission) or if there's input/files
    if ((!messageToSend.trim() && (!files || files.length === 0) && !forceExecution) || isLoading)
      return

    logger.info('Sending message:', {
      messageToSend,
      isVoiceInput,
      conversationId,
      filesCount: files?.length,
    })

    // Reset userHasScrolled when sending a new message
    setUserHasScrolled(false)

    // Only add user message to chat if there's actual content or files
    // When form is submitted with empty input, we don't add a user message
    let userMessageId: string | null = null
    if (messageToSend.trim() || (files && files.length > 0)) {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: messageToSend || (files && files.length > 0 ? `Sent ${files.length} file(s)` : ''),
        type: 'user',
        timestamp: new Date(),
        attachments: files?.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: file.dataUrl || '',
        })),
      }
      userMessageId = userMessage.id

      // Add the user's message to the chat
      setMessages((prev) => [...prev, userMessage])
    }
    setInputValue('')
    setIsLoading(true)

    // Scroll to show only the user's message and loading indicator (if message exists)
    if (userMessageId) {
      setTimeout(() => {
        scrollToMessage(userMessageId!, true)
      }, 100)
    }

    // Create abort controller for request cancellation
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, CHAT_REQUEST_TIMEOUT_MS)

    try {
      // Build complete workflow input with all Start Block fields
      // Use messageToSend directly (may be empty if form was submitted)
      // Pass overrideValues if provided (e.g., from form submission)
      const completeInput = buildCompleteWorkflowInput(
        messageToSend,
        conversationId,
        files,
        overrideValues
      )

      // Send structured payload to maintain chat context
      // Always include all Start Block inputs (even if empty) to ensure all fields are passed
      const startBlockInputsPayload: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(completeInput)) {
        if (key !== 'input' && key !== 'conversationId' && key !== 'files') {
          // Always include field, even if empty string - ensures all inputFormat fields are passed
          startBlockInputsPayload[key] = value
        }
      }

      const payload: any = {
        input: completeInput.input,
        conversationId: completeInput.conversationId,
        chatId: currentChatId,
        // Always include startBlockInputs if there are any custom fields in inputFormat
        // This ensures all Start Block fields are passed to execution, even if empty
        startBlockInputs: customFields.length > 0 ? startBlockInputsPayload : undefined,
      }

      // Add files if present (convert to base64 for JSON transmission)
      if (files && files.length > 0) {
        payload.files = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
            data: file.dataUrl || (await fileToBase64(file.file)),
          }))
        )
      }

      logger.info('API payload:', {
        ...payload,
        files: payload.files ? `${payload.files.length} files` : undefined,
      })

      const response = await fetch(`/api/chat/${identifier}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        signal: abortController.signal,
      })

      // Clear timeout since request succeeded
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('API error response:', errorData)
        throw new Error(errorData.error || 'Failed to get response')
      }

      if (!response.body) {
        throw new Error('Response body is missing')
      }

      // Use the streaming hook with audio support
      const shouldPlayAudio = isVoiceInput || isVoiceFirstMode
      const audioHandler = shouldPlayAudio
        ? createAudioStreamHandler(streamTextToAudio, DEFAULT_VOICE_SETTINGS.voiceId)
        : undefined

      logger.info('Starting to handle streamed response:', { shouldPlayAudio })
      setIsConversationFinished(true)

      await handleStreamedResponse(
        response,
        setMessages,
        setIsLoading,
        scrollToBottom,
        userHasScrolled,
        {
          voiceSettings: {
            isVoiceEnabled: shouldPlayAudio,
            voiceId: DEFAULT_VOICE_SETTINGS.voiceId,
            autoPlayResponses: shouldPlayAudio,
          },
          audioStreamHandler: audioHandler,
          outputConfigs: chatConfig?.outputConfigs,
        }
      )
    } catch (error: any) {
      // Clear timeout in case of error
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        logger.info('Request aborted by user or timeout')
        setIsLoading(false)
        return
      }

      logger.error('Error sending message:', error)
      setIsLoading(false)
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: CHAT_ERROR_MESSAGES.GENERIC_ERROR,
        type: 'assistant',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }

  // Stop audio when component unmounts or when streaming is stopped
  useEffect(() => {
    return () => {
      stopAudio()
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [stopAudio])

  // Voice interruption - stop audio when user starts speaking
  const handleVoiceInterruption = useCallback(() => {
    stopAudio()

    // Stop any ongoing streaming response
    if (isStreamingResponse) {
      stopStreaming(setMessages)
    }
  }, [isStreamingResponse, stopStreaming, setMessages, stopAudio])

  // Handle voice mode activation
  const handleVoiceStart = useCallback(() => {
    setIsVoiceFirstMode(true)
  }, [])

  // Handle exiting voice mode
  const handleExitVoiceMode = useCallback(() => {
    setIsVoiceFirstMode(false)
    stopAudio() // Stop any playing audio when exiting
  }, [stopAudio])

  // Handle voice transcript from voice-first interface
  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      logger.info('Received voice transcript:', transcript)
      handleSendMessage(transcript, true)
    },
    [handleSendMessage]
  )

  // Get custom fields from inputFormat (excluding reserved fields: input, conversationId, files)
  const customFields = useMemo(() => {
    return getCustomInputFields(chatConfig?.inputFormat)
  }, [chatConfig?.inputFormat])

  const fallbackTitle = useMemo(() => {
    for (const value of Object.values(startBlockInputs)) {
      if (value === null || value === undefined) continue
      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim()
      }
      try {
        const stringified = JSON.stringify(value)
        if (stringified && stringified !== '{}') return stringified
      } catch {
        continue
      }
    }
    return undefined
  }, [startBlockInputs])

  /**
   * Builds complete workflow input with all Start Block fields (including reserved ones)
   * Ensures all fields from inputFormat are present, with empty values when not provided
   *
   * Priority order:
   * 1. overrideValues (when form is submitted) - highest priority, used when form is just submitted
   * 2. field.value (persisted from Start Block inputFormat) - persisted values from workflow config
   * 3. empty string (when user types in chat input) - default, don't use old form values
   *
   * Note: startBlockInputs is only used to populate the modal form, not for building workflow input.
   * When user types in chat input (not using form), we should NOT use old form values.
   */
  const buildCompleteWorkflowInput = useCallback(
    (
      userInput: string,
      conversationId: string,
      files?: Array<{
        id: string
        name: string
        size: number
        type: string
        file: File
        dataUrl?: string
      }>,
      overrideValues?: Record<string, unknown>
    ): Record<string, unknown> => {
      const normalizedFields = normalizeInputFormatValue(chatConfig?.inputFormat)
      const completeInput: Record<string, unknown> = {}

      // Read values from Start Block inputFormat field values (field.value)
      for (const field of normalizedFields) {
        const fieldName = field.name?.trim()
        if (fieldName) {
          if (overrideValues && fieldName in overrideValues) {
            // Highest priority: overrideValues from form submission
            completeInput[fieldName] = overrideValues[fieldName] ?? ''
          } else if (field.value !== undefined && field.value !== null) {
            // Second priority: persisted value from Start Block inputFormat
            completeInput[fieldName] = field.value
          } else {
            // Default: empty string (when user types in chat input, don't use old form values)
            // startBlockInputs is only for modal form state, not for workflow execution
            completeInput[fieldName] = ''
          }
        }
      }

      // Override with actual values for reserved fields
      completeInput.input = userInput
      completeInput.conversationId = conversationId

      // Handle files - only include if present
      if (files && files.length > 0) {
        // Files will be added separately in the payload
      }

      return completeInput
    },
    [chatConfig?.inputFormat]
  )

  /**
   * Handles Start Block input modal submission
   * Stores the values and immediately triggers workflow execution
   */
  const handleStartBlockInputsSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      // Store the form values in local state
      setStartBlockInputs(values)
      setIsInputModalOpen(false)

      // Add a system message summarizing received inputs
      const formattedInputs = Object.entries(values)
        .map(([key, value]) => `${key}: ${value ?? ''}`)
        .join(', ')

      const inputMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: `Inputs received: ${formattedInputs}`,
        type: 'assistant',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, inputMessage])

      // Build complete workflow input with all Start Block fields
      // Pass empty string for input (user submitted form, not typed message)
      const completeInput = buildCompleteWorkflowInput('', conversationId, undefined, values)

      // Ensure input is explicitly empty string when submitting form
      completeInput.input = ''

      // Trigger workflow execution by sending a message with empty input
      // but with all Start Block inputs included
      // Pass values as overrideValues to ensure they're used immediately
      try {
        await handleSendMessage('', false, undefined, true, values) // forceExecution = true, overrideValues = values
      } catch (error) {
        logger.error('Error executing workflow from modal submit:', error)
      }
    },
    [buildCompleteWorkflowInput, conversationId, handleSendMessage]
  )

  // Handle Re-run button click
  const handleRerun = useCallback(() => {
    setIsInputModalOpen(true)
  }, [])

  // Show modal on load only if no chat history exists (after history check completes)
  useEffect(() => {
    // Only check after history check is complete (both loading done and hasCheckedHistory is true)
    if (isHistoryLoading || !hasCheckedHistory) return

    // Only show modal if:
    // 1. Chat config is loaded
    // 2. Has inputFormat with custom fields
    // 3. No history was found (hasShownModalRef.current is false) - this means no chat history exists
    // 4. No messages exist (double-check to ensure no history)
    // 5. Modal hasn't been shown yet
    if (
      chatConfig?.inputFormat &&
      Array.isArray(chatConfig.inputFormat) &&
      chatConfig.inputFormat.length > 0 &&
      messages.length === 0 &&
      !hasShownModalRef.current
    ) {
      const customFields = getCustomInputFields(chatConfig.inputFormat)
      const hasNoHistory = messages.length === 0 && !hasShownModalRef.current

      if (customFields.length > 0 && hasNoHistory) {
        hasShownModalRef.current = true
        setIsInputModalOpen(true)
      }
    }
  }, [isHistoryLoading, hasCheckedHistory, chatConfig, messages.length])

  // Reset modal ref when messages are added (user sends a message)
  useEffect(() => {
    if (messages.length > 0) {
      hasShownModalRef.current = false
    }
  }, [messages.length])

  // Get chatId from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const chatId = params.get('chatId')
    setCurrentChatId(chatId)
  }, [])

  const fetchThreads = useCallback(
    async (workflowId: string, isInitialLoad = false) => {
      try {
        if (isInitialLoad) {
          setIsThreadsLoading(true)
        }
        setThreadsError(null)
        const response = await fetch(`/api/chat/${workflowId}/all-history`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch threads: ${response.status}`)
        }
        const data = (await response.json()) as { records: ThreadRecord[]; total: number }
        const list = data.records || []
        setThreads(list)

        // Only handle initial navigation on first load
        if (isInitialLoad) {
          const params = new URLSearchParams(window.location.search)
          const urlChatId = params.get('chatId')

          // If no chatId in URL, decide default
          if (!urlChatId) {
            if (list.length > 0) {
              const firstId = list[0].chatId
              setCurrentChatId(firstId)
              params.set('chatId', firstId)
              const newUrl = `/chat/${workflowId}?${params.toString()}`
              router.push(newUrl)
            } else {
              // No threads exist yet: generate a new UUID chatId for a fresh chat
              const newId = uuidv4()
              setCurrentChatId(newId)
              params.set('chatId', newId)
              const newUrl = `/chat/${workflowId}?${params.toString()}`
              router.push(newUrl)
            }
          }
        }
      } catch (err) {
        console.error('Error fetching threads:', err)
        setThreadsError(err instanceof Error ? err.message : 'Failed to fetch threads')
        setThreads([])
      } finally {
        setIsThreadsLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    if (identifier && chatConfig && !authRequired) {
      fetchThreads(identifier, true)
    }
  }, [identifier, fetchThreads, chatConfig, authRequired])

  // Check if current chatId exists in threads when conversation is finished
  useEffect(() => {
    if (isConversationFinished && currentChatId) {
      const chatIdExists = threads.some((thread) => thread.chatId === currentChatId)

      if (!chatIdExists) {
        fetchThreads(identifier, false)
      }
      // Reset the flag
      setIsConversationFinished(false)
    }
  }, [isConversationFinished, currentChatId, threads, fetchThreads, identifier])

  const updateUrlChatId = useCallback(
    (newChatId: string) => {
      const params = new URLSearchParams(window.location.search)
      params.set('chatId', newChatId)
      const newUrl = `/chat/${identifier}?${params.toString()}`
      router.push(newUrl)
    },
    [router, identifier]
  )

  // Handle thread selection - must be defined before conditional returns
  const handleSelectThread = useCallback(
    (chatId: string) => {
      if (currentChatId === chatId) return
      setShowScrollButton(false)
      setCurrentChatId(chatId)
      // Clear messages except welcome
      setMessages((prev) => {
        const welcome = prev.find((m) => (m as any).isInitialMessage)
        return welcome ? [welcome] : []
      })
      updateUrlChatId(chatId)
    },
    [currentChatId]
  )

  const handleNewChat = useCallback(() => {
    setShowScrollButton(false)
    const id = uuidv4()
    setCurrentChatId(id)
    // Clear messages except welcome
    setMessages((prev) => {
      const welcome = prev.find((m) => (m as any).isInitialMessage)
      return welcome ? [welcome] : []
    })
    updateUrlChatId(id)
    // Clear form input values for new chat
    setStartBlockInputs({})
    // Open input modal if custom fields exist
    const hasCustomFields = getCustomInputFields(chatConfig?.inputFormat).length > 0
    if (hasCustomFields) {
      setIsInputModalOpen(true)
    }
  }, [updateUrlChatId, chatConfig?.inputFormat])

  if (isAutoLoginInProgress) {
    return (
      <div className='fixed inset-0 z-[110] flex items-center justify-center bg-background'>
        <LoadingAgentP2 size='lg' />
      </div>
    )
  }

  // If error, show error message using the extracted component
  if (error) {
    return <ChatErrorState error={error} starCount={starCount} />
  }

  // If authentication is required, use the extracted components
  if (authRequired) {
    // Get title and description from the URL params or use defaults
    const title = new URLSearchParams(window.location.search).get('title') || 'chat'
    const primaryColor =
      new URLSearchParams(window.location.search).get('color') || 'var(--brand-primary-hover-hex)'

    if (authRequired === 'password') {
      return (
        <PasswordAuth
          identifier={identifier}
          onAuthSuccess={handleAuthSuccess}
          title={title}
          primaryColor={primaryColor}
        />
      )
    }
    if (authRequired === 'email') {
      return (
        <EmailAuth
          identifier={identifier}
          onAuthSuccess={handleAuthSuccess}
          title={title}
          primaryColor={primaryColor}
        />
      )
    }
    if (authRequired === 'sso') {
      return (
        <SSOAuth
          identifier={identifier}
          onAuthSuccess={handleAuthSuccess}
          title={title}
          primaryColor={primaryColor}
        />
      )
    }
  }

  // Loading state while fetching config using the extracted component
  if (!chatConfig) {
    return <ChatLoadingState />
  }

  // Voice-first mode interface
  if (isVoiceFirstMode) {
    return (
      <VoiceInterface
        onCallEnd={handleExitVoiceMode}
        onVoiceTranscript={handleVoiceTranscript}
        onVoiceStart={noop}
        onVoiceEnd={noop}
        onInterrupt={handleVoiceInterruption}
        isStreaming={isStreamingResponse}
        isPlayingAudio={isPlayingAudio}
        audioContextRef={audioContextRef}
        messages={messages.map((msg) => ({
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          type: msg.type,
        }))}
      />
    )
  }

  // Standard text-based chat interface
  return (
    <div className='fixed inset-0 z-[100] flex flex-col bg-background text-foreground'>
      {isHistoryLoading && (
        <div className='absolute top-[72px] left-[330px] z-[105] flex h-[calc(100vh-85px)] w-[calc(100vw-350px)] items-center justify-center bg-white/60 pb-[6%]'>
          <LoadingAgentP2 size='lg' />
        </div>
      )}

      {/* Header component */}
      <ArenaChatHeader chatConfig={chatConfig} starCount={starCount} />

      <LeftNavThread
        threads={threads}
        isLoading={isThreadsLoading}
        error={threadsError || null}
        currentChatId={currentChatId || ''}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        isStreaming={isStreamingResponse || isLoading}
        workflowId={identifier}
        showReRun={customFields.length > 0}
        onReRun={handleRerun}
        fallbackTitle={fallbackTitle}
      />
      {/* Message Container component */}
      <ChatMessageContainer
        messages={messages}
        isLoading={isLoading}
        showScrollButton={showScrollButton}
        messagesContainerRef={messagesContainerRef as RefObject<HTMLDivElement>}
        messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
        scrollToBottom={scrollToBottom}
        scrollToMessage={scrollToMessage}
        chatConfig={chatConfig}
        setMessages={setMessages}
      />

      {/* Input area (free-standing at the bottom) */}
      <div className='relative p-3 pb-4 md:p-4 md:pb-6'>
        <div className='relative mx-auto max-w-3xl md:max-w-[748px]'>
          <ChatInput
            onSubmit={(value, isVoiceInput, files) => {
              void handleSendMessage(value, isVoiceInput, files)
            }}
            isStreaming={isStreamingResponse}
            onStopStreaming={() => stopStreaming(setMessages)}
            onVoiceStart={handleVoiceStart}
          />
        </div>
      </div>

      {/* Start Block Input Modal */}
      {customFields.length > 0 && (
        <StartBlockInputModal
          open={isInputModalOpen}
          onOpenChange={setIsInputModalOpen}
          inputFormat={chatConfig.inputFormat}
          onSubmit={handleStartBlockInputsSubmit}
          initialValues={startBlockInputs}
        />
      )}
    </div>
  )
}
