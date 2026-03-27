import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Tooltip } from '@/components/emcn'
import { ChatMessageAttachments } from '@/app/workspace/[workspaceId]/home/components'
import type { ChatMessageAttachment } from '@/app/workspace/[workspaceId]/home/types'
import { useThrottledValue } from '@/hooks/use-throttled-value'
import ArenaCopilotMarkdownRenderer from '../../../panel/components/copilot/components/copilot-message/components/arena-markdown-renderer'
import {
  downloadImage,
  extractAllBase64Images,
  extractBase64Image,
  getImageUrlFromContent,
  hasBase64Images,
  isBase64,
  isRenderableImageUrl,
  mergeToolOutputImageUrls,
  normalizeImageUrlForCompare,
  renderBs64Img,
  resolveMessageImagesAndProse,
  S3UploadFailedAlert,
} from './constants'

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
    attachments?: ChatMessageAttachment[]
  }
}

const MAX_WORD_LENGTH = 25

function StreamingIndicator() {
  return <span className='inline-block h-[14px] w-[6px] animate-pulse bg-current opacity-70' />
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

  const handleDownload = () => {
    const imageUrl = getImageUrlFromContent(message?.content)
    if (imageUrl) {
      downloadImage(false, undefined, imageUrl)
      return
    }
    const base64Images = extractAllBase64Images(message?.content)
    if (base64Images.length > 0) {
      base64Images.forEach((imageData) => {
        downloadImage(true, imageData)
      })
    }
  }

  const containsBase64Images = hasBase64Images(message?.content)
  const hasImageUrl = !!getImageUrlFromContent(message?.content)

  return (
    <>
      {!message.isStreaming && (
        <div className='mt-2 flex items-center gap-2'>
          {!containsBase64Images && !hasImageUrl && (
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

          {/* {(containsBase64Images || hasImageUrl) && (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
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
          )} */}
        </div>
      )}
    </>
  )
}

/**
 * Renders a chat message with optional file attachments
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const rawContent = useMemo(() => {
    if (typeof message.content === 'object' && message.content !== null) {
      return JSON.stringify(message.content, null, 2)
    }
    return String(message.content || '')
  }, [message.content])

  const throttled = useThrottledValue(rawContent)
  const formattedContent = message.type === 'user' ? rawContent : throttled

  if (message.type === 'user') {
    const hasAttachments = message.attachments && message.attachments.length > 0
    return (
      <div className='w-full max-w-full overflow-hidden opacity-100 transition-opacity duration-200'>
        {hasAttachments && (
          <ChatMessageAttachments
            attachments={message.attachments!}
            align='start'
            className='mb-[4px]'
          />
        )}

        {formattedContent && !formattedContent.startsWith('Uploaded') && (
          <div className='rounded-[4px] border border-[var(--border-1)] bg-[var(--surface-5)] px-[8px] py-[6px] transition-all duration-200'>
            <div className='whitespace-pre-wrap break-words font-medium font-sans text-[var(--text-primary)] text-sm leading-[1.25rem]'>
              <WordWrap text={formattedContent} />
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderContent = (content: unknown) => {
    if (!content) {
      return null
    }

    try {
      if (typeof content === 'object' && content !== null) {
        const o = content as Record<string, unknown>
        const imgRaw = typeof o.image === 'string' ? o.image : ''
        const txtRaw = typeof o.content === 'string' ? o.content : ''

        const imageBase64 =
          imgRaw.trim() && isBase64(imgRaw) && !isRenderableImageUrl(imgRaw)
            ? imgRaw.replace(/\s+/g, '')
            : ''

        const { uniqueUrls, prose: proseWithoutUrlLines } = mergeToolOutputImageUrls(imgRaw, txtRaw)
        const proseTrim = proseWithoutUrlLines.trim()
        const txtTrim = txtRaw.trim()

        const showS3 = o.s3UploadFailed === true && (uniqueUrls.length > 0 || Boolean(imageBase64))

        if (uniqueUrls.length > 0 || imageBase64) {
          return (
            <>
              {proseTrim ? <ArenaCopilotMarkdownRenderer content={proseTrim} /> : null}
              {showS3 && <S3UploadFailedAlert />}
              {uniqueUrls.map((url) => (
                <div key={normalizeImageUrlForCompare(url)} className='w-full'>
                  {renderBs64Img({ isBase64: false, imageData: '', imageUrl: url })}
                </div>
              ))}
              {imageBase64 && (
                <div className='w-full'>
                  {renderBs64Img({ isBase64: true, imageData: imageBase64 })}
                </div>
              )}
            </>
          )
        }

        if (txtTrim) {
          return <ArenaCopilotMarkdownRenderer content={txtTrim} />
        }

        return <ArenaCopilotMarkdownRenderer content={JSON.stringify(content, null, 2)} />
      }

      if (typeof content === 'string') {
        const { urls, prose } = resolveMessageImagesAndProse(content)
        if (urls.length > 0) {
          return (
            <>
              {prose ? <ArenaCopilotMarkdownRenderer content={prose} /> : null}
              {urls.map((url) => (
                <div key={normalizeImageUrlForCompare(url)} className='w-full'>
                  {renderBs64Img({ isBase64: false, imageData: '', imageUrl: url })}
                </div>
              ))}
            </>
          )
        }
      }

      if (typeof content === 'string' && isBase64(content)) {
        const cleanedContent = content.replace(/\s+/g, '')
        return renderBs64Img({ isBase64: true, imageData: cleanedContent })
      }

      if (typeof content === 'string') {
        const trimmed = content.trim()
        if (isRenderableImageUrl(trimmed)) {
          return (
            <div className='w-full'>
              {renderBs64Img({ isBase64: false, imageData: '', imageUrl: trimmed })}
            </div>
          )
        }
      }

      if (typeof content === 'string') {
        const { textParts, base64Images } = extractBase64Image(content)

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

        return <ArenaCopilotMarkdownRenderer content={content} />
      }

      return <ArenaCopilotMarkdownRenderer content={String(content)} />
    } catch (error) {
      return (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
          <p className='text-sm'>⚠️ Error displaying content. Please try refreshing the chat.</p>
        </div>
      )
    }
  }

  return (
    <div className='w-full max-w-full overflow-hidden pl-[2px] opacity-100 transition-opacity duration-200'>
      <div className='whitespace-normal break-words font-[470] font-season text-[#E8E8E8] text-sm leading-[1.25rem]'>
        {/* <WordWrap text={formattedContent} /> */}
        {renderContent(message?.content)}
        {message?.isStreaming && <StreamingIndicator />}
      </div>
      <RenderButtons message={message} formattedContent={formattedContent} />
    </div>
  )
}
