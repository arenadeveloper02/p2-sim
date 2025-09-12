import { useMemo, useState } from 'react'
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip'
import CopilotMarkdownRenderer from '../../../copilot/components/copilot-message/components/markdown-renderer'
import { isBase64, renderBs64Img } from './constants'

interface ChatMessageProps {
  message: {
    id: string
    content: any
    timestamp: string | Date
    type: 'user' | 'workflow'
    isStreaming?: boolean
  }
}

// Maximum character length for a word before it's broken up
const MAX_WORD_LENGTH = 25

const WordWrap = ({ text }: { text: string }) => {
  if (!text) return null

  // Split text into words, keeping spaces and punctuation
  const parts = text.split(/(\s+)/g)

  return (
    <>
      {parts.map((part, index) => {
        // If the part is whitespace or shorter than the max length, render it as is
        if (part.match(/\s+/) || part.length <= MAX_WORD_LENGTH) {
          return <span key={index}>{part}</span>
        }

        // For long words, break them up into chunks
        const chunks = []
        for (let i = 0; i < part.length; i += MAX_WORD_LENGTH) {
          chunks.push(part.substring(i, i + MAX_WORD_LENGTH))
        }

        return (
          <span key={index} className='break-all'>
            {chunks.map((chunk, chunkIndex) => (
              <span key={chunkIndex}>{chunk}</span>
            ))}
          </span>
        )
      })}
    </>
  )
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [isCopied, setIsCopied] = useState(false)
  // Format message content as text
  const formattedContent = useMemo(() => {
    if (typeof message.content === 'object' && message.content !== null) {
      return JSON.stringify(message.content, null, 2)
    }
    return String(message.content || '')
  }, [message.content])

  // Render human messages as chat bubbles
  if (message.type === 'user') {
    return (
      <div className='w-full py-2'>
        <div className='flex justify-end'>
          <div className='max-w-[80%]'>
            <div className='rounded-[10px] bg-secondary px-3 py-2'>
              <div className='whitespace-pre-wrap break-words font-normal text-foreground text-sm leading-normal'>
                <WordWrap text={formattedContent} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderContent = (content: any) => {
    if (!content) {
      return null
    }
    if (isBase64(content)) {
      return renderBs64Img({ isBase64: true, imageData: message.content })
    }
    if (formattedContent) {
      return <CopilotMarkdownRenderer content={formattedContent} />
    }
  }

  const handleCopy = () => {
    const contentToCopy =
      typeof formattedContent === 'string'
        ? formattedContent
        : JSON.stringify(formattedContent, null, 2)
    navigator.clipboard.writeText(contentToCopy)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  // Render agent/workflow messages as full-width text
  return (
    <div className='w-full py-2 pl-[2px]'>
      <div className='overflow-wrap-anywhere relative whitespace-normal break-normal font-normal text-sm leading-normal'>
        <div className='whitespace-pre-wrap break-words bg-secondary p-3 text-foreground'>
          {/* <WordWrap text={formattedContent} /> */}
          {renderContent(message?.content)}
          {message.isStreaming && (
            <span className='ml-1 inline-block h-4 w-2 animate-pulse bg-primary' />
          )}
        </div>
        <div className='mt-2 mr-3 flex justify-end gap-3'>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  handleCopy()
                }}
                className='font-medium text-md leading-normal transition-[filter] hover:brightness-75 focus:outline-none focus-visible:outline-none active:outline-none dark:hover:brightness-125'
                style={{ color: 'var(--base-muted-foreground)' }}
              >
                {!isBase64(message?.content) && (
                  <>
                    {isCopied ? (
                      <Check className='h-4 w-4' strokeWidth={2} />
                    ) : (
                      <Copy className='h-4 w-4' strokeWidth={2} />
                    )}
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side='bottom'>Copy</TooltipContent>
            </TooltipPortal>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {}}
                className='font-medium text-md leading-normal transition-[filter] hover:brightness-75 focus:outline-none focus-visible:outline-none active:outline-none dark:hover:brightness-125'
                style={{ color: 'var(--base-muted-foreground)' }}
              >
                <ThumbsUp className='h-4 w-4' strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side='bottom'>Like</TooltipContent>
            </TooltipPortal>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {}}
                className='font-medium text-md leading-normal transition-[filter] hover:brightness-75 focus:outline-none focus-visible:outline-none active:outline-none dark:hover:brightness-125'
                style={{ color: 'var(--base-muted-foreground)' }}
              >
                <ThumbsDown className='h-4 w-4' strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side='bottom'>Dislike</TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
