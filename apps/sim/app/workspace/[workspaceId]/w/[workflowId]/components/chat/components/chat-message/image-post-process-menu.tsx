'use client'

import { useCallback, useState } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { Loader2, MoreHorizontal } from 'lucide-react'
import type { IdeogramPostProcessBody } from '@/lib/api/contracts/tools/ideogram'
import { normalizeImageUrlForCompare } from '@/lib/chat/assistant-assets'
import { POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS } from '@/lib/image-generation/ideogram-post-processor-fields'
import { extractStorageKey, isInternalFileUrl } from '@/lib/uploads/utils/file-utils'
import { useIdeogramPostProcess } from '@/hooks/queries/ideogram-post-process'
import { useChatStore } from '@/stores/chat/store'

const logger = createLogger('ImagePostProcessMenu')

const overlayButtonClass =
  'pointer-events-auto shrink-0 gap-1.5 rounded-md border-white/20 bg-black/40 px-3 py-2 text-white shadow-sm hover:bg-black/55 hover:text-white dark:border-white/20 dark:bg-black/50 dark:hover:bg-black/65'

type PostProcessResult = {
  title: string
  imageUrl?: string
  jsonText?: string
}

interface ImagePostProcessMenuProps {
  /** Stored image URL used as the post-process input. */
  imageUrl: string
  workflowId?: string
  /** Chat message to append result images onto. */
  messageId?: string
  compactActions?: boolean
}

/**
 * Builds generated-image metadata for a post-process result URL.
 */
function buildGeneratedImage(url: string) {
  const trimmed = url.trim()
  const key = isInternalFileUrl(trimmed) ? extractStorageKey(trimmed) : undefined
  return {
    id: `generated-image:${normalizeImageUrlForCompare(trimmed)}`,
    name: 'Generated image',
    url: trimmed,
    type: 'image/png',
    ...(key ? { key, context: 'agent-generated-images' as const } : {}),
  }
}

type PublishChatResult =
  | { ok: true; path: 'append' | 'new-message' }
  | { ok: false; reason: 'missing-message-id' | 'append-failed-no-workflow' | 'missing-workflow-id' }

/**
 * Inserts a post-process result into chat: prefer appending onto the source
 * message, otherwise add a new workflow message so the image is never lost.
 */
function publishResultToChat(params: {
  messageId?: string
  workflowId?: string
  title: string
  imageUrl: string
  operation: string
}): PublishChatResult {
  const { messageId, workflowId, title, imageUrl, operation } = params
  const store = useChatStore.getState()
  const imagePreview = imageUrl.slice(0, 120)

  if (messageId) {
    const appended = store.appendMessageImages(messageId, [imageUrl])
    if (appended) {
      logger.info('Post-process image appended to existing chat message', {
        operation,
        messageId,
        workflowId,
        imagePreview,
      })
      return { ok: true, path: 'append' }
    }
    logger.warn('appendMessageImages returned false; falling back to new chat message', {
      operation,
      messageId,
      workflowId,
      imagePreview,
      messageCount: store.messages.length,
      messageInStore: store.messages.some((message) => message.id === messageId),
    })
  } else {
    logger.warn('Post-process chat publish missing messageId; falling back to new message', {
      operation,
      workflowId,
      imagePreview,
    })
  }

  if (!workflowId) {
    const reason = messageId ? 'append-failed-no-workflow' : 'missing-workflow-id'
    logger.error('Cannot publish post-process result to chat', {
      operation,
      reason,
      messageId,
      imagePreview,
    })
    return { ok: false, reason: messageId ? 'append-failed-no-workflow' : 'missing-workflow-id' }
  }

  store.addMessage({
    content: {
      content: title,
      image: imageUrl,
      images: [imageUrl],
    },
    workflowId,
    type: 'workflow',
    generatedImages: [buildGeneratedImage(imageUrl)],
  })
  logger.info('Post-process image added as new chat message', {
    operation,
    messageId,
    workflowId,
    imagePreview,
  })
  return { ok: true, path: 'new-message' }
}

/**
 * Three-dot menu for Ideogram post-processing actions on a stored image.
 */
export function ImagePostProcessMenu({
  imageUrl,
  workflowId,
  messageId,
  compactActions = false,
}: ImagePostProcessMenuProps) {
  const postProcess = useIdeogramPostProcess()
  const [result, setResult] = useState<PostProcessResult | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const canPostProcess = isInternalFileUrl(imageUrl)

  const run = useCallback(
    async (body: Omit<IdeogramPostProcessBody, 'imageUrl' | 'workflowId'>) => {
      if (!canPostProcess) {
        logger.warn('Post-process blocked: image URL is not an internal file URL', {
          operation: body.operation,
          imagePreview: imageUrl.slice(0, 120),
          messageId,
          workflowId,
        })
        toast.error('Image not available', {
          description: 'Only stored images can be post-processed.',
        })
        return
      }

      logger.info('Starting image post-process', {
        operation: body.operation,
        messageId,
        workflowId,
        hasMessageId: Boolean(messageId),
        hasWorkflowId: Boolean(workflowId),
        imagePreview: imageUrl.slice(0, 120),
        resolution: 'resolution' in body ? body.resolution : undefined,
      })

      setMenuOpen(false)
      try {
        const response = await postProcess.mutateAsync({
          ...body,
          imageUrl,
          ...(workflowId ? { workflowId } : {}),
        })

        if (!response.success || !response.output) {
          logger.error('Post-process API returned unsuccessful response', {
            operation: body.operation,
            messageId,
            workflowId,
            error: response.error,
            hasOutput: Boolean(response.output),
          })
          throw new Error(response.error || 'Post-process failed')
        }

        const output = response.output
        const title =
          IDEOGRAM_POST_PROCESS_TITLES[body.operation] ?? 'Post-process result'

        if (body.operation === 'describe_v4') {
          const jsonText = JSON.stringify(output.jsonPrompt ?? null, null, 2)
          if (workflowId) {
            useChatStore.getState().addMessage({
              content: `${title}\n\n\`\`\`json\n${jsonText}\n\`\`\``,
              workflowId,
              type: 'workflow',
            })
            logger.info('Describe result added as new chat message', {
              operation: body.operation,
              workflowId,
              messageId,
              jsonLength: jsonText.length,
            })
            toast.success(title, { description: 'Description added to chat.' })
            return
          }
          logger.warn('Describe result opened in modal only (no workflowId)', {
            operation: body.operation,
            messageId,
          })
          setResult({ title, jsonText })
          return
        }

        const nextImageUrl =
          (typeof output.baseImageUrl === 'string' && output.baseImageUrl) ||
          (typeof output.imageUrl === 'string' && output.imageUrl) ||
          (Array.isArray(output.imageUrls) && typeof output.imageUrls[0] === 'string'
            ? output.imageUrls[0]
            : undefined) ||
          (typeof output.content === 'string' ? output.content : undefined)

        logger.info('Post-process API succeeded; extracting result image', {
          operation: body.operation,
          messageId,
          workflowId,
          hasBaseImageUrl: typeof output.baseImageUrl === 'string',
          hasImageUrl: typeof output.imageUrl === 'string',
          imageUrlsCount: Array.isArray(output.imageUrls) ? output.imageUrls.length : 0,
          hasContent: typeof output.content === 'string',
          resolvedImagePreview: nextImageUrl?.slice(0, 120),
        })

        if (body.operation === 'layerize_text') {
          if (nextImageUrl) {
            const published = publishResultToChat({
              messageId,
              workflowId,
              title,
              imageUrl: nextImageUrl,
              operation: body.operation,
            })
            if (published.ok) {
              toast.success(title, { description: 'Result added to chat.' })
            } else {
              logger.warn('Layerize chat publish failed; showing modal only', {
                operation: body.operation,
                reason: published.reason,
                messageId,
                workflowId,
              })
            }
          } else {
            logger.warn('Layerize returned no image URL', {
              operation: body.operation,
              messageId,
              workflowId,
            })
          }
          setResult({
            title,
            imageUrl: nextImageUrl,
            jsonText:
              Array.isArray(output.textBlocks) && output.textBlocks.length > 0
                ? JSON.stringify(output.textBlocks, null, 2)
                : undefined,
          })
          return
        }

        if (!nextImageUrl) {
          logger.error('Post-process returned no image URL', {
            operation: body.operation,
            messageId,
            workflowId,
            outputKeys: Object.keys(output),
          })
          throw new Error('No image returned from post-process')
        }

        const published = publishResultToChat({
          messageId,
          workflowId,
          title,
          imageUrl: nextImageUrl,
          operation: body.operation,
        })
        if (published.ok) {
          toast.success(title, { description: 'Result added to chat.' })
          return
        }

        logger.warn('Chat publish failed; falling back to result modal', {
          operation: body.operation,
          reason: published.reason,
          messageId,
          workflowId,
          imagePreview: nextImageUrl.slice(0, 120),
        })
        setResult({ title, imageUrl: nextImageUrl })
      } catch (error) {
        logger.error('Post-process run failed', {
          operation: body.operation,
          messageId,
          workflowId,
          error: getErrorMessage(error, 'Something went wrong'),
        })
        toast.error('Post-process failed', {
          description: getErrorMessage(error, 'Something went wrong'),
        })
      }
    },
    [canPostProcess, imageUrl, messageId, postProcess, workflowId]
  )

  if (!canPostProcess) {
    return null
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className={`${overlayButtonClass} ${compactActions ? 'h-8 w-8 px-0 py-0' : ''}`}
            aria-label='Post-process image'
            title='Post-process image'
            disabled={postProcess.isPending}
          >
            {postProcess.isPending ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <MoreHorizontal className='h-4 w-4' />
            )}
            <span className={compactActions ? 'sr-only' : ''}>More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-[200px]'>
          <DropdownMenuLabel>Post-process</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void run({ operation: 'remove_background' })
            }}
          >
            Remove Background
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void run({ operation: 'upscale' })
            }}
          >
            Upscale
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void run({ operation: 'layerize_text' })
            }}
          >
            Layerize Text
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void run({ operation: 'describe_v4' })
            }}
          >
            Describe
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Reframe</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='min-w-[220px]'>
              {POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => {
                    void run({ operation: 'reframe_v3', resolution: option.id })
                  }}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <ModalContent
          size='full'
          className='flex max-h-[min(92vh,960px)] w-[min(92vw,calc(100vw-1.5rem))] max-w-[min(92vw,1200px)] flex-col overflow-hidden'
        >
          <ModalHeader className='w-full min-w-0 shrink-0'>{result?.title}</ModalHeader>
          <ModalBody className='flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto border-t-0 p-4 pb-6'>
            {result?.imageUrl ? (
              <div className='flex min-h-0 flex-1 items-center justify-center'>
                <img
                  src={result.imageUrl}
                  alt={result.title}
                  className='max-h-[min(60vh,calc(92vh-8rem))] w-auto max-w-full object-contain'
                />
              </div>
            ) : null}
            {result?.jsonText ? (
              <pre className='max-h-[40vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3 text-[var(--text-body)] text-xs'>
                {result.jsonText}
              </pre>
            ) : null}
            {result?.imageUrl ? (
              <div className='flex justify-end gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = result.imageUrl as string
                    link.download = 'post-processed-image.png'
                    link.click()
                  }}
                >
                  Download
                </Button>
              </div>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}

const IDEOGRAM_POST_PROCESS_TITLES: Record<string, string> = {
  remove_background: 'Remove Background',
  upscale: 'Upscale',
  layerize_text: 'Layerize Text',
  describe_v4: 'Describe',
  reframe_v3: 'Reframe',
}
