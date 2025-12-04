import { useMemo, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Tooltip } from '@/components/emcn'
import { StreamingIndicator } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/smooth-streaming'
import ArenaCopilotMarkdownRenderer from '../../../panel/components/copilot/components/copilot-message/components/arena-markdown-renderer'
import { downloadImage, isBase64 } from './constants'

interface ChatAttachment {
  id: string
  name: string
  type: string
  dataUrl: string
  size?: number
}

interface ChatMessageProps {
  message: {
    id: string
    content: any
    timestamp: string | Date
    type: 'user' | 'workflow'
    isStreaming?: boolean
    attachments?: ChatAttachment[]
  }
}

const MAX_WORD_LENGTH = 25

/**
 * Formats file size in human-readable format
 */
const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes === 0) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round((bytes / 1024 ** i) * 10) / 10} ${sizes[i]}`
}

/**
 * Opens image attachment in new window
 */
const openImageInNewWindow = (dataUrl: string, fileName: string) => {
  const newWindow = window.open('', '_blank')
  if (!newWindow) return

  newWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${fileName}</title>
        <style>
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
          img { max-width: 100%; max-height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="${fileName}" />
      </body>
    </html>
  `)
  newWindow.document.close()
}

/**
 * Component for wrapping long words to prevent overflow
 */
const WordWrap = ({ text }: { text: string }) => {
  if (!text) return null

  const parts = text.split(/(\s+)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.match(/\s+/) || part.length <= MAX_WORD_LENGTH) {
          return <span key={index}>{part}</span>
        }

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

const RenderButtons = ({
  message,
  formattedContent,
}: {
  message: ChatMessageProps['message']
  formattedContent: string
}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false)

  const handleCopy = () => {
    const contentToCopy =
      typeof formattedContent === 'string'
        ? formattedContent
        : JSON.stringify(formattedContent, null, 2)
    navigator.clipboard.writeText(contentToCopy)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }
  return (
    <>
      {!message.isStreaming && (
        <div className='mt-2 flex items-center gap-2'>
          {!isBase64(message?.content) && (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
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
                <Tooltip.Content side='top' align='center' sideOffset={5}>
                  {isCopied ? 'Copied!' : 'Copy to clipboard'}
                </Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}

          {isBase64(message?.content) && (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    className='text-muted-foreground transition-colors hover:bg-muted'
                    onClick={() => {
                      downloadImage(isBase64(message?.content), message.content)
                    }}
                  >
                    <Download className='h-4 w-4' strokeWidth={2} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content side='top' align='center' sideOffset={5}>
                  Download
                </Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}
        </div>
      )}
    </>
  )
}

/**
 * Renders a chat message with optional file attachments
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const formattedContent = useMemo(() => {
    if (typeof message.content === 'object' && message.content !== null) {
      return JSON.stringify(message.content, null, 2)
    }
    return String(message.content || '')
  }, [message.content])

  const handleAttachmentClick = (attachment: ChatAttachment) => {
    const validDataUrl = attachment.dataUrl?.trim()
    if (validDataUrl?.startsWith('data:')) {
      openImageInNewWindow(validDataUrl, attachment.name)
    }
  }

  if (message.type === 'user') {
    return (
      <div className='w-full max-w-full overflow-hidden opacity-100 transition-opacity duration-200'>
        {message.attachments && message.attachments.length > 0 && (
          <div className='mb-2 flex flex-wrap gap-[6px]'>
            {message.attachments.map((attachment) => {
              const isImage = attachment.type.startsWith('image/')
              const hasValidDataUrl =
                attachment.dataUrl?.trim() && attachment.dataUrl.startsWith('data:')

              return (
                <div
                  key={attachment.id}
                  className={`group relative flex-shrink-0 overflow-hidden rounded-[6px] bg-[var(--surface-2)] ${
                    hasValidDataUrl ? 'cursor-pointer' : ''
                  } ${isImage ? 'h-[40px] w-[40px]' : 'flex min-w-[80px] max-w-[120px] items-center justify-center px-[8px] py-[2px]'}`}
                  onClick={(e) => {
                    if (hasValidDataUrl) {
                      e.preventDefault()
                      e.stopPropagation()
                      handleAttachmentClick(attachment)
                    }
                  }}
                >
                  {isImage && hasValidDataUrl ? (
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className='h-full w-full object-cover'
                    />
                  ) : (
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium text-[10px] text-[var(--white)]'>
                        {attachment.name}
                      </div>
                      {attachment.size && (
                        <div className='text-[9px] text-[var(--text-tertiary)]'>
                          {formatFileSize(attachment.size)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {formattedContent && !formattedContent.startsWith('Uploaded') && (
          <div className='rounded-[4px] border border-[var(--surface-11)] bg-[var(--surface-9)] px-[8px] py-[6px] transition-all duration-200'>
            <div className='whitespace-pre-wrap break-words font-medium font-sans text-gray-100 text-sm leading-[1.25rem]'>
              <WordWrap text={formattedContent} />
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderContent = (content: any) => {
    if (!content) {
      return null
    }
    // if (isBase64(content)) {
    //   return renderBs64Img({ isBase64: true, imageData: message.content })
    // }
    if (formattedContent) {
      return <ArenaCopilotMarkdownRenderer content={formattedContent} />
    }
  }

  return (
    <div className='w-full max-w-full overflow-hidden pl-[2px] opacity-100 transition-opacity duration-200'>
      <div className='whitespace-normal break-words font-[470] font-season text-[#E8E8E8] text-sm leading-[1.25rem]'>
        {/* <WordWrap text={formattedContent} /> */}
        {renderContent(message?.content)}
        {message.isStreaming && <StreamingIndicator />}
      </div>
      <RenderButtons message={message} formattedContent={formattedContent} />
    </div>
  )
}
