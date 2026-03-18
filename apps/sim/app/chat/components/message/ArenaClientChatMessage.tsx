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
import { KnowledgeResultsModal } from '@/app/chat/components/message/components/knowledge-results-modal'
import type { KnowledgeRef, KnowledgeResultChunk } from '@/app/chat/components/message/message'
// import MarkdownRenderer from './components/markdown-renderer'
// import { toastError, toastSuccess } from '@/components/ui'
import { createLogger } from '@sim/logger'
import {
  downloadImage,
  mergeToolOutputImageUrls,
  extractAllBase64Images,
  extractBase64Image,
  getImageUrlFromContent,
  hasBase64Images,
  isBase64,
  isRenderableImageUrl,
  normalizeImageUrlForCompare,
  renderBs64Img,
  resolveMessageImagesAndProse,
  S3UploadFailedAlert,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'
import { FeedbackBox } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/feedback-box'
import ArenaCopilotMarkdownRenderer from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/arena-markdown-renderer'
import { StreamingIndicator } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/copilot-message/components/smooth-streaming'

const arenaChatMessageLogger = createLogger('ArenaClientChatMessage')

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
  knowledgeRefs?: KnowledgeRef[]
}

// function EnhancedMarkdownRenderer({ content }: { content: string }) {
//   return (
//     <TooltipProvider>
//       <MarkdownRenderer content={content} />
//     </TooltipProvider>
//   )
// }

/**
 * Returns true if the content looks like a GFM markdown table (has a separator line of dashes/colons between pipes).
 * When true, we skip pipe-segment split so the table renders correctly.
 */
function isLikelyMarkdownTable(str: string): boolean {
  const lines = str.trim().split(/\r?\n/)
  if (lines.length < 2) return false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cells.length === 0) continue
    const onlySeparatorChars = new RegExp('^[' + '\\-' + ':' + '\\s' + ']+$')
    const isSeparatorLine = cells.every((cell) => onlySeparatorChars.test(cell) && cell.length > 0)
    if (isSeparatorLine) return true
  }
  return false
}

/**
 * Returns true if the content contains a fenced code block (```).
 * When true, we skip pipe-segment split so code blocks and any pipes inside them are preserved.
 */
function hasFencedCodeBlock(str: string): boolean {
  return /```/.test(str)
}

/** Total character length of a node's text content (recursive). */
function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0
  let len = 0
  for (let i = 0; i < node.childNodes.length; i++) {
    len += getNodeTextLength(node.childNodes[i])
  }
  return len
}

/**
 * Returns the character offset of (targetNode, targetOffset) within container's text content.
 * Walks container's subtree in document order. For a text node, targetOffset is a character index;
 * for an element node (e.g. container or button), Range API gives child index, so we sum preceding siblings' text lengths.
 */
function getCharacterOffset(
  container: Node,
  targetNode: Node,
  targetOffset: number
): number {
  let offset = 0
  function walk(node: Node): boolean {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += targetOffset
      } else {
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          offset += getNodeTextLength(node.childNodes[i])
        }
      }
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent?.length ?? 0)
      return false
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true
    }
    return false
  }
  walk(container)
  return offset
}

/**
 * Detects a pipe-delimited segment at the given offset in the line:
 * look backward for a pipe (stop at newline/start), then forward for a pipe (stop at newline/end).
 * Returns { start, end, text } for the segment between the two pipes, or null.
 */
function getPipeSegmentAtOffset(line: string, offset: number): { start: number; end: number; text: string } | null {
  if (offset < 0 || offset > line.length) return null
  let pipeBefore = -1
  for (let i = offset - 1; i >= 0; i--) {
    if (line[i] === '\n') break
    if (line[i] === '|') {
      pipeBefore = i
      break
    }
  }
  if (pipeBefore < 0) return null
  let pipeAfter = -1
  for (let i = offset; i < line.length; i++) {
    if (line[i] === '\n') break
    if (line[i] === '|') {
      pipeAfter = i
      break
    }
  }
  if (pipeAfter < 0 || pipeAfter <= pipeBefore) return null
  const text = line.slice(pipeBefore + 1, pipeAfter).trim()
  if (!text) return null
  return { start: pipeBefore + 1, end: pipeAfter, text }
}

interface LineWithPipeHoverProps {
  line: string
  onCopySegment: (text: string) => void
}

function LineWithPipeHover({ line, onCopySegment }: LineWithPipeHoverProps) {
  const [hovered, setHovered] = useState<{ start: number; end: number; text: string } | null>(null)
  const lineRef = useRef<HTMLSpanElement>(null)

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = lineRef.current
      if (!container) return
      const doc = container.ownerDocument
      const range =
        doc.caretRangeFromPoint?.(e.clientX, e.clientY) ??
        (() => {
          const pos = (doc as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(e.clientX, e.clientY)
          if (!pos) return null
          return { startContainer: pos.offsetNode, startOffset: pos.offset }
        })()
      if (!range || !container.contains(range.startContainer)) {
        setHovered(null)
        return
      }
      const offset = getCharacterOffset(container, range.startContainer, range.startOffset)
      if (offset < 0 || offset > line.length) {
        setHovered(null)
        return
      }
      const segment = getPipeSegmentAtOffset(line, offset)
      setHovered(segment)
    },
    [line]
  )

  const onMouseLeave = useCallback(() => setHovered(null), [])

  const handleCopy = useCallback(
    (text: string) => {
      onCopySegment(text)
    },
    [onCopySegment]
  )

  if (hovered) {
    return (
      <span
        ref={lineRef}
        className='whitespace-pre-wrap'
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {line.slice(0, hovered.start)}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type='button'
                onClick={() => handleCopy(hovered.text)}
                className='cursor-pointer rounded px-0.5 py-0 text-inherit no-underline transition-colors hover:underline hover:decoration-2 hover:decoration-gray-400 hover:underline-offset-2'
              >
                {line.slice(hovered.start, hovered.end)}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side='top'>Click to copy</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        {line.slice(hovered.end)}
      </span>
    )
  }

  return (
    <span
      ref={lineRef}
      className='whitespace-pre-wrap'
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {line}
    </span>
  )
}

export const ArenaClientChatMessage = memo(
  function ArenaClientChatMessage({
    message,
    setMessages,
    workspaceIdsForKbLinks,
    onCopySegmentToInput,
  }: {
    message: ChatMessage
    setMessages?: Dispatch<SetStateAction<ChatMessage[]>>
    /** When set, show "View in Knowledge Base" link for refs whose workspaceId is in this list */
    workspaceIdsForKbLinks?: string[]
    /** When set, text between pipes (| text |) is clickable and copies to chat input */
    onCopySegmentToInput?: (text: string) => void
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

    /** Renders string content. When onCopySegmentToInput is set and content has pipes (and is not a table/code block), renders line-by-line: on hover we look backward for a pipe and forward for a pipe (stop at newline); if both exist the text between is copyable. No extra pipes are rendered. */
    const renderStringContent = useCallback(
      (str: string) => {
        if (!onCopySegmentToInput || !str.includes('|')) {
          return <ArenaCopilotMarkdownRenderer content={str} />
        }
        if (isLikelyMarkdownTable(str) || hasFencedCodeBlock(str)) {
          return <ArenaCopilotMarkdownRenderer content={str} />
        }
        const lines = str.split(/\r?\n/)
        return (
          <span className='whitespace-pre-wrap'>
            {lines.map((line, i) => (
              <span key={i}>
                {i > 0 && '\n'}
                {line.includes('|') ? (
                  <LineWithPipeHover line={line} onCopySegment={onCopySegmentToInput} />
                ) : (
                  <ArenaCopilotMarkdownRenderer content={line} />
                )}
              </span>
            ))}
          </span>
        )
      },
      [onCopySegmentToInput]
    )

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

          const { uniqueUrls, prose: proseWithoutUrlLines } = mergeToolOutputImageUrls(
            imgRaw,
            txtRaw
          )
          const proseTrim = proseWithoutUrlLines.trim()
          const txtTrim = txtRaw.trim()

          const showS3 =
            o.s3UploadFailed === true && (uniqueUrls.length > 0 || Boolean(imageBase64))

          if (uniqueUrls.length > 0 || imageBase64) {
            return (
              <>
                {proseTrim ? renderStringContent(proseTrim) : null}
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
            return renderStringContent(txtTrim)
          }

          return (
            <ArenaCopilotMarkdownRenderer
              content={JSON.stringify(content, null, 2)}
            />
          )
        }

        if (typeof content === 'string') {
          const { urls, prose } = resolveMessageImagesAndProse(content)
          if (urls.length > 0) {
            return (
              <>
                {prose ? renderStringContent(prose) : null}
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
                {textParts.length > 0 && renderStringContent(textParts.join('\n\n'))}
                {base64Images.map((imageData, index) => (
                  <div key={index}>{renderBs64Img({ isBase64: true, imageData })}</div>
                ))}
              </>
            )
          }

          return renderStringContent(content)
        }

        return <ArenaCopilotMarkdownRenderer content={String(content)} />
      } catch (error) {
        arenaChatMessageLogger.error('Error rendering message content', { error })
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
      const imageUrl = getImageUrlFromContent(cleanTextContent)
      if (imageUrl) {
        downloadImage(false, undefined, imageUrl)
        return
      }
      const base64Images = extractAllBase64Images(cleanTextContent)
      if (base64Images.length > 0) {
        base64Images.forEach((imageData) => {
          downloadImage(true, imageData)
        })
      }
    }

    const containsBase64Images = hasBase64Images(cleanTextContent)
    const hasImageUrl = !!getImageUrlFromContent(cleanTextContent)

    const [knowledgeModalDoc, setKnowledgeModalDoc] = useState<{
      documentName: string
      chunks: KnowledgeResultChunk[]
      viewInKbUrl?: string
    } | null>(null)

    /** Build KB chunk URL from KnowledgeRef (history). */
    const getKbLinkUrlFromRef = useCallback((ref: KnowledgeRef): string => {
      const params = new URLSearchParams()
      params.set('chunk', ref.chunkId)
      if (typeof ref.chunkIndex === 'number') {
        params.set('chunkIndex', String(ref.chunkIndex))
      }
      return `/workspace/${ref.workspaceId}/knowledge/${ref.knowledgeBaseId}/${ref.documentId}?${params.toString()}`
    }, [])

    /** One ref per chunk: from live (knowledgeResults) or history (knowledgeRefs). */
    const uniqueChunkRefs = useMemo(() => {
      type ChunkRefItem = {
        key: string
        documentId: string
        documentName: string
        chunkIndex: number
        chunks?: KnowledgeResultChunk[]
        linkUrl: string | null
        workspaceId: string | null
        knowledgeBaseId?: string
        fromHistory: boolean
      }
      const results = message.knowledgeResults ?? []
      const refsFromHistory = message.knowledgeRefs ?? []

      if (results.length > 0) {
        const seen = new Set<string>()
        return results
          .filter((r) => {
            const kb = r.knowledgeBaseId ?? ''
            const key = `${kb}-${r.documentId}-${r.chunkId ?? `i-${r.chunkIndex}`}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((r) => {
            const linkUrl =
              r.chunkId && r.knowledgeBaseId && r.workspaceId != null
                ? (() => {
                    const params = new URLSearchParams()
                    params.set('chunk', r.chunkId)
                    params.set('chunkIndex', String(r.chunkIndex))
                    return `/workspace/${r.workspaceId}/knowledge/${r.knowledgeBaseId}/${r.documentId}?${params.toString()}`
                  })()
                : null
            return {
              key: `${r.knowledgeBaseId ?? ''}-${r.documentId}-${r.chunkId ?? r.chunkIndex}`,
              documentId: r.documentId,
              documentName: r.documentName || r.documentId,
              chunkIndex: r.chunkIndex,
              chunks: [r],
              linkUrl,
              workspaceId: r.workspaceId ?? null,
              knowledgeBaseId: r.knowledgeBaseId,
              fromHistory: false,
            }
          })
      }

      if (refsFromHistory.length > 0) {
        return refsFromHistory.map((r) => ({
          key: `${r.knowledgeBaseId}-${r.documentId}-${r.chunkId}`,
          documentId: r.documentId,
          documentName: r.documentName || r.documentId,
          chunkIndex: typeof r.chunkIndex === 'number' ? r.chunkIndex : 0,
          chunks: undefined as KnowledgeResultChunk[] | undefined,
          linkUrl: r.workspaceId ? getKbLinkUrlFromRef(r) : null,
          workspaceId: r.workspaceId,
          knowledgeBaseId: r.knowledgeBaseId,
          fromHistory: true,
        }))
      }

      return []
    }, [message.knowledgeResults, message.knowledgeRefs, getKbLinkUrlFromRef])

    const canShowKbLink = (ref: { linkUrl: string | null; workspaceId: string | null }) => {
      if (!ref.linkUrl || !workspaceIdsForKbLinks?.length) return false
      return ref.workspaceId !== null && workspaceIdsForKbLinks.includes(ref.workspaceId)
    }

    /** Only refs the user can open (has workspace access). Chat-only users see no references. */
    const visibleChunkRefs = useMemo(() => {
      if (!workspaceIdsForKbLinks?.length) return []
      return uniqueChunkRefs.filter((ref) => canShowKbLink(ref))
    }, [uniqueChunkRefs, workspaceIdsForKbLinks])

    /** Refs grouped by document (per knowledge base when multiple KBs): document name once, then sorted chunk indices. */
    const refsGroupedByDocument = useMemo(() => {
      const groupKey = (ref: (typeof visibleChunkRefs)[0]) =>
        `${ref.knowledgeBaseId ?? ''}-${ref.documentId}`
      const byDoc = new Map<string, { documentName: string; chunks: typeof visibleChunkRefs }>()
      for (const ref of visibleChunkRefs) {
        const key = groupKey(ref)
        const existing = byDoc.get(key)
        if (existing) {
          existing.chunks.push(ref)
        } else {
          byDoc.set(key, { documentName: ref.documentName, chunks: [ref] })
        }
      }
      return Array.from(byDoc.entries()).map(([documentId, { documentName, chunks }]) => ({
        documentId,
        documentName,
        chunks: [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex),
      }))
    }, [visibleChunkRefs])

    /** Hide during streaming; show only when done and user has access to at least one ref (streaming + history). */
    const showReferencesSection = !message.isStreaming && visibleChunkRefs.length > 0

    const openKnowledgeModal = useCallback(
      (documentName: string, chunks: KnowledgeResultChunk[], viewInKbUrl?: string) => {
        setKnowledgeModalDoc({ documentName, chunks, viewInKbUrl })
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
            {message.type === 'assistant' && message.isStreaming && (
              <div className='mt-2 flex items-center gap-2 text-muted-foreground text-sm'>
                <div className='flex gap-1' aria-hidden>
                  <span
                    className='h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400'
                    style={{ animationDuration: '1s', animationDelay: '0ms' }}
                  />
                  <span
                    className='h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400'
                    style={{ animationDuration: '1s', animationDelay: '150ms' }}
                  />
                  <span
                    className='h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 dark:bg-gray-400'
                    style={{ animationDuration: '1s', animationDelay: '300ms' }}
                  />
                </div>
                <span className='font-medium'>Fetching references...</span>
              </div>
            )}
            {showReferencesSection && (
              <div className='mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm'>
                <span className='text-gray-500 dark:text-gray-400'>References:</span>
                {refsGroupedByDocument.map((group, groupIndex) => {
                  const docChunks = group.chunks.flatMap((r) => r.chunks ?? [])
                  const hasModalChunks = docChunks.length > 0
                  return (
                    <span
                      key={group.documentId}
                      className='inline-flex flex-wrap items-center gap-x-0.5 gap-y-0.5'
                    >
                      {groupIndex > 0 && (
                        <span className='text-gray-400 dark:text-gray-500'>,</span>
                      )}
                      {hasModalChunks ? (
                        <button
                          type='button'
                          className='cursor-pointer rounded px-1 py-0.5 text-primary underline decoration-primary/50 underline-offset-2 transition-colors hover:bg-gray-100 hover:decoration-primary dark:hover:bg-gray-800'
                          onClick={() =>
                            openKnowledgeModal(
                              group.documentName,
                              docChunks,
                              group.chunks[0]?.linkUrl ?? undefined
                            )
                          }
                        >
                          {group.documentName}
                        </button>
                      ) : (
                        <span className='rounded px-1 py-0.5 text-[var(--text-primary)]'>
                          {group.documentName}
                        </span>
                      )}
                      {group.chunks.map((ref) =>
                        ref.linkUrl ? (
                          <a
                            key={ref.key}
                            href={ref.linkUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='cursor-pointer rounded px-1 py-0.5 text-primary underline decoration-primary/50 underline-offset-2 transition-colors hover:bg-gray-100 hover:decoration-primary dark:hover:bg-gray-800'
                            aria-label={`Open chunk ${ref.chunkIndex} of ${group.documentName} in Knowledge Base`}
                          >
                            #{ref.chunkIndex}
                          </a>
                        ) : null
                      )}
                    </span>
                  )
                })}
              </div>
            )}
            {knowledgeModalDoc && (
              <KnowledgeResultsModal
                isOpen={!!knowledgeModalDoc}
                onClose={() => setKnowledgeModalDoc(null)}
                documentName={knowledgeModalDoc.documentName}
                chunks={knowledgeModalDoc.chunks}
                viewInKbUrl={knowledgeModalDoc.viewInKbUrl}
              />
            )}
            {message.type === 'assistant' &&
              !message.isStreaming &&
              !message.isInitialMessage &&
              hasRenderableText && (
                <div className='flex items-center justify-start space-x-2'>
                  {!isJsonObject && hasRenderableText && !hasImageUrl && (
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
                  {(containsBase64Images || hasImageUrl) && (
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
      prevProps.message.knowledgeResults?.length === nextProps.message.knowledgeResults?.length &&
      prevProps.message.knowledgeRefs?.length === nextProps.message.knowledgeRefs?.length &&
      prevProps.workspaceIdsForKbLinks?.length === nextProps.workspaceIdsForKbLinks?.length &&
      prevProps.onCopySegmentToInput === nextProps.onCopySegmentToInput
    )
  }
)
