import { isUserFileWithMetadata } from '@/lib/core/utils/user-file'

export interface AssistantChatFile {
  id: string
  name: string
  url: string
  key: string
  size: number
  type: string
  context?: string
}

export interface AssistantGeneratedImage {
  id: string
  name: string
  url: string
  type: string
  key?: string
  size?: number
  context?: string
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim())
}

function getDataImageMimeType(value: string): string {
  const match = value.trim().match(/^data:(image\/[a-z0-9.+-]+);base64,/i)
  return match?.[1]?.toLowerCase() ?? 'image/*'
}

function getGeneratedImageId(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return `generated-image:${value.length}:${Math.abs(hash)}`
}

/**
 * Returns whether the value is a renderable image URL we can show in chat.
 */
export function isAssistantImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    (isDataImageUrl(value) ||
      ((value.startsWith('http') || value.startsWith('/api/files/serve/')) &&
        (/\.(png|jpg|jpeg|gif|webp)(\?|#|%|$)/i.test(value.trim()) ||
          value.includes('agent-generated-images'))))
  )
}

/**
 * Converts a UserFile into the assistant chat file shape used by chat UIs.
 */
export function toAssistantChatFile(value: AssistantChatFile): AssistantChatFile {
  return {
    id: value.id,
    name: value.name,
    url: value.url,
    key: value.key,
    size: value.size,
    type: value.type,
    context: value.context,
  }
}

/**
 * Converts a UserFile into a generated image entry when it is an image.
 */
export function toAssistantGeneratedImage(
  value: AssistantChatFile
): AssistantGeneratedImage | undefined {
  if (!value.type.startsWith('image/')) {
    return undefined
  }

  return {
    id: value.id,
    name: value.name,
    url: value.url,
    type: value.type,
    key: value.key,
    size: value.size,
    context: value.context,
  }
}

/**
 * Recursively extracts UserFile values from arbitrary tool output.
 */
export function extractAssistantFilesFromData(
  data: unknown,
  files: AssistantChatFile[] = [],
  seenIds = new Set<string>()
): AssistantChatFile[] {
  if (!data || typeof data !== 'object') {
    return files
  }

  if (isUserFileWithMetadata(data)) {
    if (!seenIds.has(data.id)) {
      seenIds.add(data.id)
      files.push(
        toAssistantChatFile({
          id: data.id,
          name: data.name,
          url: data.url,
          key: data.key,
          size: data.size,
          type: data.type,
          context: data.context,
        })
      )
    }
    return files
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      extractAssistantFilesFromData(item, files, seenIds)
    }
    return files
  }

  for (const value of Object.values(data)) {
    extractAssistantFilesFromData(value, files, seenIds)
  }

  return files
}

/**
 * Recursively extracts image outputs from arbitrary tool output.
 */
export function extractGeneratedImagesFromData(
  data: unknown,
  images: AssistantGeneratedImage[] = [],
  seenUrls = new Set<string>()
): AssistantGeneratedImage[] {
  if (!data) {
    return images
  }

  if (isUserFileWithMetadata(data)) {
    const image = toAssistantGeneratedImage(
      toAssistantChatFile({
        id: data.id,
        name: data.name,
        url: data.url,
        key: data.key,
        size: data.size,
        type: data.type,
        context: data.context,
      })
    )
    if (image && !seenUrls.has(image.url)) {
      seenUrls.add(image.url)
      images.push(image)
    }
    return images
  }

  if (typeof data === 'string') {
    if (isAssistantImageUrl(data) && !seenUrls.has(data)) {
      seenUrls.add(data)
      const type = isDataImageUrl(data) ? getDataImageMimeType(data) : 'image/*'
      images.push({
        id: getGeneratedImageId(data),
        name: 'Generated image',
        url: data,
        type,
      })
    }
    return images
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      extractGeneratedImagesFromData(item, images, seenUrls)
    }
    return images
  }

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (
        (key === 'image' || key === 'url') &&
        isAssistantImageUrl(value) &&
        !seenUrls.has(value)
      ) {
        seenUrls.add(value)
        const type = isDataImageUrl(value) ? getDataImageMimeType(value) : 'image/*'
        images.push({
          id: getGeneratedImageId(value),
          name: key === 'image' ? 'Generated image' : 'Image file',
          url: value,
          type,
        })
        continue
      }

      extractGeneratedImagesFromData(value, images, seenUrls)
    }
  }

  return images
}
