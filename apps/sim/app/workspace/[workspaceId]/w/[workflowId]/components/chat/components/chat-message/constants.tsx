// file: utils/isBase64.ts

/**
 * Common base64-encoded image headers
 */
const COMMON_IMAGE_HEADERS = ['iVBORw0KGgo', '/9j/', 'R0lGODlh', 'UklGR'] as const

/**
 * Maximum size for base64 image data (50KB)
 * Large base64 images will be truncated to prevent localStorage quota issues
 */
export const MAX_BASE64_SIZE = 50 * 1024 // 50KB

/**
 * Check if a string is likely base64 image data (simpler check for internal use)
 * @param str - input string to check
 * @returns true if likely base64 image, false otherwise
 */
export function isBase64Image(str: string): boolean {
  if (!str || typeof str !== 'string' || str.length < 50) {
    return false
  }

  const cleanStr = str.replace(/\s+/g, '')
  return COMMON_IMAGE_HEADERS.some((header) => cleanStr.startsWith(header))
}

/**
 * Check if a string is valid Base64 image data
 * @param str - input string to check
 * @returns true if Base64, false otherwise
 */
export function isBase64(str: string | any): boolean {
  if (!str || typeof str !== 'string') {
    return false
  }

  // Remove all whitespace (spaces, newlines, tabs) that might be present in streamed data
  let cleanStr = str.replace(/\s+/g, '')

  if (cleanStr === '') {
    return false
  }

  // Check if it's already a data URL and extract the base64 part
  if (cleanStr.startsWith('data:image')) {
    const base64Part = cleanStr.split(',')[1]
    if (!base64Part) {
      return false
    }
    cleanStr = base64Part
  }

  // Check for common base64-encoded image headers FIRST (before other checks)
  // PNG: iVBORw0KGgo (decodes to PNG header)
  // JPEG: /9j/ (decodes to JPEG header FF D8 FF)
  // GIF: R0lGODlh (decodes to GIF89a header)
  // WebP: UklGR (decodes to RIFF header)
  const matchedHeader = COMMON_IMAGE_HEADERS.find((header) => cleanStr.startsWith(header))

  // If it starts with a known image header, prioritize this check
  if (matchedHeader) {
    // Check if it's reasonably long (at least 50 chars for a valid image)
    if (cleanStr.length < 50) {
      return false
    }

    // Verify it contains only valid base64 characters (A-Z, a-z, 0-9, +, /, =)
    // Be lenient - just check for valid base64 characters, not strict format
    const base64CharRegex = /^[A-Za-z0-9+/=]+$/
    if (base64CharRegex.test(cleanStr)) {
      // If it's long enough and starts with image header, it's likely base64 image
      return true
    }
  }

  // For strings without known headers, do stricter validation
  // Length must be multiple of 4 after cleaning (or with padding)
  const withoutPadding = cleanStr.replace(/=+$/, '')
  if (
    withoutPadding.length % 4 !== 0 &&
    (withoutPadding.length + 1) % 4 !== 0 &&
    (withoutPadding.length + 2) % 4 !== 0
  ) {
    return false
  }

  // Base64 regex (supports padding = or == at the end)
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

  if (!base64Regex.test(cleanStr)) {
    return false
  }

  // For other base64 strings, require at least 100 chars to avoid false positives
  if (cleanStr.length < 100) {
    return false
  }

  return true
}

export const renderBs64Img = ({
  isBase64,
  imageData,
  imageUrl,
}: {
  isBase64: boolean
  imageData: string
  imageUrl?: string
}) => {
  try {
    // Remove all whitespace (spaces, newlines, tabs) from base64 data
    const cleanImageData = typeof imageData === 'string' ? imageData.replace(/\s+/g, '') : ''

    if (!cleanImageData || cleanImageData.length === 0) {
      throw new Error('No image data provided')
    }

    const imageSrc =
      isBase64 && cleanImageData && cleanImageData.length > 0
        ? `data:image/png;base64,${cleanImageData}`
        : imageUrl || ''

    // Validate that we have a valid image source
    if (!imageSrc) {
      throw new Error('No valid image source provided')
    }

    return (
      <div className='my-2 w-full'>
        <img
          src={imageSrc}
          alt='Generated image'
          className='h-auto max-w-full rounded-lg border'
          style={{ maxHeight: '500px', objectFit: 'contain' }}
          onError={(e) => {
            console.error('Image failed to load:', {
              error: e,
              imageSrcLength: imageSrc.length,
              preview: imageSrc.substring(0, 100),
            })
          }}
          onLoad={() => {
            console.log('Image loaded successfully')
          }}
        />
      </div>
    )
  } catch (error) {
    console.error('Error rendering base64 image:', error, {
      imageDataLength: imageData?.length,
      isBase64,
    })

    // Return a fallback error message instead of crashing
    return (
      <div className='my-2 w-full'>
        <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
          <p className='text-sm'>
            ⚠️ Failed to render image. The image data may be corrupted or invalid.
          </p>
        </div>
      </div>
    )
  }
}

export const downloadImage = async (isBase64?: boolean, imageData?: string, imageUrl?: string) => {
  try {
    let blob: Blob
    if (isBase64 && imageData && imageData.length > 0) {
      // Convert base64 to blob
      const byteString = atob(imageData)
      const arrayBuffer = new ArrayBuffer(byteString.length)
      const uint8Array = new Uint8Array(arrayBuffer)
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i)
      }
      blob = new Blob([arrayBuffer], { type: 'image/png' })
    } else if (imageUrl && imageUrl.length > 0) {
      // Use proxy endpoint to fetch image
      const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(imageUrl)}`
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`)
      }
      blob = await response.blob()
    } else {
      throw new Error('No image data or URL provided')
    }

    // Create object URL and trigger download
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `generated-image-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Clean up the URL
    setTimeout(() => URL.revokeObjectURL(url), 100)
  } catch (error) {
    alert('Failed to download image. Please try again later.')
  }
}

/**
 * Extracts base64 image data from mixed content (text + base64)
 * @param content - Content string that may contain text and base64 images
 * @returns Object with textParts and base64Images arrays
 */
export function extractBase64Image(content: string): {
  textParts: string[]
  base64Images: string[]
} {
  if (typeof content !== 'string') {
    return { textParts: [], base64Images: [] }
  }

  const textParts: string[] = []
  const base64Images: string[] = []

  // Split by common separators (newlines, double newlines)
  const parts = content.split(/\n\n+/)

  for (const part of parts) {
    const cleanedPart = part.trim()
    if (!cleanedPart) continue

    // Check if this part is a base64 image
    const cleanStr = cleanedPart.replace(/\s+/g, '')
    const isBase64ImagePart =
      COMMON_IMAGE_HEADERS.some((header) => cleanStr.startsWith(header)) &&
      cleanStr.length >= 50 &&
      /^[A-Za-z0-9+/=]+$/.test(cleanStr)

    if (isBase64ImagePart) {
      base64Images.push(cleanStr)
    } else {
      textParts.push(cleanedPart)
    }
  }

  // If no base64 found in parts, check if the entire content is base64
  if (base64Images.length === 0 && isBase64(content)) {
    const cleanedContent = content.replace(/\s+/g, '')
    base64Images.push(cleanedContent)
    return { textParts: [], base64Images }
  }

  return { textParts, base64Images }
}

/**
 * Checks if content contains base64 images (even in mixed content)
 * @param content - Content to check
 * @returns true if content contains base64 images, false otherwise
 */
export function hasBase64Images(content: any): boolean {
  if (!content) return false

  // Check if pure base64
  if (typeof content === 'string' && isBase64(content)) {
    return true
  }

  // Check for base64 images in mixed content
  if (typeof content === 'string') {
    const parts = content.split(/\n\n+/)

    for (const part of parts) {
      const cleanedPart = part.trim()
      if (!cleanedPart) continue

      const cleanStr = cleanedPart.replace(/\s+/g, '')
      const isBase64ImagePart =
        COMMON_IMAGE_HEADERS.some((header) => cleanStr.startsWith(header)) &&
        cleanStr.length >= 50 &&
        /^[A-Za-z0-9+/=]+$/.test(cleanStr)

      if (isBase64ImagePart) {
        return true
      }
    }
  }

  return false
}

/**
 * Extracts all base64 images from content for downloading
 * @param content - Content that may contain base64 images
 * @returns Array of base64 image strings
 */
export function extractAllBase64Images(content: any): string[] {
  if (!content) return []

  const base64Images: string[] = []

  // If pure base64
  if (typeof content === 'string' && isBase64(content)) {
    const cleanedContent = content.replace(/\s+/g, '')
    base64Images.push(cleanedContent)
    return base64Images
  }

  // Extract from mixed content
  if (typeof content === 'string') {
    const parts = content.split(/\n\n+/)

    for (const part of parts) {
      const cleanedPart = part.trim()
      if (!cleanedPart) continue

      const cleanStr = cleanedPart.replace(/\s+/g, '')
      const isBase64ImagePart =
        COMMON_IMAGE_HEADERS.some((header) => cleanStr.startsWith(header)) &&
        cleanStr.length >= 50 &&
        /^[A-Za-z0-9+/=]+$/.test(cleanStr)

      if (isBase64ImagePart) {
        base64Images.push(cleanStr)
      }
    }
  }

  return base64Images
}

/**
 * Truncates large base64 image data to prevent localStorage quota issues
 * @param data - Data that may contain base64 images
 * @param maxSize - Maximum size in bytes (default: MAX_BASE64_SIZE)
 * @returns Truncated data with placeholders for large base64 images
 */
export function truncateLargeBase64Data(data: any, maxSize: number = MAX_BASE64_SIZE): any {
  if (typeof data === 'string') {
    // If it's a large base64 image, truncate it
    if (isBase64Image(data) && data.length > maxSize) {
      const truncated = data.substring(0, maxSize)
      return `${truncated}...[truncated ${(data.length - maxSize).toLocaleString()} bytes]`
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => truncateLargeBase64Data(item, maxSize))
  }

  if (data && typeof data === 'object') {
    const truncated: any = {}
    for (const [key, value] of Object.entries(data)) {
      truncated[key] = truncateLargeBase64Data(value, maxSize)
    }
    return truncated
  }

  return data
}

/**
 * Interface for chat message with base64 image support
 */
export interface ChatMessageWithBase64 {
  content: string | any
  attachments?: Array<{
    dataUrl?: string
    [key: string]: any
  }>
  [key: string]: any
}

/**
 * Checks if a message contains base64 image data
 * @param message - Message object to check
 * @returns true if message contains base64 images, false otherwise
 */
export function messageContainsBase64Image(message: ChatMessageWithBase64): boolean {
  // Check content
  if (typeof message.content === 'string' && isBase64Image(message.content)) {
    return true
  }

  // Check attachments
  if (message.attachments && Array.isArray(message.attachments)) {
    return message.attachments.some(
      (att) => att.dataUrl && typeof att.dataUrl === 'string' && isBase64Image(att.dataUrl)
    )
  }

  return false
}

/**
 * Sanitizes messages for persistence by replacing base64 image content with placeholders
 * This prevents localStorage quota issues while preserving message structure
 * @param messages - Array of messages to sanitize
 * @returns Array of sanitized messages
 */
export function sanitizeMessagesForPersistence<T extends ChatMessageWithBase64>(
  messages: T[]
): T[] {
  return messages.map((message) => {
    // If message contains base64 image, create a sanitized version without the image data
    if (messageContainsBase64Image(message)) {
      const sanitized = { ...message }

      // Replace base64 image content with a placeholder
      if (typeof sanitized.content === 'string' && isBase64Image(sanitized.content)) {
        sanitized.content = '[Image: Content too large to persist]'
      }

      // Sanitize attachments
      if (sanitized.attachments && Array.isArray(sanitized.attachments)) {
        sanitized.attachments = sanitized.attachments.map((att) => {
          if (att.dataUrl && typeof att.dataUrl === 'string' && isBase64Image(att.dataUrl)) {
            return {
              ...att,
              dataUrl: '[Image: Content too large to persist]',
            }
          }
          return att
        })
      }

      return sanitized
    }

    return message
  })
}
