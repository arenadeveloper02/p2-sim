'use client'

import { type Dispatch, memo, type RefObject, type SetStateAction } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BlockProgress, ToolProgress } from '@/app/chat/hooks/use-chat-streaming'
import { ArenaClientChatMessage, type ChatMessage } from '../message/ArenaClientChatMessage'

interface ChatMessageContainerProps {
  messages: ChatMessage[]
  isLoading: boolean
  showScrollButton: boolean
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesEndRef: RefObject<HTMLDivElement>
  scrollToBottom: () => void
  scrollToMessage?: (messageId: string) => void
  chatConfig: {
    description?: string
  } | null
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
  currentBlockProgress?: BlockProgress | null
  currentToolProgress?: ToolProgress | null
}

export const ChatMessageContainer = memo(function ChatMessageContainer({
  messages,
  isLoading,
  showScrollButton,
  messagesContainerRef,
  messagesEndRef,
  scrollToBottom,
  scrollToMessage,
  chatConfig,
  setMessages,
  currentBlockProgress,
  currentToolProgress,
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

          {/* Block and tool progress indicator (shows what's running) */}
          {currentBlockProgress && currentBlockProgress.status === 'running' && (
            <div className='px-4 py-3'>
              <div className='mx-auto max-w-3xl'>
                <div className='flex flex-col gap-1'>
                  <div className='flex items-center gap-2 text-muted-foreground text-sm'>
                    <div className='loading-dot h-2 w-2 rounded-full bg-blue-500' />
                    <span>🔧 Running {currentBlockProgress.blockName}...</span>
                  </div>

                  {/* High-level thinking steps while the block is running */}
                  <div className='ml-4 flex flex-col gap-0.5 text-muted-foreground text-xs'>
                    <span>• Understanding your request…</span>
                    {currentToolProgress && currentToolProgress.status === 'running' ? (
                      <>
                        <span>
                          • {currentToolProgress.description || `Calling ${currentToolProgress.toolName}…`}
                        </span>
                        <span>• Analyzing results from the tool…</span>
                      </>
                    ) : (
                      <>
                        <span>• Planning next step…</span>
                        <span>• Preparing answer…</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator (shows only when executing and no block progress) */}
          {isLoading && !currentBlockProgress && (
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
