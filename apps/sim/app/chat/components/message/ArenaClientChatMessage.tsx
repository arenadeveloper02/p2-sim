'use client'

import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Check, Copy, Download, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Tooltip } from '@/components/emcn'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
// import MarkdownRenderer from './components/markdown-renderer'
// import { toastError, toastSuccess } from '@/components/ui'
import {
  downloadImage,
  extractAllBase64Images,
  extractBase64Image,
  hasBase64Images,
  isBase64,
  renderBs64Img,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'
import { FeedbackBox } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/feedback-box'
import ArenaCopilotMarkdownRenderer from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/arena-markdown-renderer'
import { StreamingIndicator } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/smooth-streaming'
import type { KnowledgeResultChunk } from '@/app/chat/components/message/message'
import { KnowledgeResultsModal } from './components/knowledge-results-modal'

export interface ChatMessage {
  id: string
  content: string | Record<string, unknown>
  type: 'user' | 'assistant'
  timestamp: Date
  isInitialMessage?: boolean
  isStreaming?: boolean
  executionId?: string
  liked?: boolean | null
  knowledgeResults?: KnowledgeResultChunk[]
}

// function EnhancedMarkdownRenderer({ content }: { content: string }) {
//   return (
//     <TooltipProvider>
//       <MarkdownRenderer content={content} />
//     </TooltipProvider>
//   )
// }

export const ArenaClientChatMessage = memo(
  function ArenaClientChatMessage({
    message,
    setMessages,
  }: {
    message: ChatMessage
    setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
  }) {
    const [isCopied, setIsCopied] = useState(false)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [isLikeFeedbackOpen, setIsLikeFeedbackOpen] = useState(false)
    const [popoverSide, setPopoverSide] = useState<'top' | 'bottom'>('top')
    const [isFeedbackPending, setIsFeedbackPending] = useState(false)
    const dislikeButtonRef = useRef<HTMLButtonElement>(null)
    const likeButtonRef = useRef<HTMLButtonElement>(null)

    const isJsonObject = useMemo(() => {
      return typeof message.content === 'object' && message.content !== null
    }, [message.content])

    // Since tool calls are now handled via SSE events and stored in message.toolCalls,
    // we can use the content directly without parsing
    const cleanTextContent = message.content

    // Close this feedback box when another message opens theirs
    useEffect(() => {
      if (typeof window === 'undefined') return
      const handleCloseFeedback = () => {
        setIsFeedbackOpen(false)
        setIsLikeFeedbackOpen(false)
      }
      window.addEventListener('p2-close-feedback', handleCloseFeedback)
      return () => {
        window.removeEventListener('p2-close-feedback', handleCloseFeedback)
      }
    }, [])

    const renderContent = (content: any) => {
      if (!content) {
        return null
      }

      try {
        // If content is a pure base64 image, render it directly
        if (typeof content === 'string' && isBase64(content)) {
          const cleanedContent = content.replace(/\s+/g, '')
          return renderBs64Img({ isBase64: true, imageData: cleanedContent })
        }

        // If content is a string, check for mixed content (text + base64 images)
        if (typeof content === 'string') {
          const { textParts, base64Images } = extractBase64Image(content)

          // If we found base64 images, render both text and images
          if (base64Images.length > 0) {
            return (
              <>
                {textParts.length > 0 && (
                  <ArenaCopilotMarkdownRenderer content={textParts.join('\n\n')} />
                )}
                {base64Images.map((imageData, index) => (
                  <div key={index}>{renderBs64Img({ isBase64: true, imageData })}</div>
                ))}
              </>
            )
          }

          // If no base64 images, just render as markdown
          return <ArenaCopilotMarkdownRenderer content={content} />
        }

        // For other content types, render as markdown
        return <ArenaCopilotMarkdownRenderer content={content} />
      } catch (error) {
        console.error('Error rendering message content:', error)
        return (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
            <p className='text-sm'>⚠️ Error displaying content. Please try refreshing the chat.</p>
          </div>
        )
      }
    }

    const hasRenderableText = useMemo(() => {
      if (typeof cleanTextContent === 'string') {
        return cleanTextContent.trim().length > 0
      }
      return !!cleanTextContent && !isBase64(cleanTextContent)
    }, [cleanTextContent])

    const handleCopy = () => {
      const contentToCopy =
        typeof cleanTextContent === 'string'
          ? cleanTextContent
          : JSON.stringify(cleanTextContent, null, 2)
      navigator.clipboard.writeText(contentToCopy)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }

    const handleDownload = () => {
      const base64Images = extractAllBase64Images(cleanTextContent)
      if (base64Images.length > 0) {
        // Download the first image (or all if multiple)
        base64Images.forEach((imageData, index) => {
          downloadImage(true, imageData)
        })
      }
    }

    const containsBase64Images = hasBase64Images(cleanTextContent)

    const [knowledgeModalDoc, setKnowledgeModalDoc] = useState<{
      documentName: string
      chunks: KnowledgeResultChunk[]
    } | null>(null)

    const uniqueDocRefs = useMemo(() => {
      const results = message.knowledgeResults ?? []
      const seen = new Map<string, { documentName: string; chunks: KnowledgeResultChunk[] }>()
      for (const r of results) {
        const id = r.documentId
        if (!seen.has(id)) {
          seen.set(id, {
            documentName: r.documentName || r.documentId,
            chunks: results.filter((c) => c.documentId === id),
          })
        }
      }
      return Array.from(seen.values())
    }, [message.knowledgeResults])

    const openKnowledgeModal = useCallback(
      (documentName: string, chunks: KnowledgeResultChunk[]) => {
        setKnowledgeModalDoc({ documentName, chunks })
      },
      []
    )

    const handleLike = async (currentExecutionId: string) => {
      if (!currentExecutionId) return

      // If already liked, unlike it (send null to backend)
      if (message.liked === true) {
        setIsFeedbackPending(true)
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
              liked: null,
            }),
          })
          setMessages?.((prev: any) =>
            prev.map((msg: any) =>
              msg.executionId === currentExecutionId ? { ...msg, liked: null } : msg
            )
          )
        } catch {
          // toastError('Error', {
          //   description: 'Something went wrong!',
          // })
        } finally {
          setIsLikeFeedbackOpen(false)
          setIsFeedbackPending(false)
        }
        return
      }

      // Otherwise, open feedback popover for like feedback
      try {
        // Close any other open feedback boxes across messages
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('p2-close-feedback'))
        }
      } catch {}
      setIsLikeFeedbackOpen(true)
    }

    const handleSubmitLikeFeedback = async (feedback: any, currentExecutionId: string) => {
      if (!currentExecutionId) return

      setIsFeedbackPending(true)
      try {
        await fetch(`/api/chat/feedback/${currentExecutionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: feedback.comment?.trim() || '',
            inComplete: false,
            inAccurate: false,
            outOfDate: false,
            tooLong: false,
            tooShort: false,
            liked: true, // This is a like feedback
          }),
        })
        setMessages?.((prev: any) =>
          prev.map((msg: any) =>
            msg.executionId === currentExecutionId ? { ...msg, liked: true } : msg
          )
        )
        // toastSuccess('Success', {
        //   description: 'Thanks for your feedback!',
        // })
      } catch {
        // toastError('Error', {
        //   description: 'Something went wrong!',
        // })
      } finally {
        setIsLikeFeedbackOpen(false)
        setIsFeedbackPending(false)
      }
    }

    const handleDislike = async (currentExecutionId: string) => {
      // If already disliked, undislike it (send null to backend)
      if (message.liked === false) {
        setIsFeedbackPending(true)
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
              liked: null,
            }),
          })
          setMessages?.((prev: any) =>
            prev.map((msg: any) =>
              msg.executionId === currentExecutionId ? { ...msg, liked: null } : msg
            )
          )
        } catch {
          // toastError('Error', {
          //   description: 'Something went wrong!',
          // })
        } finally {
          setIsFeedbackOpen(false)
          setIsFeedbackPending(false)
        }
        return
      }

      // Otherwise, open feedback popover
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

      setIsFeedbackPending(true)
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
        setMessages?.((prev: any) =>
          prev.map((msg: any) =>
            msg.executionId === currentExecutionId ? { ...msg, liked: false } : msg
          )
        )
        // toastSuccess('Success', {
        //   description: 'Thanks for your feedback!',
        // })
      } catch {
        // toastError('Error', {
        //   description: 'Something went wrong!',
        // })
      } finally {
        setIsFeedbackOpen(false)
        setIsFeedbackPending(false)
      }
    }

    // For user messages (on the right)
    if (message.type === 'user') {
      return (
        <div className='px-4 py-2' data-message-id={message.id}>
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
      <div className='px-4 pt-2 pb-2' data-message-id={message.id}>
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
            {uniqueDocRefs.length > 0 && (
              <div className='mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm'>
                <span className='text-gray-500 dark:text-gray-400'>References:</span>
                {uniqueDocRefs.map((ref) => (
                  <button
                    key={ref.chunks[0]?.documentId ?? ref.documentName}
                    type='button'
                    className='cursor-pointer rounded px-1.5 py-0.5 text-primary underline decoration-primary/50 underline-offset-2 transition-colors hover:bg-gray-100 hover:decoration-primary dark:hover:bg-gray-800'
                    onClick={() => openKnowledgeModal(ref.documentName, ref.chunks)}
                  >
                    {ref.documentName}
                  </button>
                ))}
              </div>
            )}
            {knowledgeModalDoc && (
              <KnowledgeResultsModal
                isOpen={!!knowledgeModalDoc}
                onClose={() => setKnowledgeModalDoc(null)}
                documentName={knowledgeModalDoc.documentName}
                chunks={knowledgeModalDoc.chunks}
              />
            )}
            {message.type === 'assistant' &&
              !message.isStreaming &&
              !message.isInitialMessage &&
              hasRenderableText && (
                <div className='flex items-center justify-start space-x-2'>
                  {!isJsonObject && !containsBase64Images && hasRenderableText && (
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
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
                        </Tooltip.Trigger>

                        <Tooltip.Content>
                          {isCopied ? 'Copied!' : 'Copy to clipboard'}
                        </Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  )}
                  {cleanTextContent && message?.executionId && (
                    <>
                      {isFeedbackPending ? (
                        <StreamingIndicator />
                      ) : (
                        <>
                          {(message?.liked === true || message?.liked === null) && (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Popover
                                  open={isLikeFeedbackOpen && message?.liked === null}
                                  onOpenChange={setIsLikeFeedbackOpen}
                                >
                                  <PopoverTrigger asChild>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        ref={likeButtonRef}
                                        className='text-muted-foreground transition-colors hover:bg-muted'
                                        onClick={() => {
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
                                    </Tooltip.Trigger>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className='z-[9999] w-[400px]'
                                    align='start'
                                    side={popoverSide}
                                    sideOffset={-15}
                                    avoidCollisions={true}
                                    collisionPadding={16}
                                    style={{
                                      padding: 0,
                                    }}
                                  >
                                    <FeedbackBox
                                      isOpen={true}
                                      onClose={() => setIsLikeFeedbackOpen(false)}
                                      onSubmit={handleSubmitLikeFeedback}
                                      currentExecutionId={message?.executionId || ''}
                                      isLikeFeedback={true}
                                    />
                                  </PopoverContent>
                                </Popover>
                                <Tooltip.Content>
                                  {message?.liked === true ? 'Unlike' : 'Like'}
                                </Tooltip.Content>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          )}

                          {(message?.liked === false || message?.liked === null) && (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Popover
                                  open={isFeedbackOpen && message?.liked !== false}
                                  onOpenChange={setIsFeedbackOpen}
                                >
                                  <PopoverTrigger asChild>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        ref={dislikeButtonRef}
                                        className='text-muted-foreground transition-colors hover:bg-muted'
                                        onClick={() => {
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
                                    </Tooltip.Trigger>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className='z-[9999] w-[400px]'
                                    align='start'
                                    side={popoverSide}
                                    sideOffset={-15}
                                    avoidCollisions={true}
                                    collisionPadding={16}
                                    style={{
                                      padding: 0,
                                    }}
                                  >
                                    <FeedbackBox
                                      isOpen={true}
                                      onClose={() => setIsFeedbackOpen(false)}
                                      onSubmit={handleSubmitFeedback}
                                      currentExecutionId={message?.executionId || ''}
                                    />
                                  </PopoverContent>
                                </Popover>
                                <Tooltip.Content side='top' align='center' sideOffset={5}>
                                  {message?.liked === false ? 'Remove dislike' : 'Dislike'}
                                </Tooltip.Content>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {containsBase64Images && (
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            className='text-muted-foreground transition-colors hover:bg-muted'
                            onClick={handleDownload}
                          >
                            <Download className='h-4 w-4' strokeWidth={2} />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content side='top' align='center' sideOffset={5}>
                          Download image
                        </Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
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
      prevProps.message.liked === nextProps.message.liked &&
      prevProps.message.knowledgeResults?.length === nextProps.message.knowledgeResults?.length
    )
  }
)
