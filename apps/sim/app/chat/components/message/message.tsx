'use client'

import {
  type Dispatch,
  memo,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Check, Copy, Download, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toastError, toastSuccess } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  downloadImage,
  isBase64,
  renderBs64Img,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/chat/components/chat-message/constants'
import { FeedbackBox } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/chat/components/chat-message/feedback-box'
import CopilotMarkdownRenderer from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/markdown-renderer'
import MarkdownRenderer from './components/markdown-renderer'

export interface ChatMessage {
  id: string
  content: string | Record<string, unknown>
  type: 'user' | 'assistant'
  timestamp: Date
  isInitialMessage?: boolean
  isStreaming?: boolean
  executionId?: string
  liked?: boolean | null
}

function EnhancedMarkdownRenderer({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <MarkdownRenderer content={content} />
    </TooltipProvider>
  )
}

export const ClientChatMessage = memo(
  function ClientChatMessage({
    message,
    setMessages,
  }: {
    message: ChatMessage
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  }) {
    const [isCopied, setIsCopied] = useState(false)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const feedbackRef = useRef<HTMLDivElement>(null)

    const isJsonObject = useMemo(() => {
      return typeof message.content === 'object' && message.content !== null
    }, [message.content])

    // Since tool calls are now handled via SSE events and stored in message.toolCalls,
    // we can use the content directly without parsing
    const cleanTextContent = message.content

    // Close this feedback box when another message opens theirs
    useEffect(() => {
      if (typeof window === 'undefined') return
      const handleCloseFeedback = () => setIsFeedbackOpen(false)
      window.addEventListener('p2-close-feedback', handleCloseFeedback)
      return () => {
        window.removeEventListener('p2-close-feedback', handleCloseFeedback)
      }
    }, [])

    // Close feedback box when clicking outside
    useEffect(() => {
      if (!isFeedbackOpen) return

      const handleClickOutside = (event: MouseEvent) => {
        if (feedbackRef.current && !feedbackRef.current.contains(event.target as Node)) {
          setIsFeedbackOpen(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isFeedbackOpen])

    const renderContent = (content: any) => {
      if (!content) {
        return null
      }

      try {
        if (isBase64(content)) {
          return renderBs64Img({ isBase64: true, imageData: content })
        }
        if (content) {
          return <CopilotMarkdownRenderer content={content} />
        }
      } catch (error) {
        console.error('Error rendering message content:', error)
        return (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
            <p className='text-sm'>⚠️ Error displaying content. Please try refreshing the chat.</p>
          </div>
        )
      }
    }

    const handleCopy = () => {
      const contentToCopy =
        typeof cleanTextContent === 'string'
          ? cleanTextContent
          : JSON.stringify(cleanTextContent, null, 2)
      navigator.clipboard.writeText(contentToCopy)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }

    const handleLike = async (currentExecutionId: string) => {
      if (!currentExecutionId) return
      try {
        await fetch(`/api/chat/feedback/${currentExecutionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: '',
            inComplete: false,
            inAccurate: false,
            outOfDate: false,
            tooLong: false,
            tooShort: false,
            liked: true,
          }),
        })
        setMessages((prev: any) =>
          prev.map((msg: any) =>
            msg.executionId === currentExecutionId ? { ...msg, liked: true } : msg
          )
        )
        toastSuccess('Success', {
          description: 'Thanks for your feedback!',
        })
      } catch {
        toastError('Error', {
          description: 'Something went wrong!',
        })
      } finally {
        setIsFeedbackOpen(false)
      }
    }

    const handleDislike = (currentExecutionId: string) => {
      try {
        // Close any other open feedback boxes across messages
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('p2-close-feedback'))
        }
      } catch {}
      setIsFeedbackOpen(true)
    }

    const handleSubmitFeedback = async (feedback: any, currentExecutionId: string) => {
      if (!currentExecutionId) return

      try {
        await fetch(`/api/chat/feedback/${currentExecutionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: feedback.comment?.trim() || '',
            inComplete: feedback.incomplete,
            inAccurate: feedback.inaccurate,
            outOfDate: feedback.outOfDate,
            tooLong: feedback.tooLong,
            tooShort: feedback.tooShort,
            liked: false, // This is a dislike feedback
          }),
        })
        setMessages((prev: any) =>
          prev.map((msg: any) =>
            msg.executionId === currentExecutionId ? { ...msg, liked: false } : msg
          )
        )
        toastSuccess('Success', {
          description: 'Thanks for your feedback!',
        })
      } catch {
        toastError('Error', {
          description: 'Something went wrong!',
        })
      } finally {
        setIsFeedbackOpen(false)
      }
    }

    // For user messages (on the right)
    if (message.type === 'user') {
      return (
        <div className='px-4 py-5' data-message-id={message.id}>
          <div className='mx-auto max-w-3xl'>
            <div className='flex justify-end'>
              <div className='max-w-[94%] rounded-3xl bg-[#F4F4F4] px-4 py-3 dark:bg-gray-600'>
                <div className='whitespace-pre-wrap break-words text-base text-gray-800 leading-relaxed dark:text-gray-100'>
                  {isJsonObject ? (
                    <span>{JSON.stringify(message.content as string)}</span>
                  ) : (
                    <span>{message.content as string}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // For assistant messages (on the left)
    return (
      <div className='px-4 pt-5 pb-2' data-message-id={message.id}>
        <div className='mx-auto max-w-3xl'>
          <div className='flex flex-col space-y-3'>
            {/* Direct content rendering - tool calls are now handled via SSE events */}
            <div>
              <div className='break-words text-base'>
                {renderContent(cleanTextContent)}
                {/* {isJsonObject ? (
                  <pre className='text-gray-800 dark:text-gray-100'>
                    {JSON.stringify(cleanTextContent, null, 2)}
                  </pre>
                ) : (
                  <EnhancedMarkdownRenderer content={cleanTextContent as string} />
                )} */}
              </div>
            </div>
            {message.type === 'assistant' && !message.isStreaming && !message.isInitialMessage && (
              <div className='relative flex items-center justify-start space-x-2'>
                {/* Feedback Box Popover */}
                <div
                  ref={feedbackRef}
                  className={`absolute bottom-full left-0 z-50 mb-2 w-[400px] transition-all duration-200 ease-out ${
                    isFeedbackOpen
                      ? 'translate-y-0 scale-100 opacity-100'
                      : 'pointer-events-none translate-y-2 scale-95 opacity-0'
                  }`}
                >
                  <FeedbackBox
                    isOpen={isFeedbackOpen}
                    onClose={() => setIsFeedbackOpen(false)}
                    onSubmit={handleSubmitFeedback}
                    currentExecutionId={message?.executionId || ''}
                  />
                </div>

                {!isJsonObject && !isBase64(cleanTextContent) && (
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <button
                          className='text-muted-foreground transition-colors hover:bg-muted'
                          onClick={() => {
                            handleCopy()
                          }}
                        >
                          {isCopied ? (
                            <Check className='h-4 w-4' strokeWidth={2} />
                          ) : (
                            <Copy className='h-4 w-4' strokeWidth={2} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side='top' align='center' sideOffset={5}>
                        {isCopied ? 'Copied!' : 'Copy to clipboard'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {cleanTextContent && message?.executionId && (
                  <>
                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        {(message?.liked === true || message?.liked === null) && (
                          <TooltipTrigger asChild>
                            <button
                              className='text-muted-foreground transition-colors hover:bg-muted'
                              onClick={() => {
                                if (message?.liked === true) {
                                  return
                                }
                                handleLike(message?.executionId || '')
                              }}
                            >
                              <ThumbsUp
                                stroke={'gray'}
                                fill={message?.liked === true ? 'gray' : 'white'}
                                className='h-4 w-4'
                                strokeWidth={2}
                              />
                            </button>
                          </TooltipTrigger>
                        )}
                        <TooltipContent side='top' align='center' sideOffset={5}>
                          {message?.liked === true ? 'Liked' : 'Like'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip delayDuration={300}>
                        {(message?.liked === false || message?.liked === null) && (
                          <TooltipTrigger asChild>
                            <button
                              className='text-muted-foreground transition-colors hover:bg-muted'
                              onClick={() => {
                                if (message?.liked === false) {
                                  return
                                }
                                handleDislike(message?.executionId || '')
                              }}
                            >
                              <ThumbsDown
                                stroke={'gray'}
                                fill={message?.liked === false ? 'gray' : 'white'}
                                className='h-4 w-4'
                                strokeWidth={2}
                              />
                            </button>
                          </TooltipTrigger>
                        )}
                        <TooltipContent side='top' align='center' sideOffset={5}>
                          {message?.liked === false ? 'Disliked' : 'Dislike'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}

                {isBase64(cleanTextContent) && (
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <button
                          className='text-muted-foreground transition-colors hover:bg-muted'
                          onClick={() => {
                            downloadImage(isBase64(cleanTextContent), cleanTextContent as string)
                          }}
                        >
                          <Download className='h-4 w-4' strokeWidth={2} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side='top' align='center' sideOffset={5}>
                        Download
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
  // Memoization to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.isStreaming === nextProps.message.isStreaming &&
      prevProps.message.isInitialMessage === nextProps.message.isInitialMessage &&
      prevProps.message.executionId === nextProps.message.executionId &&
      prevProps.message.liked === nextProps.message.liked
    )
  }
)
