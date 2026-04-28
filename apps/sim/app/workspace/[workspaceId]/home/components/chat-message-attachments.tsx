import { getDocumentIcon } from '@/components/icons/document-icons'
import { cn } from '@/lib/core/utils/cn'
import {
  downloadImage,
  ImageWithViewFullOverlay,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/chat/components/chat-message/constants'
import type { ChatMessageAttachment } from '../types'

function FileAttachmentPill(props: { mediaType: string; filename: string }) {
  const Icon = getDocumentIcon(props.mediaType, props.filename)
  return (
    <div className='flex max-w-[140px] items-center gap-[5px] rounded-[10px] bg-[var(--surface-5)] px-[6px] py-[3px]'>
      <Icon className='h-[14px] w-[14px] flex-shrink-0 text-[var(--text-icon)]' />
      <span className='truncate text-[11px] text-[var(--text-body)]'>{props.filename}</span>
    </div>
  )
}

export function ChatMessageAttachments(props: {
  attachments: ChatMessageAttachment[]
  align?: 'start' | 'end'
  className?: string
  onImageSelect?: (attachment: ChatMessageAttachment, index: number) => void
  selectedImageIds?: Set<string>
}) {
  const { attachments, align = 'end', className, onImageSelect, selectedImageIds } = props

  if (!attachments.length) return null

  return (
    <div
      className={cn(
        'flex flex-wrap gap-[6px]',
        align === 'end' ? 'justify-end' : 'justify-start',
        className
      )}
    >
      {attachments.map((att, index) => {
        const isImage = att.media_type.startsWith('image/')
        const isSelected = selectedImageIds?.has(att.id) ?? false
        return isImage && att.previewUrl ? (
          <ImageWithViewFullOverlay
            key={att.id}
            src={att.previewUrl}
            wrapperClassName={
              isSelected
                ? 'h-[120px] w-[120px] overflow-hidden rounded-[8px] border border-[var(--selection)] bg-[var(--surface-5)] ring-1 ring-[var(--selection)] transition-[border-color,box-shadow]'
                : 'h-[120px] w-[120px] overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-5)] transition-[border-color,box-shadow]'
            }
            onDownload={() => downloadImage(false, undefined, att.previewUrl)}
            onSelect={onImageSelect ? () => onImageSelect(att, index) : undefined}
            selectLabel={onImageSelect ? (isSelected ? 'Selected' : 'Select') : undefined}
            compactActions
          >
            <img src={att.previewUrl} alt={att.filename} className='h-full w-full object-cover' />
          </ImageWithViewFullOverlay>
        ) : (
          <FileAttachmentPill key={att.id} mediaType={att.media_type} filename={att.filename} />
        )
      })}
    </div>
  )
}
