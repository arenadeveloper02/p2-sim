// file: utils/isBase64.ts

import Image from 'next/image'

/**
 * Check if a string is valid Base64
 * @param str - input string to check
 * @returns true if Base64, false otherwise
 */
export function isBase64(str: string): boolean {
  if (!str || str.trim() === '') {
    return false
  }

  // Length must be multiple of 4
  if (str.length % 4 !== 0) {
    return false
  }

  // Base64 regex (supports padding = or == at the end)
  const base64Regex = /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/

  return base64Regex.test(str)
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
  const imageSrc =
    isBase64 && imageData && imageData.length > 0
      ? `data:image/png;base64,${imageData}`
      : imageUrl || ''

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
          console.error('Image failed to load:......', imageSrc)
          //   setLoadError(true)
          //   onLoadError?.(true)
        }}
        onLoad={() => {
          //   onLoadError?.(false)
        }}
      />
    </div>
  )
}
