'use client'

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TooltipProvider } from '@/components/ui/tooltip'
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

  // Function to handle thread change - clear messages except welcome message
  const handleThreadChange = useCallback(() => {
    setMessages((prevMessages) => {
      const welcomeMessage = prevMessages.find(msg => msg.isInitialMessage)
      return welcomeMessage ? [welcomeMessage] : []
    })
  }, [])

  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const isUserScrollingRef = useRef(false)

  const [authRequired, setAuthRequired] = useState<'password' | 'email' | null>(null)

  const [isVoiceFirstMode, setIsVoiceFirstMode] = useState(false)

  // Workflow input form state
  const [inputFields, setInputFields] = useState<any[]>([])
  const [showInputForm, setShowInputForm] = useState(false)
  const [initialInputsSubmitted, setInitialInputsSubmitted] = useState(false)
  const [workflowInputs, setWorkflowInputs] = useState<Record<string, any>>({})
  const [isLoadingInputFields, setIsLoadingInputFields] = useState(false)
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
        console.log('No chatId provided, skipping history fetch')
        return
      }

      try {
        const response = await fetch(`/api/chat/${workflowId}/history?chatId=${chatId}`)
        if (response.ok) {
          const data = await response.json()
          const formatData = data.logs.flatMap((log: any) => {
            const messages = []

            // Add user message if userInput exists
            if (log.userInput) {
              messages.push({
                id: `${log.id}-user`,
                content: log.userInput,
                type: 'user',
                timestamp: new Date(log.startedAt),
              })
            }

            // Add assistant message if modelOutput exists
            if (log.modelOutput) {
              messages.push({
                id: `${log.id}-assistant`,
                content: log.modelOutput,
                type: 'assistant',
                timestamp: new Date(log.endedAt || log.startedAt),
                isStreaming: false,
              })
            }

            return messages
          })
          
          setTimeout(() => {
            // Get the welcome message from current messages if it exists
            setMessages((prevMessages) => {
              const welcomeMessage = prevMessages.find(msg => msg.isInitialMessage)
              
              // Set messages: welcome message + history messages
              return welcomeMessage ? [welcomeMessage, ...formatData] : formatData
            })
            
            // Scroll to bottom after setting history messages
            setTimeout(() => {
              scrollToBottom()
            }, 100)
          }, 500)
        } else {
          console.error('Failed to fetch history:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('Error fetching history:', error)
      }
    }
    
    if (workflowId && Object.keys(chatConfig || {}).length > 0 && currentChatId) {
      fetchHistory(workflowId, currentChatId)
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
        // Check if auth is required
        if (response.status === 401) {
          const errorData = await response.json()

          if (errorData.error === 'auth_required_password') {
            setAuthRequired('password')
            return
          }
          if (errorData.error === 'auth_required_email') {
            setAuthRequired('email')
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
      setIsLoadingInputFields(true)
      // The subdomain is actually the workflow ID in this case
      const fields = await extractInputFieldsByWorkflowId(subdomain)
      console.log('<><><>Input fields', fields)
      setInputFields(fields)

      // If there are input fields, show the form
      if (fields && fields.length > 0) {
        setShowInputForm(true)
      } else {
        // No input fields needed, proceed directly to chat
        setInitialInputsSubmitted(true)
      }
    } catch (error) {
      logger.error('Error fetching input fields:', error)
      // On error, proceed to chat anyway
      setInitialInputsSubmitted(true)
    } finally {
      setIsLoadingInputFields(false)
    }
  }

  // Fetch chat config on mount and generate new conversation ID
  useEffect(() => {
    fetchChatConfig()
    fetchInputFields() // Fetch input fields for the workflow
    setConversationId(uuidv4())

    getFormattedGitHubStars()
      .then((formattedStars) => {
        setStarCount(formattedStars)
      })
      .catch((err) => {
        logger.error('Failed to fetch GitHub stars:', err)
      })
  }, [subdomain])

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
    isFormSubmission = false
  ) => {
    const messageToSend = messageParam ?? inputValue

    // Allow empty messages only if it's a form submission
    if (!messageToSend.trim() && !isFormSubmission && isLoading) return

    // For form submissions, use a default message if no message is provided
    const finalMessage =
      isFormSubmission && !messageToSend.trim()
        ? 'Starting workflow with provided inputs...'
        : messageToSend

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
      // Stringify the form inputs to use as the main workflow input
      const stringifiedInputs = Object.entries(inputs)
        .map(([key, value]) => {
          const formattedKey = key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char, index) =>
              index === 0 ? char.toUpperCase() : char.toLowerCase()
            )
          return `${formattedKey}: ${value}`
        })
        .join('\n')
      setWorkflowInputs(inputs)
      setShowInputForm(false)
      setInitialInputsSubmitted(true)

      // Add a message indicating the workflow is starting
      const workflowStartMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: 'Starting workflow with the provided inputs...',
        type: 'assistant',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, workflowStartMessage])

      // Trigger the workflow execution with stringified inputs as the main input
      await handleSendMessage(stringifiedInputs, false, true) // Use stringified inputs as the main message
    },
    [handleSendMessage]
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

  // If error, show error message using the extracted component
  if (error) {
    return <ChatErrorState error={error} starCount={starCount} />
  }

  // Show loading state while fetching input fields
  if (isLoadingInputFields) {
    return <ChatLoadingState />
  }

  // Show workflow input form if needed and not yet submitted
  if (showInputForm && !initialInputsSubmitted) {
    return (
      <div className='fixed inset-0 z-[100] flex flex-col bg-background text-foreground'>
        {/* Header component */}
        <ChatHeader chatConfig={chatConfig} starCount={starCount} />

        {/* Input form container */}
        <div className='flex flex-1 items-center justify-center p-4'>
          <div className='mx-auto w-full max-w-2xl'>
            <div className='rounded-lg border bg-card p-6 shadow-sm'>
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
      </div>
    )
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
        {/* Header component */}
        <ChatHeader chatConfig={chatConfig} starCount={starCount} workflowId={subdomain} />

        <LeftNavThread 
          workflowId={subdomain} 
          setCurrentChatId={setCurrentChatId} 
          currentChatId={currentChatId || ''} 
          onThreadChange={handleThreadChange}
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
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
