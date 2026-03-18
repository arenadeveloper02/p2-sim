import { createLogger } from '@sim/logger'
import sharp from 'sharp'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import { extractStorageKey } from '@/lib/uploads/utils/file-utils'

const logger = createLogger('GoogleApiService')

const SVG_MIME = 'image/svg+xml'

/**
 * Gemini image API does not support image/svg+xml. Convert SVG to PNG for API compatibility.
 */
async function ensureSupportedMime(
  buffer: Buffer,
  mimeType: string
): Promise<{ mimeType: string; data: string }> {
  const normalized = mimeType.toLowerCase().split(';')[0].trim()
  if (normalized !== SVG_MIME) {
    return { mimeType: normalized || 'image/png', data: buffer.toString('base64') }
  }
  logger.info('Converting SVG to PNG for Gemini API compatibility')
  const pngBuffer = await sharp(buffer).png().toBuffer()
  return { mimeType: 'image/png', data: pngBuffer.toString('base64') }
}
const GOOGLE_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface NanoBananaRequestBody {
  contents: Array<{
    parts: Array<{
      text?: string
      inlineData?: {
        mimeType: string
        data: string
      }
    }>
  }>
  generationConfig?: {
    imageConfig?: {
      aspectRatio?: string
      /** Output resolution for Nano Banana Pro: "1K" | "2K" | "4K" (uppercase K). */
      imageSize?: string
    }
    responseModalities?: string[]
  }
}

interface InlineImageData {
  mimeType: string
  data: string
}

/**
 * Build the Google Generative Language generateContent URL for a given model.
 *
 * @param model - The Gemini model name (for example, gemini-2.5-flash-image).
 * @returns Fully-qualified generateContent endpoint URL.
 */
export const buildGenerateContentUrl = (model: string): string => {
  const url = `${GOOGLE_API_BASE_URL}/${model}:generateContent`
  logger.info('Resolved generateContent URL', { model, url })
  return url
}

/**
 * Convert an input image reference into inline data accepted by Gemini.
 *
 * @param inputImage - A base64 string or an object containing a path (e.g., s3://...).
 * @param inputImageMimeType - Optional MIME type override.
 * @returns Inline image data or null if no image provided.
 */
export const resolveInlineImageData = async (
  inputImage: unknown,
  inputImageMimeType?: string
): Promise<InlineImageData | null> => {
  if (!inputImage) {
    return null
  }

  if (typeof inputImage === 'string') {
    const mimeType = inputImageMimeType || 'image/png'
    const buffer = Buffer.from(inputImage, 'base64')
    return ensureSupportedMime(buffer, mimeType)
  }

  if (typeof inputImage === 'object' && (inputImage as { path?: string }).path) {
    try {
      const filePath = (inputImage as { path: string }).path
      let s3Key: string
      if (filePath.startsWith('s3://')) {
        const urlWithoutProtocol = filePath.replace('s3://', '')
        const pathParts = urlWithoutProtocol.split('/')
        s3Key = pathParts.slice(1).join('/').split('?')[0]
      } else {
        s3Key = extractStorageKey(filePath)
      }

      const fileBuffer = await downloadFile({ key: s3Key, context: 'workspace' })
      const mimeType = (inputImage as { type?: string }).type || inputImageMimeType || 'image/png'

      logger.info('Resolved image for inline data', { mimeType, size: fileBuffer.length })

      return ensureSupportedMime(fileBuffer, mimeType)
    } catch (error) {
      logger.error('Failed to resolve inline image data', error)
      throw new Error(
        `Failed to process input image: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  throw new Error('Invalid input image format')
}

/**
 * Resolve an array of image references to inline data for multi-image fusion.
 *
 * @param inputImages - Array of base64 strings or objects with path (and optional type).
 * @returns Array of inline image data in order, or empty array if none.
 */
export const resolveInlineImageDataArray = async (
  inputImages: unknown[]
): Promise<InlineImageData[]> => {
  const results: InlineImageData[] = []
  for (let i = 0; i < inputImages.length; i++) {
    const item = inputImages[i]
    const mimeType =
      typeof item === 'object' && item !== null && 'type' in item
        ? (item as { type?: string }).type
        : undefined
    const resolved = await resolveInlineImageData(item, mimeType)
    if (resolved) {
      results.push(resolved)
    }
  }
  return results
}

/**
 * Build the Nano Banana generateContent request payload.
 *
 * @param params - Request parameters including prompt, aspect ratio, optional image(s).
 * @returns Request body ready for the Google Generative Language API.
 */
export const buildNanoBananaRequestBody = async (params: {
  prompt: string
  aspectRatio?: string
  /** For Nano Banana Pro (gemini-3-pro-image-preview): "1K" | "2K" | "4K". */
  imageSize?: string
  inputImage?: unknown
  inputImageMimeType?: string
  /** Multiple images for fusion (Nano Banana Pro). When set, takes precedence over inputImage. */
  inputImages?: unknown[]
}): Promise<NanoBananaRequestBody> => {
  const parts: Array<{ text?: string; inlineData?: InlineImageData }> = [
    {
      text: params.prompt,
    },
  ]

  if (Array.isArray(params.inputImages) && params.inputImages.length > 0) {
    const inlineImages = await resolveInlineImageDataArray(params.inputImages)
    for (const inlineImage of inlineImages) {
      parts.push({ inlineData: inlineImage })
    }
  } else {
    const inlineImage = await resolveInlineImageData(
      params.inputImage,
      params.inputImageMimeType
    )
    if (inlineImage) {
      parts.push({ inlineData: inlineImage })
    }
  }

  const body: NanoBananaRequestBody = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  }

  if (params.aspectRatio || params.imageSize) {
    body.generationConfig!.imageConfig = {
      ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
      ...(params.imageSize && { imageSize: params.imageSize }),
    }
  }
  return body
}
