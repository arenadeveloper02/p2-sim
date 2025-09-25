// file: utils/isBase64.ts

import Image from 'next/image'

/**
 * Check if a string is valid Base64
 * @param str - input string to check
 * @returns true if Base64, false otherwise
 */
export function isBase64(str: string | any): boolean {
  if (!str || typeof str !== 'string') {
    return false
  }

  // Trim whitespace and newlines that might be present in streamed data
  const trimmedStr = str.trim()

  if (trimmedStr === '') {
    return false
  }

  // Length must be multiple of 4 after trimming
  if (trimmedStr.length % 4 !== 0) {
    return false
  }

  // Base64 regex (supports padding = or == at the end)
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

  // Additional check: Base64 strings should be reasonably long for images (at least 100 chars)
  // and typically start with common image headers when decoded
  if (trimmedStr.length < 100) {
    return false
  }

  return base64Regex.test(trimmedStr)
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
    // Trim the base64 data to remove any whitespace/newlines from streaming
    const cleanImageData = imageData?.trim() || ''

    const imageSrc =
      isBase64 && cleanImageData && cleanImageData.length > 0
        ? `data:image/png;base64,${cleanImageData}`
        : imageUrl || ''

    // Validate that we have a valid image source
    if (!imageSrc) {
      throw new Error('No valid image source provided')
    }

    return (
      <div className='my-2 w-1/2'>
        <Image
          src={imageSrc}
          alt='Generated image'
          width={400}
          height={300}
          className='h-auto w-full rounded-lg border'
          unoptimized
          onError={(e) => {
            console.error('Image failed to load:', `${imageSrc.substring(0, 100)}...`, e)
            //   setLoadError(true)
            //   onLoadError?.(true)
          }}
          onLoad={() => {
            //   onLoadError?.(false)
          }}
        />
      </div>
    )
  } catch (error) {
    console.error('Error rendering base64 image:', error)

    // Return a fallback error message instead of crashing
    return (
      <div className='my-2 w-1/2'>
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
