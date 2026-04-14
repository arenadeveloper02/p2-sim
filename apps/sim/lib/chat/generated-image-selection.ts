import type { AssistantGeneratedImage } from '@/lib/chat/assistant-assets'

export interface SelectedGeneratedImage extends AssistantGeneratedImage {
  messageId: string
}

export interface MaterializedSelectedGeneratedImage {
  id: string
  name: string
  size: number
  type: string
  file: File
  dataUrl: string
}

interface MessageWithGeneratedImages {
  id: string
  generatedImages?: AssistantGeneratedImage[]
}

export interface ToggleGeneratedImageInput {
  id: string
  name: string
  url: string
  type: string
}

/**
 * Normalizes reusable image URLs onto the current app origin so previously generated
 * `/api/files/serve/...` links keep working even when the saved URL points at localhost.
 */
function getReusableImageFetchUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    return trimmed
  }

  try {
    if (trimmed.startsWith('/api/files/serve/')) {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}${trimmed}`
      }
      return trimmed
    }

    if (!trimmed.startsWith('http')) {
      return trimmed
    }

    const parsed = new URL(trimmed)

    if (parsed.pathname.startsWith('/api/files/serve/')) {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`
      }
      return `${parsed.pathname}${parsed.search}`
    }

    if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
      return `/api/files/proxy-image?url=${encodeURIComponent(trimmed)}`
    }

    return trimmed
  } catch {
    return trimmed
  }
}

export function toSelectedGeneratedImage(
  messageId: string,
  image: ToggleGeneratedImageInput
): SelectedGeneratedImage {
  return {
    ...image,
    messageId,
  }
}

/**
 * Returns the most recent generated image in a message list.
 */
export function getLatestGeneratedImage(
  messages: MessageWithGeneratedImages[]
): SelectedGeneratedImage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const lastImage = message.generatedImages?.[message.generatedImages.length - 1]
    if (lastImage) {
      return {
        ...lastImage,
        messageId: message.id,
      }
    }
  }

  return undefined
}

/**
 * Converts a generated image URL back into a File-like object so it can reuse the
 * existing chat upload pipelines.
 */
export async function materializeSelectedGeneratedImage(
  image: SelectedGeneratedImage
): Promise<MaterializedSelectedGeneratedImage> {
  const response = await fetch(getReusableImageFetchUrl(image.url), { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`Failed to load selected image: ${response.status} ${response.statusText}`)
  }

  const blob = await response.blob()
  const type = blob.type || image.type || 'image/png'
  const extension = type.split('/')[1] || 'png'
  const name = image.name?.trim() || `generated-image.${extension}`
  const file = new File([blob], name, { type })
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read selected image'))
    reader.readAsDataURL(file)
  })

  return {
    id: image.id,
    name,
    size: file.size,
    type,
    file,
    dataUrl,
  }
}
