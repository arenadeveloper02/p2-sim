'use client'

import { type Dispatch, memo, type RefObject, type SetStateAction } from 'react'
import { ArrowDown, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThinkingStep } from '@/app/chat/hooks/use-chat-streaming'
import { ArenaClientChatMessage, type ChatMessage } from '../message/ArenaClientChatMessage'

interface ChatMessageContainerProps {
  messages: ChatMessage[]
  isLoading: boolean
  thinkingSteps?: ThinkingStep[]
  showScrollButton: boolean
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesEndRef: RefObject<HTMLDivElement>
  scrollToBottom: () => void
  scrollToMessage?: (messageId: string) => void
  chatConfig: {
    description?: string
  } | null
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
}

export const ChatMessageContainer = memo(function ChatMessageContainer({
  messages,
  isLoading,
  thinkingSteps = [],
  showScrollButton,
  messagesContainerRef,
  messagesEndRef,
  scrollToBottom,
  scrollToMessage,
  chatConfig,
  setMessages,
}: ChatMessageContainerProps) {
  return (
    <div className='relative flex flex-1 flex-col overflow-hidden bg-white'>
      <style jsx>{`
        @keyframes growShrink {
          0%,
          100% {
            transform: scale(0.9);
          }
          50% {
            transform: scale(1.1);
          }
        }
        .loading-dot {
          animation: growShrink 1.5s infinite ease-in-out;
        }
      `}</style>

      {/* Scrollable Messages Area */}
      <div
        ref={messagesContainerRef}
        className='!scroll-smooth absolute inset-0 h-[calc(100%-50px)] touch-pan-y overflow-y-auto overscroll-auto'
      >
        <div className='ml-64 w-[calc(100%-270px)] px-4 pb-8'>
          {messages.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-10'>
              <div className='space-y-2 text-center'>
                <h3 className='font-medium text-lg'>How can I help you today?</h3>
                <p className='text-muted-foreground text-sm'>
                  {chatConfig?.description || 'Ask me anything.'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ArenaClientChatMessage
                key={message.id}
                message={message}
                setMessages={setMessages}
              />
            ))
          )}

          {/* Thinking steps indicator (shows dynamic block execution steps) */}
          {thinkingSteps.length > 0 && (
            <div className='px-4 py-3'>
              <div className='mx-auto max-w-3xl'>
                <div className='flex'>
                  <div className='max-w-[80%]'>
                    <div className='space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3'>
                      <div className='flex items-center gap-2 font-medium text-gray-700 text-sm'>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        <span>Processing...</span>
                      </div>
                      <div className='space-y-1.5'>
                        {thinkingSteps.map((step, index) => (
                          <div
                            key={step.blockId}
                            className='flex items-start gap-2 text-gray-600 text-sm'
                          >
                            <div className='mt-0.5'>
                              {step.status === 'complete' ? (
                                <CheckCircle className='h-3.5 w-3.5 text-green-500' />
                              ) : (
                                <Loader2 className='h-3.5 w-3.5 animate-spin text-blue-500' />
                              )}
                            </div>
                            <div className='flex flex-col'>
                              <span className={step.status === 'complete' ? 'text-gray-400' : ''}>
                                {step.blockName}
                              </span>
                              {step.status === 'running' && step.progressMessage && (
                                <span className='text-xs text-muted-foreground animate-pulse'>
                                  {step.progressMessage}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator (shows only when executing and no thinking steps) */}
          {isLoading && thinkingSteps.length === 0 && (
            <div className='px-4 py-5'>
              <div className='mx-auto max-w-3xl'>
                <div className='flex'>
                  <div className='max-w-[80%]'>
                    <div className='flex h-6 items-center'>
                      <div className='loading-dot h-3 w-3 rounded-full bg-gray-800 dark:bg-gray-300' />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* End of messages marker for scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom button - appears when user scrolls up */}
      {showScrollButton && (
        <div className='-translate-x-1/2 absolute bottom-16 left-1/2 z-20 ml-[9%] transform'>
          <Button
            onClick={scrollToBottom}
            size='sm'
            variant='outline'
            className='flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-lg transition-all hover:bg-gray-50'
          >
            <ArrowDown className='h-3.5 w-3.5' />
            <span className='sr-only'>Scroll to bottom</span>
          </Button>
        </div>
      )}
    </div>
  )
})
