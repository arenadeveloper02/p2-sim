// file: utils/isBase64.ts

import { useEffect, useState } from 'react'

/**
 * Common base64-encoded image headers
 */
const COMMON_IMAGE_HEADERS = ['iVBORw0KGgo', '/9j/', 'R0lGODlh', 'UklGR'] as const

/**
 * Base64 length above which we use Blob URL instead of data URL to avoid
 * browser limits (~2MB) and DOM issues with 2K/4K images.
 */
const BLOB_URL_BASE64_LENGTH_THRESHOLD = 500 * 1024 // 500KB chars ≈ 375KB binary

/**
 * Base64 length above which we do not attempt to decode (risk of freeze/OOM).
 * ~8MB base64 ≈ 6MB binary; we show a message and suggest lower resolution.
 */
const MAX_BASE64_DISPLAY_LENGTH = 8 * 1024 * 1024 // 8MB chars

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

function getMimeFromBase64(cleanBase64: string): string {
  if (cleanBase64.startsWith('/9j/')) return 'image/jpeg'
  if (cleanBase64.startsWith('R0lGODlh')) return 'image/gif'
  if (cleanBase64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

/**
 * Renders large base64 images via Blob URL to avoid data URL length limits
 * (browsers often fail with data URLs > ~2MB; 2K/4K images exceed this).
 * Decoding is deferred so "Loading image…" shows and the UI stays responsive.
 * Images over MAX_BASE64_DISPLAY_LENGTH (8MB base64) are not decoded to avoid freeze/OOM.
 */
function Base64ImageWithBlobUrl({ cleanImageData }: { cleanImageData: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cleanImageData.length > MAX_BASE64_DISPLAY_LENGTH) {
      const mb = (cleanImageData.length / (1024 * 1024)).toFixed(1)
      setError(
        `Image too large to display in browser (${mb} MB base64). please download the image to view it.`
      )
      return
    }

    let url: string | null = null
    let cancelled = false

    const decodeAndCreateUrl = () => {
      try {
        const binaryString = atob(cleanImageData)
        if (cancelled) return
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        if (cancelled) return
        const mime = getMimeFromBase64(cleanImageData)
        const blob = new Blob([bytes], { type: mime })
        url = URL.createObjectURL(blob)
        if (!cancelled) {
          setObjectUrl(url)
          setError(null)
        } else if (url) {
          URL.revokeObjectURL(url)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to decode image')
        }
      }
    }

    const timeoutId = setTimeout(decodeAndCreateUrl, 0)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      if (url) URL.revokeObjectURL(url)
    }
  }, [cleanImageData])

  if (error) {
    return (
      <div className='my-2 w-full'>
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'>
          <p className='text-sm'>⚠️ {error}</p>
        </div>
      </div>
    )
  }

  if (!objectUrl) {
    return (
      <div className='my-2 flex h-[200px] w-full items-center justify-center rounded-lg border bg-[var(--surface-5)]'>
        <span className='text-muted-foreground text-sm'>Loading image…</span>
      </div>
    )
  }

  return (
    <div className='my-2 w-full'>
      <img
        src={objectUrl}
        alt='Generated image'
        className='h-auto max-w-full rounded-lg border'
        style={{ maxHeight: '500px', objectFit: 'contain' }}
        onError={(e) => {
          console.error('Image failed to load (blob URL)', { error: e })
        }}
      />
    </div>
  )
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
    const cleanImageData = typeof imageData === 'string' ? imageData.replace(/\s+/g, '') : ''

    if (!cleanImageData || cleanImageData.length === 0) {
      throw new Error('No image data provided')
    }

    if (
      isBase64 &&
      cleanImageData.length > BLOB_URL_BASE64_LENGTH_THRESHOLD
    ) {
      return (
        <div className='my-2 w-full'>
          <Base64ImageWithBlobUrl cleanImageData={cleanImageData} />
        </div>
      )
    }

    const imageSrc =
      isBase64 && cleanImageData.length > 0
        ? `data:image/${getMimeFromBase64(cleanImageData).replace('image/', '')};base64,${cleanImageData}`
        : imageUrl || ''

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
        />
      </div>
    )
  } catch (error) {
    console.error('Error rendering base64 image:', error, {
      imageDataLength: imageData?.length,
      isBase64,
    })

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
/** Length above which we treat content as single base64 image without heavy regex (avoids O(n) on multi-MB strings). */
const LARGE_PURE_BASE64_LENGTH = 100 * 1024 // 100KB

export function extractBase64Image(content: string): {
  textParts: string[]
  base64Images: string[]
} {
  if (typeof content !== 'string') {
    return { textParts: [], base64Images: [] }
  }

  const cleanedContent = content.replace(/\s+/g, '')
  if (cleanedContent.length > LARGE_PURE_BASE64_LENGTH) {
    const startsWithImageHeader = COMMON_IMAGE_HEADERS.some((h) => cleanedContent.startsWith(h))
    if (startsWithImageHeader) {
      return { textParts: [], base64Images: [cleanedContent] }
    }
  }

  const textParts: string[] = []
  const base64Images: string[] = []

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
      // Check if cleanedPart contains base64 strings anywhere within it
      let cleanText = cleanedPart

      // Find and remove base64 strings that start with image headers
      // They might be inline like "image: iVBORw0KGgo..." or on separate lines
      for (const header of COMMON_IMAGE_HEADERS) {
        // Find the position of the header in the text
        const headerIndex = cleanText.indexOf(header)

        if (headerIndex !== -1) {
          // Found a potential base64 string starting with this header
          // Extract everything from the header onwards that looks like base64
          let base64Start = headerIndex

          // Look backwards to see if there's "image:" or similar prefix to remove
          const beforeHeader = cleanText.substring(0, base64Start)
          const imagePrefixMatch = beforeHeader.match(/(?:^|\s)(image\s*:?\s*)$/i)
          if (imagePrefixMatch) {
            base64Start = base64Start - imagePrefixMatch[1].length
          }

          // Extract the base64 string (everything from base64Start that's base64-like)
          let base64End = base64Start
          const textFromStart = cleanText.substring(base64Start)

          // Match base64 characters (including spaces/newlines that might be in the string)
          const base64Match = textFromStart.match(/^[^A-Za-z0-9+/=\s]*([A-Za-z0-9+/=\s]{50,})/)

          if (base64Match) {
            const base64WithSpaces = base64Match[1]
            const base64String = base64WithSpaces.replace(/\s+/g, '')

            // Verify it starts with the header and is valid base64
            if (
              base64String.startsWith(header) &&
              /^[A-Za-z0-9+/=]+$/.test(base64String) &&
              base64String.length >= 50
            ) {
              // Calculate the end position
              base64End = base64Start + base64Match[0].length

              // Remove the base64 string from the text
              const beforeBase64 = cleanText.substring(0, base64Start).trim()
              const afterBase64 = cleanText.substring(base64End).trim()

              // Reconstruct text without base64
              cleanText = [beforeBase64, afterBase64].filter(Boolean).join(' ').trim()

              // Add to base64Images if not already there
              if (!base64Images.includes(base64String)) {
                base64Images.push(base64String)
              }
            }
          }
        }
      }

      // Also check line by line for base64 strings (as fallback)
      const lines = cleanText.split(/\n/)
      const cleanLines: string[] = []

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) {
          cleanLines.push(line)
          continue
        }

        // Check if this entire line is a base64 string
        const cleanLineStr = trimmedLine.replace(/\s+/g, '')
        const isBase64Line =
          COMMON_IMAGE_HEADERS.some((header) => cleanLineStr.startsWith(header)) &&
          cleanLineStr.length >= 50 &&
          /^[A-Za-z0-9+/=]+$/.test(cleanLineStr)

        if (isBase64Line) {
          // Extract base64 and don't include in text
          if (!base64Images.includes(cleanLineStr)) {
            base64Images.push(cleanLineStr)
          }
        } else {
          // Keep the line
          cleanLines.push(line)
        }
      }

      // Only push to textParts if there's actual text remaining
      const finalCleanText = cleanLines.join('\n').trim()
      if (finalCleanText) {
        textParts.push(finalCleanText)
      }
    }
  }

  // If no base64 found in parts, check if the entire content is base64
  if (base64Images.length === 0 && hasBase64Images(content)) {
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
 * Removes base64 strings from content and replaces with placeholder
 * @param content - Content that may contain base64 strings
 * @returns Content with base64 strings replaced by placeholder
 */
function removeBase64FromContent(content: string): string {
  if (!content || typeof content !== 'string') return content

  let cleanContent = content

  // Find and remove base64 strings that start with image headers
  for (const header of COMMON_IMAGE_HEADERS) {
    // Find the position of the header in the text
    let headerIndex = cleanContent.indexOf(header)

    while (headerIndex !== -1) {
      // Found a potential base64 string starting with this header
      let base64Start = headerIndex

      // Look backwards to see if there's "image:" or similar prefix to remove
      const beforeHeader = cleanContent.substring(0, base64Start)
      const imagePrefixMatch = beforeHeader.match(/(?:^|\s)(image\s*:?\s*)$/i)
      if (imagePrefixMatch) {
        base64Start = base64Start - imagePrefixMatch[1].length
      }

      // Extract the base64 string (everything from base64Start that's base64-like)
      const textFromStart = cleanContent.substring(base64Start)

      // Match base64 characters (including spaces/newlines that might be in the string)
      const base64Match = textFromStart.match(/^[^A-Za-z0-9+/=\s]*([A-Za-z0-9+/=\s]{50,})/)

      if (base64Match) {
        const base64WithSpaces = base64Match[1]
        const base64String = base64WithSpaces.replace(/\s+/g, '')

        // Verify it starts with the header and is valid base64
        if (
          base64String.startsWith(header) &&
          /^[A-Za-z0-9+/=]+$/.test(base64String) &&
          base64String.length >= 50
        ) {
          // Calculate the end position
          const base64End = base64Start + base64Match[0].length

          // Remove the base64 string from the text and replace with placeholder
          const beforeBase64 = cleanContent.substring(0, base64Start).trim()
          const afterBase64 = cleanContent.substring(base64End).trim()

          // Reconstruct text without base64, add placeholder if there was text before
          const placeholder = beforeBase64
            ? ' [Image: Content too large to persist]'
            : '[Image: Content too large to persist]'
          cleanContent = [beforeBase64, afterBase64].filter(Boolean).join(' ').trim()

          // If we removed base64, add placeholder
          if (beforeBase64 || afterBase64) {
            cleanContent = [beforeBase64, placeholder, afterBase64].filter(Boolean).join(' ').trim()
          } else {
            cleanContent = placeholder
          }

          // Continue searching from the start (since we modified the string)
          headerIndex = cleanContent.indexOf(header)
        } else {
          // Move past this header to find next occurrence
          headerIndex = cleanContent.indexOf(header, headerIndex + 1)
        }
      } else {
        // Move past this header to find next occurrence
        headerIndex = cleanContent.indexOf(header, headerIndex + 1)
      }
    }
  }

  return cleanContent
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
    const sanitized = { ...message }

    // Check if content contains base64 images
    if (typeof sanitized.content === 'string' && hasBase64Images(sanitized.content)) {
      // Remove base64 strings from content and replace with placeholder
      sanitized.content = removeBase64FromContent(sanitized.content)
    } else if (typeof sanitized.content === 'string' && isBase64Image(sanitized.content)) {
      // Entire content is base64 image
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
  })
}
