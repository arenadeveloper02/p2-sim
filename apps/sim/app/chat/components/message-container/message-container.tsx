'use client'

import {
  type Dispatch,
  memo,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ArrowDown, MessageCircle } from 'lucide-react'
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
  /** When user selects text and clicks "Ask this in chat", this is called with the selected text */
  onAskInChat?: (text: string) => void
  /** When welcome message query chips are clicked, trigger execution with this query */
  onWelcomeQueryClick?: (text: string) => void
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
  onAskInChat,
  onWelcomeQueryClick,
}: ChatMessageContainerProps) {
  const loadingLabel = isStreaming ? 'Fetching' : 'Thinking'
  const [selectionTip, setSelectionTip] = useState<{
    text: string
    top: number
    left: number
  } | null>(null)
  const tipRef = useRef<HTMLButtonElement>(null)

  const handleMouseUp = useCallback(() => {
    if (!onAskInChat || !messagesContainerRef?.current) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setSelectionTip(null)
      return
    }
    const text = selection.toString().trim()
    if (!text) {
      setSelectionTip(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!range) return
    const rect = range.getBoundingClientRect()
    const container = messagesContainerRef.current
    const containerRect = container.getBoundingClientRect()
    if (
      rect.top < containerRect.top ||
      rect.bottom > containerRect.bottom ||
      rect.left < containerRect.left ||
      rect.right > containerRect.right
    ) {
      setSelectionTip(null)
      return
    }
    setSelectionTip({
      text,
      top: rect.top,
      left: rect.left,
    })
  }, [onAskInChat, messagesContainerRef])

  const handleAskInChatClick = useCallback(() => {
    if (!selectionTip) return
    onAskInChat?.(selectionTip.text)
    window.getSelection()?.removeAllRanges()
    setSelectionTip(null)
  }, [selectionTip, onAskInChat])

  useEffect(() => {
    if (!onAskInChat) return
    const container = messagesContainerRef?.current
    if (!container) return
    container.addEventListener('mouseup', handleMouseUp)
    return () => container.removeEventListener('mouseup', handleMouseUp)
  }, [onAskInChat, handleMouseUp, messagesContainerRef])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) {
        setSelectionTip(null)
      }
    }
    if (selectionTip) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectionTip])

  return (
    <div className='relative flex flex-1 flex-col overflow-hidden bg-white'>
      {/* "Ask this in chat" tip - fixed near selection */}
      {selectionTip && onAskInChat && (
        <button
          ref={tipRef}
          type='button'
          onClick={handleAskInChatClick}
          className='fixed z-50 flex items-center gap-2 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-b from-white/60 via-gray-50 to-gray-100 px-3 py-2 font-semibold text-gray-800 shadow-md transition-colors hover:from-white/70 hover:via-gray-100 hover:to-gray-200 hover:text-gray-900'
          style={{
            top: selectionTip.top,
            left: selectionTip.left,
            transform: 'translateY(calc(-100% - 8px))',
          }}
        >
          <MessageCircle className='h-4 w-4 shrink-0 text-gray-700' />
          <span className='whitespace-nowrap text-base'>Ask this in chat</span>
        </button>
      )}

      {/* Scrollable Messages Area */}
      <div
        ref={messagesContainerRef}
        className='!scroll-smooth absolute inset-0 h-[calc(100%-65px)] touch-pan-y overflow-y-auto overscroll-auto'
      >
        <div className='ml-64 w-[calc(100%-270px)] px-4 pb-8'>
          {messages.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-10'>
              <div className='space-y-2 text-center'>
                <h3 className='font-medium text-[var(--landing-text)] text-lg'>
                  How can I help you today?
                </h3>
                <p className='text-[var(--landing-text-muted)] text-sm'>
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
                onCopySegmentToInput={onAskInChat}
                onWelcomeQueryClick={onWelcomeQueryClick}
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
            className='flex items-center gap-1 rounded-full border border-[var(--border-1)] px-3 py-1 shadow-lg transition-all hover:opacity-80 dark:bg-[var(--landing-bg-elevated)]'
          >
            <ArrowDown className='h-3.5 w-3.5' />
            <span className='sr-only'>Scroll to bottom</span>
          </Button>
        </div>
      )}
    </div>
  )
})
