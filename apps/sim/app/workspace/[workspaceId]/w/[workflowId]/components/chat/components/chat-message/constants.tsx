// file: utils/isBase64.ts

import { type SyntheticEvent, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download, Expand, X } from 'lucide-react'
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from '@/components/emcn'

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
function Base64ImageWithBlobUrl({
  cleanImageData,
  imageWrapperClass = 'my-2 w-full max-h-[70vh] min-h-0 overflow-auto rounded-lg border bg-[var(--surface-5)]',
}: {
  cleanImageData: string
  imageWrapperClass?: string
}) {
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
    <ImageWithViewFullOverlay
      src={objectUrl}
      wrapperClassName={imageWrapperClass}
      onDownload={() => downloadImage(true, cleanImageData)}
    >
      <img
        src={objectUrl}
        alt='Generated image'
        className='h-full bg-cover max-w-full rounded-lg border'
        style={{ maxHeight: '500px', objectFit: 'contain' }}
        onError={(e) => {
          console.error('Image failed to load (blob URL)', { error: e })
        }}
      />
    </ImageWithViewFullOverlay>
  )
}

/**
 * Ensures a single image URL is used when the value may contain duplicates (e.g. same URL twice with newline).
 */
function normalizeImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl || typeof imageUrl !== 'string') return ''
  const trimmed = imageUrl.trim()
  if (!trimmed) return ''
  const first = trimmed.split(/\s+/).find((s) => s.length > 0)
  return first ?? trimmed
}

/**
 * Resolves `/api/files/serve/...` to a loadable URL. In the browser, always uses
 * `window.location.origin` so production never rewrites to `NEXT_PUBLIC_APP_URL`
 * when that env still points at localhost (mixed content + broken images on HTTPS).
 */
function sameOriginServeUrl(pathname: string, search: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${pathname}${search}`
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    return `${new URL(appUrl).origin}${pathname}${search}`
  }
  return `${pathname}${search}`
}

/**
 * Returns the URL to use for img src.
 * - Our file-serve paths use the current page origin in the browser (session + HTTPS-safe).
 * - Other HTTP(S) URLs go through the proxy on the client.
 */
function getImageDisplayUrl(url: string): string {
  if (!url || typeof url !== 'string') return url
  const trimmed = url.trim()
  if (!trimmed) return url

  try {
    if (trimmed.startsWith('/api/files/serve/')) {
      const q = trimmed.indexOf('?')
      return sameOriginServeUrl(
        q === -1 ? trimmed : trimmed.slice(0, q),
        q === -1 ? '' : trimmed.slice(q)
      )
    }

    if (!trimmed.startsWith('http')) return trimmed

    const imageUrlParsed = new URL(trimmed)
    if (imageUrlParsed.pathname.startsWith('/api/files/serve/')) {
      return sameOriginServeUrl(imageUrlParsed.pathname, imageUrlParsed.search)
    }

    if (typeof window !== 'undefined') {
      return `/api/files/proxy-image?url=${encodeURIComponent(trimmed)}`
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      const app = new URL(appUrl)
      if (imageUrlParsed.host === app.host) return trimmed
    }
    return `/api/files/proxy-image?url=${encodeURIComponent(trimmed)}`
  } catch {
    return url
  }
}

const overlayButtonClass =
  'pointer-events-auto shrink-0 gap-1.5 rounded-md border-white/20 bg-black/40 px-3 py-2 text-white shadow-sm hover:bg-black/55 hover:text-white dark:border-white/20 dark:bg-black/50 dark:hover:bg-black/65'

/**
 * Wraps an image with a transparent overlay and bottom-center CTAs: Preview and Download.
 * Preview opens a modal with the full-size image; Download triggers the provided callback.
 */
function ImageWithViewFullOverlay({
  src,
  wrapperClassName,
  children,
  onDownload,
}: {
  src: string
  wrapperClassName: string
  children: React.ReactNode
  onDownload?: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [isModalImageLoading, setIsModalImageLoading] = useState(false)
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null)
  const handleViewFull = useCallback(() => setModalOpen(true), [])

  useEffect(() => {
    if (modalOpen) {
      setIsModalImageLoading(true)
      setPreviewSize(null)
    }
  }, [modalOpen, src])

  const handleModalImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const naturalWidth = event.currentTarget.naturalWidth
    const naturalHeight = event.currentTarget.naturalHeight

    if (naturalWidth > 0 && naturalHeight > 0 && typeof window !== 'undefined') {
      const viewportWidth = Math.floor(window.innerWidth * 0.92)
      const viewportHeight = Math.floor(window.innerHeight * 0.76)
      const scale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight, 1)

      setPreviewSize({
        width: Math.max(240, Math.floor(naturalWidth * scale)),
        height: Math.max(180, Math.floor(naturalHeight * scale)),
      })
    }

    setIsModalImageLoading(false)
  }, [])

  return (
    <>
      <div className={`relative ${wrapperClassName}`}>
        {children}
        <div
          className='pointer-events-none absolute inset-0 flex items-end justify-center gap-2 pt-8 pb-3'
          aria-hidden
        >
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className={overlayButtonClass}
            onClick={handleViewFull}
            aria-label='Preview image'
          >
            <Expand className='h-4 w-4' />
            <span>Preview</span>
          </Button>
          {onDownload && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className={overlayButtonClass}
              onClick={onDownload}
              aria-label='Download image'
            >
              <Download className='h-4 w-4' />
              <span>Download</span>
            </Button>
          )}
        </div>
      </div>
      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent
          size='full'
          className='flex max-h-[95vh] w-auto min-w-[95vw] items-center flex-col'
        >
          <ModalHeader className='w-full'></ModalHeader>
          <ModalBody
            className='flex items-center justify-center overflow-auto border-t-0 p-4 pb-7'
            style={
              previewSize
                ? {
                    width: `${previewSize.width}px`,
                    height: `${previewSize.height}px`,
                  }
                : undefined
            }
          >
            {isModalImageLoading ? (
              <div className='flex min-h-[180px] min-w-[240px] items-center justify-center text-sm text-muted-foreground'>
                Loading image...
              </div>
            ) : null}
            <img
              src={src}
              alt='Generated image'
              className={`h-auto max-h-full w-auto max-w-full object-contain ${
                isModalImageLoading ? 'hidden' : ''
              }`}
              onLoad={handleModalImageLoad}
              onError={() => setIsModalImageLoading(false)}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
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
    const singleImageUrl = normalizeImageUrl(imageUrl)
    const displayUrl = singleImageUrl ? getImageDisplayUrl(singleImageUrl) : ''

    const imageWrapperClass =
      'my-2 w-fit max-w-full h-[500px] min-h-0 overflow-auto rounded-lg border bg-[var(--surface-5)]'

    if (!isBase64 && singleImageUrl && (!cleanImageData || cleanImageData.length === 0)) {
      return (
        <ImageWithViewFullOverlay
          src={displayUrl}
          wrapperClassName={imageWrapperClass}
          onDownload={() => downloadImage(false, undefined, singleImageUrl)}
        >
          <img
            src={displayUrl}
            alt='Generated image'
            className='h-full bg-cover max-w-full rounded-lg object-contain'
            referrerPolicy='no-referrer'
            onError={(e) => {
              console.error('Image failed to load:', {
                error: e,
                imageUrl: singleImageUrl,
              })
            }}
          />
        </ImageWithViewFullOverlay>
      )
    }

    if (!cleanImageData || cleanImageData.length === 0) {
      if (singleImageUrl) {
        return (
          <ImageWithViewFullOverlay
            src={displayUrl}
            wrapperClassName={imageWrapperClass}
            onDownload={() => downloadImage(false, undefined, singleImageUrl)}
          >
            <img
              src={displayUrl}
              alt='Generated image'
              className='h-full bg-cover max-w-full rounded-lg object-contain'
              referrerPolicy='no-referrer'
              onError={(e) => {
                console.error('Image failed to load:', {
                  error: e,
                  imageUrl: singleImageUrl,
                })
              }}
            />
          </ImageWithViewFullOverlay>
        )
      }
      throw new Error('No image data provided')
    }

    if (isBase64 && cleanImageData.length > BLOB_URL_BASE64_LENGTH_THRESHOLD) {
      return (
        <Base64ImageWithBlobUrl
          cleanImageData={cleanImageData}
          imageWrapperClass={imageWrapperClass}
        />
      )
    }

    const imageSrc =
      isBase64 && cleanImageData.length > 0
        ? `data:image/${getMimeFromBase64(cleanImageData).replace('image/', '')};base64,${cleanImageData}`
        : displayUrl || ''

    if (!imageSrc) {
      throw new Error('No valid image source provided')
    }

    return (
      <ImageWithViewFullOverlay
        src={imageSrc}
        wrapperClassName={imageWrapperClass}
        onDownload={() => downloadImage(isBase64, cleanImageData || undefined, singleImageUrl || undefined)}
      >
        <img
          src={imageSrc}
          alt='Generated image'
          className='h-full bg-cover max-w-full rounded-lg object-contain'
          referrerPolicy='no-referrer'
          onError={(e) => {
            console.error('Image failed to load:', {
              error: e,
              imageSrcLength: imageSrc.length,
              preview: imageSrc.substring(0, 100),
            })
          }}
        />
      </ImageWithViewFullOverlay>
    )
  } catch (error) {
    console.error('Error rendering image:', error, {
      imageDataLength: imageData?.length,
      isBase64,
      imageUrl,
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

/**
 * Returns a single image URL from a string that might contain multiple URLs or markdown.
 * Used so the fetch URL is never a concatenation of several URLs.
 */
function toSingleImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim()
  if (!trimmed) return trimmed
  const first = extractFirstImageUrlFromString(trimmed)
  if (first) return first
  return trimmed
}

/**
 * Returns a URL suitable for same-origin fetch. Uses current origin when the path is our serve path
 * so workspace and deployed chat both hit the same backend (avoids proxy/cross-origin).
 * Ensures only one URL is used even if the input accidentally contains multiple.
 */
function getDownloadFetchUrl(imageUrl: string): string {
  const single = toSingleImageUrl(imageUrl)
  const trimmed = single.trim()
  if (!trimmed) return trimmed
  if (typeof window === 'undefined') return trimmed
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : withSlash, window.location.origin)
    if (parsed.pathname.startsWith('/api/files/serve/')) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`
    }
    if (parsed.origin === window.location.origin) {
      return parsed.toString()
    }
    return trimmed
  } catch {
    return withSlash.startsWith('/') ? `${window.location.origin}${withSlash}` : trimmed
  }
}

/**
 * Returns true if we can fetch the image with credentials (same-origin or our serve path on current origin).
 */
function canFetchDirect(imageUrl: string): boolean {
  if (imageUrl.startsWith('/')) return true
  if (typeof window === 'undefined') return false
  try {
    const parsed = new URL(
      imageUrl.startsWith('http') ? imageUrl : `/${imageUrl}`,
      window.location.origin
    )
    if (parsed.pathname.startsWith('/api/files/serve/')) return true
    return parsed.origin === window.location.origin
  } catch {
    return true
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
      if (canFetchDirect(imageUrl)) {
        const fetchUrl = getDownloadFetchUrl(imageUrl)
        const response = await fetch(fetchUrl, { credentials: 'include' })
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`)
        }
        blob = await response.blob()
      } else {
        const proxyUrl = `/api/files/proxy-image?url=${encodeURIComponent(imageUrl)}`
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`)
        }
        blob = await response.blob()
      }
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
 * Returns true if the string looks like a single image URL (http, https, or /api/files/serve/ with image extension or agent-generated path).
 */
export function isImageUrlString(s: string): boolean {
  if (!s || typeof s !== 'string') return false
  const trimmed = s.trim()
  const urlPrefix = trimmed.startsWith('http') || trimmed.startsWith('/api/files/serve/')
  return (
    !!urlPrefix &&
    (/\.(png|jpg|jpeg|gif|webp)(\?|%|$)/i.test(trimmed) ||
      trimmed.includes('agent-generated-images'))
  )
}

function normalizeUrlDedupeKey(u: string): string {
  try {
    return decodeURIComponent(u.trim())
  } catch {
    return u.trim()
  }
}

/**
 * True when a trimmed line is a file-serve or HTTP URL that should render as an image.
 * (Handles multiline final chat output where each line is a full URL.)
 */
export function isImageUrlLine(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.startsWith('/api/files/serve/')) {
    return t.includes('agent-generated-images') || /\.(png|jpg|jpeg|gif|webp)/i.test(t)
  }
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return (
      t.includes('/api/files/serve/') ||
      t.includes('agent-generated-images') ||
      /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/i.test(t)
    )
  }
  return false
}

/**
 * Resolves assistant message text into deduped image URLs and remaining markdown prose.
 * Handles: (1) multiple outputs joined with \\n\\n (same URL twice from content+image picks),
 * (2) JSON payloads `{ content, image, metadata }`, (3) single URL lines.
 */
export function resolveMessageImagesAndProse(raw: string): { urls: string[]; prose: string } {
  if (!raw || typeof raw !== 'string') {
    return { urls: [], prose: '' }
  }

  const pushUrl = (u: string, seen: Set<string>, urls: string[]) => {
    const t = u.trim()
    if (!t || !isImageUrlLine(t)) return
    const k = normalizeUrlDedupeKey(t)
    if (!seen.has(k)) {
      seen.add(k)
      urls.push(t)
    }
  }

  const segments = raw.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
  const urls: string[] = []
  const seen = new Set<string>()
  const proseParts: string[] = []

  for (const seg of segments) {
    const lines = seg.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    if (lines.length === 1 && isImageUrlLine(lines[0])) {
      pushUrl(lines[0], seen, urls)
      continue
    }

    const allLinesAreImageUrls = lines.every((l) => isImageUrlLine(l))
    if (allLinesAreImageUrls) {
      for (const l of lines) pushUrl(l, seen, urls)
      continue
    }

    const hasAnyImageLine = lines.some((l) => isImageUrlLine(l))
    if (hasAnyImageLine) {
      for (const l of lines) {
        if (isImageUrlLine(l)) pushUrl(l, seen, urls)
        else proseParts.push(l)
      }
      continue
    }

    proseParts.push(seg)
  }

  if (urls.length > 0) {
    return { urls, prose: proseParts.join('\n\n').trim() }
  }

  const t = raw.trim()
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const jsonUrls: string[] = []
        const jSeen = new Set<string>()
        if (typeof o.image === 'string') pushUrl(o.image, jSeen, jsonUrls)
        if (typeof o.content === 'string') pushUrl(o.content, jSeen, jsonUrls)
        if (jsonUrls.length > 0) {
          return { urls: jsonUrls, prose: '' }
        }
      }
    } catch {
      /* not JSON */
    }
  }

  return { urls: [], prose: raw }
}

/** Characters that end a URL when scanning from the start. */
const URL_END_CHARS = /[\s)\]"'\u00A0]/

/**
 * Extracts the first image URL from a string that may contain multiple URLs, markdown, or extra text.
 * Returns only the first valid image URL segment, or null.
 */
function extractFirstImageUrlFromString(s: string): string | null {
  if (!s || typeof s !== 'string') return null
  const trimmed = s.trim()
  const patterns: RegExp[] = [
    /https?:\/\/[^\s)\]"']*?(?:agent-generated-images[^\s)\]"']*?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s)\]"']*)?)/i,
    /\/api\/files\/serve\/[^\s)\]"']*?(?:agent-generated-images[^\s)\]"']*?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s)\]"']*)?)/i,
    /https?:\/\/[^\s)\]"']*?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s)\]"']*)?/i,
    /\/api\/files\/serve\/[^\s)\]"']+agent-generated-images[^\s)\]"']+/i,
  ]
  for (const re of patterns) {
    const match = trimmed.match(re)
    if (match?.[0]) {
      let url = match[0]
      const endIdx = url.search(URL_END_CHARS)
      if (endIdx !== -1) url = url.slice(0, endIdx)
      if (url.length > 0) return url
    }
  }
  return null
}

/**
 * Extracts the first image URL from message content (for download). Returns null if none.
 * When content is a string, extracts only the first URL (avoids returning concatenated or markdown text).
 */
export function getImageUrlFromContent(content: unknown): string | null {
  if (!content) return null
  if (typeof content === 'string') {
    const single = extractFirstImageUrlFromString(content)
    if (single) return single
    if (isImageUrlString(content)) return content.trim()
    return null
  }
  if (typeof content === 'object' && content !== null) {
    const o = content as Record<string, unknown>
    const image = o.image ?? (o.output as Record<string, unknown> | undefined)?.image
    if (typeof image === 'string') {
      const single = extractFirstImageUrlFromString(image)
      if (single) return single
      if (isImageUrlString(image)) return image.trim()
    }
    const contentStr = o.content
    if (typeof contentStr === 'string') {
      const single = extractFirstImageUrlFromString(contentStr)
      if (single) return single
      if (isImageUrlString(contentStr)) return contentStr.trim()
    }
  }
  return null
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






export const S3_UPLOAD_FAILED_DISMISS_MS = 10_000

/**
 * Normalizes a URL for deduplication (e.g. encoded vs decoded path).
 */
export function normalizeImageUrlForCompare(s: string): string {
  try {
    return decodeURIComponent(s.trim())
  } catch {
    return s.trim()
  }
}

/**
 * True if the string is an http(s) or app file-serve URL that should render as an image.
 */
export function isRenderableImageUrl(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.startsWith('/api/files/serve/')) return true
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return (
      /\.(png|jpg|jpeg|gif|webp)(\?|#|%|$)/i.test(t) ||
      t.includes('agent-generated-images') ||
      t.includes('/api/files/serve/')
    )
  }
  return false
}

/**
 * Collects unique image URLs from workflow output shapes like
 * `{ content, image, metadata }` so the same URL is not rendered twice.
 */
export function collectUniqueImageUrls(imageField: string, contentField: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const add = (u: string) => {
    const key = normalizeImageUrlForCompare(u)
    if (!seen.has(key)) {
      seen.add(key)
      urls.push(u.trim())
    }
  }
  if (imageField.trim() && isRenderableImageUrl(imageField)) {
    add(imageField)
  }
  if (contentField.trim() && isRenderableImageUrl(contentField)) {
    add(contentField)
  }
  return urls
}

/**
 * Merges `{ image, content }` tool payloads so the same URL is not shown as both markdown and
 * `<img>`. Streaming often sets `content` to joined text that already includes the image URL while
 * `image` duplicates it — this strips URL-only lines from prose and dedupes URLs.
 */
export function mergeToolOutputImageUrls(
  imageField: string,
  contentField: string
): { uniqueUrls: string[]; prose: string } {
  const { urls: urlsFromProse, prose } = resolveMessageImagesAndProse(contentField)
  const fromFields = collectUniqueImageUrls(imageField, contentField)
  const seen = new Set<string>()
  const uniqueUrls: string[] = []
  const add = (u: string) => {
    const t = u.trim()
    if (!t) return
    const key = normalizeImageUrlForCompare(t)
    if (seen.has(key)) return
    seen.add(key)
    uniqueUrls.push(t)
  }
  for (const u of fromFields) add(u)
  for (const u of urlsFromProse) add(u)
  return { uniqueUrls, prose }
}

/**
 * Temporary alert shown when the generated image was saved to local storage because S3 upload failed.
 * Auto-dismisses after 10s; user can dismiss manually.
 */
export function S3UploadFailedAlert() {
  const [dismissed, setDismissed] = useState(false)
  const dismiss = useCallback(() => setDismissed(true), [])

  useEffect(() => {
    const t = setTimeout(dismiss, S3_UPLOAD_FAILED_DISMISS_MS)
    return () => clearTimeout(t)
  }, [dismiss])

  if (dismissed) return null

  return (
    <div
      className='mb-2 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-200'
      role='alert'
    >
      <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400' />
      <p className='flex-1'>
        Image was saved locally because upload to the storage bucket failed. Saving to the bucket is
        important for this workflow and user.
      </p>
      <button
        type='button'
        onClick={dismiss}
        className='flex-shrink-0 rounded p-1 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500'
        aria-label='Dismiss'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  )
}