'use client'

import { type Dispatch, memo, type RefObject, type SetStateAction } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArenaClientChatMessage, type ChatMessage } from '../message/ArenaClientChatMessage'

interface ChatMessageContainerProps {
  messages: ChatMessage[]
  isLoading: boolean
  /** When true, response is streaming (show "Fetching..." instead of "Thinking...") */
  isStreaming?: boolean
  showScrollButton: boolean
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesEndRef: RefObject<HTMLDivElement>
  scrollToBottom: () => void
  scrollToMessage?: (messageId: string) => void
  chatConfig: {
    description?: string
  } | null
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
  /** When set, "View in Knowledge Base" links are shown for refs whose workspaceId is in this list (user has workspace access) */
  workspaceIdsForKbLinks?: string[]
}

export const ChatMessageContainer = memo(function ChatMessageContainer({
  messages,
  isLoading,
  isStreaming = false,
  showScrollButton,
  messagesContainerRef,
  messagesEndRef,
  scrollToBottom,
  scrollToMessage,
  chatConfig,
  setMessages,
  workspaceIdsForKbLinks,
}: ChatMessageContainerProps) {
  const loadingLabel = isStreaming ? 'Fetching' : 'Thinking'

  return (
    <div className='relative flex flex-1 flex-col overflow-hidden bg-white'>
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
                workspaceIdsForKbLinks={workspaceIdsForKbLinks}
              />
            ))
          )}

          {/* Loading indicator with label and bouncing dots (when executing) */}
          {isLoading && (
            <div className='px-4 py-5'>
              <div className='mx-auto max-w-3xl'>
                <div className='flex items-center gap-2'>
                  <div className='flex gap-1' aria-hidden>
                    <span
                      className='h-2 w-2 animate-bounce rounded-full bg-gray-600 [animation-delay:0ms] [animation-duration:1s] dark:bg-gray-400'
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className='h-2 w-2 animate-bounce rounded-full bg-gray-600 [animation-duration:1s] dark:bg-gray-400'
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className='h-2 w-2 animate-bounce rounded-full bg-gray-600 [animation-duration:1s] dark:bg-gray-400'
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                  <span className='font-medium text-muted-foreground text-sm'>
                    {loadingLabel}...
                  </span>
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
