import { extractGeneratedImagesFromData } from '@/lib/chat/assistant-assets'
import type { ToggleGeneratedImageInput } from '@/lib/chat/generated-image-selection'
import {
  CONVERSATION_IMAGE_REF_SOURCE,
  type ConversationImageRef,
} from '@/lib/image-generation/reference-files'

export interface ConversationImageOption extends ToggleGeneratedImageInput {
  messageId: string
  previewUrl: string
}

interface MessageWithImages {
  id: string
  content?: unknown
  generatedImages?: Array<{
    id: string
    name?: string
    url: string
    type?: string
    key?: string
    size?: number
  }>
  attachments?: Array<{
    id: string
    filename?: string
    media_type?: string
    previewUrl?: string
  }>
}

/**
 * Lists selectable conversation files from workflow or deployed chat messages.
 */
export function listConversationFileOptions(
  messages: MessageWithImages[],
  options?: { mode?: 'images' | 'all' }
): ConversationImageOption[] {
  const mode = options?.mode ?? 'images'
  const fileOptions: ConversationImageOption[] = []
  const seenIds = new Set<string>()

  for (const message of messages) {
    for (const image of message.generatedImages ?? []) {
      if (!image.url || seenIds.has(image.id)) {
        continue
      }
      seenIds.add(image.id)
      fileOptions.push({
        messageId: message.id,
        id: image.id,
        name: image.name || 'Generated image',
        url: image.url,
        type: image.type || 'image/png',
        key: image.key,
        size: image.size,
        previewUrl: image.url,
      })
    }

    for (const image of extractGeneratedImagesFromData(message.content)) {
      if (!image.url || seenIds.has(image.id)) {
        continue
      }
      seenIds.add(image.id)
      fileOptions.push({
        messageId: message.id,
        id: image.id,
        name: image.name || 'Generated image',
        url: image.url,
        type: image.type || 'image/png',
        key: image.key,
        size: image.size,
        previewUrl: image.url,
      })
    }

    for (const attachment of message.attachments ?? []) {
      if (seenIds.has(attachment.id)) {
        continue
      }

      const isImage = Boolean(
        attachment.previewUrl && attachment.media_type?.toLowerCase().startsWith('image/')
      )
      if (mode === 'images' && !isImage) {
        continue
      }
      if (mode === 'all' && !attachment.previewUrl && !attachment.filename) {
        continue
      }

      seenIds.add(attachment.id)
      fileOptions.push({
        messageId: message.id,
        id: attachment.id,
        name: attachment.filename || 'Attachment',
        url: attachment.previewUrl || '',
        type: attachment.media_type || 'application/octet-stream',
        previewUrl: attachment.previewUrl || '',
      })
    }
  }

  return fileOptions
}

/** @deprecated Use {@link listConversationFileOptions} */
export function listConversationImageOptions(
  messages: MessageWithImages[],
  options?: { mode?: 'images' | 'all' }
): ConversationImageOption[] {
  return listConversationFileOptions(messages, options)
}

export function toConversationImageRef(option: ConversationImageOption): ConversationImageRef {
  return {
    source: CONVERSATION_IMAGE_REF_SOURCE,
    id: option.id,
    messageId: option.messageId,
    name: option.name,
    url: option.url,
    type: option.type,
    key: option.key,
    size: option.size,
  }
}

export function getConversationImageRefKey(ref: ConversationImageRef): string {
  return `${CONVERSATION_IMAGE_REF_SOURCE}:${ref.id}`
}
