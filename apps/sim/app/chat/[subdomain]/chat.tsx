'use client'

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import Cookies from 'js-cookie'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { Toaster } from '@/components/ui'
import { LoadingAgentP2 } from '@/components/ui/loading-agent-arena'
import { TooltipProvider } from '@/components/ui/tooltip'
import { client } from '@/lib/auth-client'
import { createLogger } from '@/lib/logs/console/logger'
import { noop } from '@/lib/utils'
import { getFormattedGitHubStars } from '@/app/(landing)/actions/github'
import {
  ChatErrorState,
  ChatHeader,
  ChatInput,
  ChatLoadingState,
  type ChatMessage,
  ChatMessageContainer,
  EmailAuth,
  PasswordAuth,
  VoiceInterface,
  WorkflowInputForm,
} from '@/app/chat/components'
import { useAudioStreaming, useChatStreaming } from '@/app/chat/hooks'
import { extractInputFieldsByWorkflowId } from '@/app/workspace/[workspaceId]/w/[workflowId]/lib/workflow-execution-utils'
import LeftNavThread from './leftNavThread'

const logger = createLogger('ChatClient')

// Chat timeout configuration (5 minutes)
const CHAT_REQUEST_TIMEOUT_MS = 300000

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
  authType?: 'public' | 'password' | 'email'
  outputConfigs?: Array<{ blockId: string; path?: string }>
  inputFields?: any[] // Input fields from workflow's starter block
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

export default function ChatClient({ subdomain }: { subdomain: string }) {
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
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  // Left threads state managed here

  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [isThreadsLoading, setIsThreadsLoading] = useState(true)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isConversationFinished, setIsConversationFinished] = useState(false)

  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const isUserScrollingRef = useRef(false)

  const [authRequired, setAuthRequired] = useState<'password' | 'email' | null>(null)
  const [isAutoLoginInProgress, setIsAutoLoginInProgress] = useState(false)
  const [preflightChecked, setPreflightChecked] = useState(false)

  const [isVoiceFirstMode, setIsVoiceFirstMode] = useState(false)

  // Workflow input form state
  const [inputFields, setInputFields] = useState<any[]>([])
  const [showInputForm, setShowInputForm] = useState(false)
  const [initialInputsSubmitted, setInitialInputsSubmitted] = useState(false)
  const [hasNoChatHistory, setHasNoChatHistory] = useState<boolean | undefined>(undefined)
  const [inputFormDismissed, setInputFormDismissed] = useState(false)
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

  // Get chatId from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const chatId = params.get('chatId')
    setCurrentChatId(chatId)
  }, [])

  // Function to fetch threads (reusable)
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

  // Fetch left threads here and handle initial/no-thread cases
  // Gate to avoid calling history before auth/auto-login is settled
  useEffect(() => {
    if (preflightChecked && subdomain && chatConfig && !authRequired && !isAutoLoginInProgress) {
      fetchThreads(subdomain, true)
    }
  }, [preflightChecked, subdomain, fetchThreads, chatConfig, authRequired, isAutoLoginInProgress])

  // Check if current chatId exists in threads when conversation is finished
  useEffect(() => {
    if (isConversationFinished && currentChatId) {
      const chatIdExists = threads.some((thread) => thread.chatId === currentChatId)

      if (!chatIdExists) {
        fetchThreads(subdomain, false)
      }
      // Reset the flag
      setIsConversationFinished(false)
    }
  }, [isConversationFinished, currentChatId, threads, fetchThreads, subdomain])

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
    const workflowId = subdomain

    const fetchHistory = async (workflowId: string, chatId: string | null) => {
      // Only fetch history if we have a chatId
      if (!chatId) {
        setIsHistoryLoading(false)
        setHasNoChatHistory(true)
        return
      }

      try {
        setIsHistoryLoading(true)
        const response = await fetch(`/api/chat/${workflowId}/history?chatId=${chatId}`)
        if (response.ok) {
          const data = await response.json()
          // Fetch input fields as fallback if not in chatConfig
          // (chatConfig should have them, but this ensures backwards compatibility)
          // Note: fetchInputFields is async but we don't need to wait for it
          if (inputFields.length === 0) {
            void fetchInputFields() // Fire and forget
          }
          if (data?.logs?.length === 0) {
            setHasNoChatHistory(true)
            setIsHistoryLoading(false)
          } else {
            // Flatten and process logs as before
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
            setTimeout(() => {
              setTimeout(() => {
                scrollToBottom()
              }, 100)
            }, 500)
            setHasNoChatHistory(false)
            setIsHistoryLoading(false)
          }
        } else {
          // If history fetch fails (404, etc.), treat as no history to show input form
          logger.warn(`History fetch failed with status ${response.status}, treating as no history`)
          setHasNoChatHistory(true)
          setIsHistoryLoading(false)
        }
      } catch (error) {
        // If history fetch errors, treat as no history to show input form
        logger.error('Error fetching history, treating as no history:', error)
        setHasNoChatHistory(true)
        setIsHistoryLoading(false)
      }
    }

    if (workflowId && Object.keys(chatConfig || {}).length > 0 && currentChatId) {
      fetchHistory(workflowId, currentChatId)
    } else if (workflowId && Object.keys(chatConfig || {}).length > 0 && !currentChatId) {
      // Chat config loaded but no chatId yet - mark as no history to show input form
      setIsHistoryLoading(false)
      setHasNoChatHistory(true)
    }
  }, [subdomain, chatConfig, currentChatId])

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
      const response = await fetch(`/api/chat/${subdomain}`, {
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
              const autoLoginKey = `chat:autoLoginTried:${subdomain}:${
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
      console.log('<><><>Chat config data', data)
      setChatConfig(data)

      // Set input fields from chat config (available to all authorized users)
      // This avoids needing separate workflow API permissions
      if (data?.inputFields && Array.isArray(data.inputFields) && data.inputFields.length > 0) {
        logger.info(`Found ${data.inputFields.length} input fields in chat config`)
        setInputFields(data.inputFields)
        // If there's no history yet and we just loaded input fields, ensure form can show
        // This handles the case where inputFields load after hasNoChatHistory is set
        if (hasNoChatHistory && !initialInputsSubmitted) {
          logger.debug('Input fields loaded, will trigger form display check via useEffect')
        }
      }

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
    } catch (error) {
      logger.error('Error fetching chat config:', error)
      setError('This chat is currently unavailable. Please try again later.')
    }
  }

  // Fetch input fields for the workflow
  const fetchInputFields = async () => {
    try {
      // The subdomain is actually the workflow ID in this case
      const fields = await extractInputFieldsByWorkflowId(subdomain)
      setInputFields(fields)
      // Don't automatically show the form - it will be shown based on specific conditions
    } catch (error) {
      logger.error('Error fetching input fields:', error)
      // On error, proceed to chat anyway
    }
    // Note: Don't set isHistoryLoading here - it's managed by fetchHistory
  }

  // Preflight auto-login: if email cookie exists and no Better Auth session, sign in first
  useEffect(() => {
    const tryAutoLogin = async () => {
      try {
        const cookieEmail = Cookies.get('email')
        if (!cookieEmail) {
          setPreflightChecked(true)
          return
        }

        const autoLoginKey = `chat:autoLoginTried:${subdomain}:${
          new URLSearchParams(window.location.search).get('chatId') || 'nochat'
        }`
        const alreadyTried = typeof window !== 'undefined' && localStorage.getItem(autoLoginKey)
        if (alreadyTried) {
          setPreflightChecked(true)
          return
        }
        // Synchronously block initial fetches
        setIsAutoLoginInProgress(true)

        const sessionRes = await client.getSession()
        const hasSession = !!sessionRes?.data?.user?.id
        if (!hasSession) {
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

        setIsAutoLoginInProgress(false)
        setPreflightChecked(true)
      } catch (_e) {
        // Ignore and continue normal flow
        setIsAutoLoginInProgress(false)
        setPreflightChecked(true)
      }
    }

    void tryAutoLogin()
  }, [subdomain])

  // Fetch chat config on mount and generate new conversation ID
  // Input fields are now included in chatConfig response (available to all authorized users)
  useEffect(() => {
    if (preflightChecked && !isAutoLoginInProgress) {
      fetchChatConfig()
    }
    setConversationId(uuidv4())

    getFormattedGitHubStars()
      .then((formattedStars) => {
        setStarCount(formattedStars)
      })
      .catch((err) => {
        logger.error('Failed to fetch GitHub stars:', err)
      })
  }, [subdomain, preflightChecked, isAutoLoginInProgress])

  // Case 1: Show input form when there are input fields and no chat history
  useEffect(() => {
    if (
      hasNoChatHistory === true &&
      inputFields.length > 0 &&
      !initialInputsSubmitted &&
      !isHistoryLoading &&
      !inputFormDismissed
    ) {
      setShowInputForm(true)
    } else if (hasNoChatHistory && inputFields.length === 0) {
      logger.debug('Waiting for input fields to load before showing form')
    }
  }, [
    hasNoChatHistory,
    inputFields.length,
    initialInputsSubmitted,
    isHistoryLoading,
    inputFormDismissed,
  ])

  const refreshChat = () => {
    fetchChatConfig()
  }

  // Helpers to update URL chatId without reload
  const updateUrlChatId = useCallback(
    (newChatId: string) => {
      const params = new URLSearchParams(window.location.search)
      params.set('chatId', newChatId)
      const newUrl = `/chat/${subdomain}?${params.toString()}`
      router.push(newUrl)
    },
    [router, subdomain]
  )

  // Select an existing thread
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
      // Reset form state when switching threads
      // Reset hasNoChatHistory so history can be re-evaluated for the new thread
      setShowInputForm(false)
      setInitialInputsSubmitted(false) // Allow form to show again for new thread if no history
      setHasNoChatHistory(false) // Will be set to true by fetchHistory if no history exists
      setInputFormDismissed(false)
      updateUrlChatId(chatId)
    },
    [currentChatId, updateUrlChatId]
  )

  // Create a new chat
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

    // Reset input form state - Case 1 will handle showing the form
    setInitialInputsSubmitted(false)
    setHasNoChatHistory(true)
    setShowInputForm(false)
    setInputFormDismissed(false)
  }, [updateUrlChatId])

  // Handle re-run with new inputs
  const handleReRunWithNewInputs = useCallback(() => {
    logger.info('Re-running with new inputs')
    setShowInputForm(true)
  }, [])

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
    isFormSubmission = false
  ) => {
    const messageToSend = messageParam ?? inputValue

    // Allow empty messages only if it's a form submission
    if (!messageToSend.trim() && !isFormSubmission && isLoading) return

    // For form submissions, use a default message if no message is provided
    const finalMessage = isFormSubmission && !messageToSend.trim() ? '' : messageToSend

    logger.info('Sending message:', {
      messageToSend: finalMessage,
      isVoiceInput,
      conversationId,
      isFormSubmission,
    })

    // Reset userHasScrolled when sending a new message
    setUserHasScrolled(false)

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: finalMessage,
      type: 'user',
      timestamp: new Date(),
    }

    // Add the user's message to the chat
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    // Scroll to show only the user's message and loading indicator
    setTimeout(() => {
      scrollToMessage(userMessage.id, true)
    }, 100)

    // Create abort controller for request cancellation
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, CHAT_REQUEST_TIMEOUT_MS)

    try {
      // Send the message as the main input to the workflow
      const payload = {
        input: finalMessage,
        conversationId,
        chatId: currentChatId,
      }

      logger.info('API payload:', payload)

      const response = await fetch(`/api/chat/${subdomain}`, {
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
        }
      )
      // Mark conversation as finished
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
        content: 'Sorry, there was an error processing your message. Please try again.',
        type: 'assistant',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    }
  }

  // Handle workflow input form submission
  const handleWorkflowInputSubmit = useCallback(
    async (inputs: Record<string, any>) => {
      logger.info('Workflow inputs submitted:', inputs)

      // Mark the initial form as submitted
      setInitialInputsSubmitted(true)

      // Hide the form
      setShowInputForm(false)

      // Format the inputs as a message for display
      const inputMessage = Object.entries(inputs)
        .map(([key, value]) => {
          // Convert field names to a more readable format
          const formattedKey = key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char, index) =>
              index === 0 ? char.toUpperCase() : char.toLowerCase()
            )
          return `${formattedKey}: ${value}`
        })
        .join('\n\n')

      // Add the inputs as a user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: `Workflow Inputs Received:\n\n${inputMessage}`,
        type: 'user',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])

      // Add a message indicating the workflow is starting
      const workflowStartMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: '',
        type: 'assistant',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, workflowStartMessage])

      // Reset userHasScrolled when sending a new message
      setUserHasScrolled(false)
      setIsLoading(true)

      // Create abort controller for request cancellation
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, CHAT_REQUEST_TIMEOUT_MS)

      try {
        // Send the structured inputs to the workflow
        const payload = {
          input: inputMessage, // Formatted message so history threads display workflow inputs
          workflowInputs: inputs, // Structured inputs for the workflow
          conversationId,
          chatId: currentChatId,
        }

        logger.info('API payload with workflowInputs:', payload)

        const response = await fetch(`/api/chat/${subdomain}`, {
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

        // Use the streaming hook to handle the response
        await handleStreamedResponse(
          response,
          setMessages,
          setIsLoading,
          scrollToBottom,
          userHasScrolled,
          {
            voiceSettings: {
              isVoiceEnabled: false,
              voiceId: DEFAULT_VOICE_SETTINGS.voiceId,
              autoPlayResponses: false,
            },
          }
        )
        setIsConversationFinished(true)
      } catch (error: any) {
        // Clear timeout in case of error
        clearTimeout(timeoutId)

        if (error.name === 'AbortError') {
          logger.info('Request aborted by user or timeout')
          setIsLoading(false)
          return
        }

        logger.error('Error in handleWorkflowInputSubmit:', error)
        setIsLoading(false)
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          content: 'Sorry, there was an error processing your inputs. Please try again.',
          type: 'assistant',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    },
    [
      conversationId,
      currentChatId,
      subdomain,
      handleStreamedResponse,
      scrollToBottom,
      userHasScrolled,
    ]
  )

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
      handleSendMessage(transcript, true, false)
    },
    [handleSendMessage]
  )

  // If auto-login or preflight gating is active, show a full-screen loading state
  if (!preflightChecked || isAutoLoginInProgress) {
    return (
      <div className='fixed inset-0 z-[110] flex items-center justify-center bg-background'>
        <LoadingAgentP2 size='lg' />
      </div>
    )
  }

  // If error, show error message using the extracted component
  if (error) {
    return <ChatErrorState error={error} starCount={starCount} workflowId={subdomain} />
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
          subdomain={subdomain}
          onAuthSuccess={handleAuthSuccess}
          title={title}
          primaryColor={primaryColor}
        />
      )
    }
    if (authRequired === 'email') {
      return (
        <EmailAuth
          subdomain={subdomain}
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
      <TooltipProvider>
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
      </TooltipProvider>
    )
  }

  // Standard text-based chat interface
  return (
    <TooltipProvider>
      <div className='fixed inset-0 z-[100] flex flex-col bg-background text-foreground'>
        {showInputForm && !isHistoryLoading && (
          <div className='absolute z-[100] mt-[65px] flex h-full w-full flex-1 items-center justify-center bg-white/60 p-4 pb-[7%]'>
            <div className='mx-auto w-full max-w-2xl'>
              <div className='relative rounded-lg border bg-card p-6 shadow-sm'>
                {threads.length > 0 && (
                  <button
                    aria-label='Close'
                    className='absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50'
                    onClick={() => {
                      setShowInputForm(false)
                      setInputFormDismissed(true)
                    }}
                  >
                    <X className='h-4 w-4' />
                  </button>
                )}
                <div className='mb-6'>
                  <h2 className='mb-2 font-semibold text-2xl'>Workflow Inputs</h2>
                  <p className='text-muted-foreground'>
                    Please provide the required inputs to start the workflow chat.
                  </p>
                </div>
                <TooltipProvider>
                  <WorkflowInputForm fields={inputFields} onSubmit={handleWorkflowInputSubmit} />
                </TooltipProvider>
              </div>
            </div>
          </div>
        )}
        {isHistoryLoading && (
          <div className='absolute top-[72px] left-[276px] z-[105] flex h-[calc(100vh-85px)] w-[calc(100vw-286px)] items-center justify-center bg-white/60 pb-[6%]'>
            <LoadingAgentP2 size='lg' />
          </div>
        )}
        {/* Header component */}
        <ChatHeader chatConfig={chatConfig} starCount={starCount} workflowId={subdomain} />

        <LeftNavThread
          threads={threads}
          isLoading={isThreadsLoading}
          error={threadsError}
          currentChatId={currentChatId || ''}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          onReRunWithNewInputs={handleReRunWithNewInputs}
          isStreaming={isStreamingResponse || isLoading}
          hasInputFields={inputFields.length > 0}
        />
        {/* Message Container component */}
        <ChatMessageContainer
          messages={messages}
          setMessages={setMessages}
          isLoading={isLoading}
          showScrollButton={showScrollButton}
          messagesContainerRef={messagesContainerRef as RefObject<HTMLDivElement>}
          messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
          scrollToBottom={scrollToBottom}
          scrollToMessage={scrollToMessage}
          chatConfig={chatConfig}
          workflowId={subdomain}
        />

        {/* Input area (free-standing at the bottom) */}
        <div className='relative p-3 pb-4 md:p-4 md:pb-6'>
          <div className='relative mx-auto max-w-3xl md:max-w-[748px]'>
            <ChatInput
              onSubmit={(value, isVoiceInput) => {
                void handleSendMessage(value, isVoiceInput, false)
              }}
              isStreaming={isStreamingResponse}
              onStopStreaming={() => stopStreaming(setMessages)}
              onVoiceStart={handleVoiceStart}
              currentChatId={currentChatId}
            />
          </div>
        </div>
        <Toaster position='top-right' />
      </div>
    </TooltipProvider>
  )
}
