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
import { getErrorMessage } from '@sim/utils/errors'
import { Loader2, MoreHorizontal } from 'lucide-react'
import type { IdeogramPostProcessBody } from '@/lib/api/contracts/tools/ideogram'
import { POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS } from '@/lib/image-generation/ideogram-post-processor-fields'
import { isInternalFileUrl } from '@/lib/uploads/utils/file-utils'
import { useIdeogramPostProcess } from '@/hooks/queries/ideogram-post-process'
import { useChatStore } from '@/stores/chat/store'

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
 * Three-dot menu for Ideogram post-processing actions on a stored image.
 */
export function ImagePostProcessMenu({
  imageUrl,
  workflowId,
  messageId,
  compactActions = false,
}: ImagePostProcessMenuProps) {
  const postProcess = useIdeogramPostProcess()
  const appendMessageImages = useChatStore((state) => state.appendMessageImages)
  const [result, setResult] = useState<PostProcessResult | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const canPostProcess = isInternalFileUrl(imageUrl)

  const run = useCallback(
    async (body: Omit<IdeogramPostProcessBody, 'imageUrl' | 'workflowId'>) => {
      if (!canPostProcess) {
        toast.error('Image not available', {
          description: 'Only stored images can be post-processed.',
        })
        return
      }

      setMenuOpen(false)
      try {
        const response = await postProcess.mutateAsync({
          ...body,
          imageUrl,
          ...(workflowId ? { workflowId } : {}),
        })

        if (!response.success || !response.output) {
          throw new Error(response.error || 'Post-process failed')
        }

        const output = response.output
        const title =
          IDEOGRAM_POST_PROCESS_TITLES[body.operation] ?? 'Post-process result'

        if (body.operation === 'describe_v4') {
          setResult({
            title,
            jsonText: JSON.stringify(output.jsonPrompt ?? null, null, 2),
          })
          return
        }

        const nextImageUrl =
          (typeof output.baseImageUrl === 'string' && output.baseImageUrl) ||
          (typeof output.imageUrl === 'string' && output.imageUrl) ||
          (Array.isArray(output.imageUrls) && typeof output.imageUrls[0] === 'string'
            ? output.imageUrls[0]
            : undefined) ||
          (typeof output.content === 'string' ? output.content : undefined)

        if (body.operation === 'layerize_text') {
          if (nextImageUrl && messageId) {
            appendMessageImages(messageId, [nextImageUrl])
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
          throw new Error('No image returned from post-process')
        }

        if (messageId) {
          appendMessageImages(messageId, [nextImageUrl])
          toast.success(title, { description: 'Result added to this chat message.' })
          return
        }

        setResult({ title, imageUrl: nextImageUrl })
      } catch (error) {
        toast.error('Post-process failed', {
          description: getErrorMessage(error, 'Something went wrong'),
        })
      }
    },
    [appendMessageImages, canPostProcess, imageUrl, messageId, postProcess, workflowId]
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
