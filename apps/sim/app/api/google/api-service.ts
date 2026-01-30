import { createLogger } from '@sim/logger'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import { extractStorageKey } from '@/lib/uploads/utils/file-utils'

const logger = createLogger('GoogleApiService')
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
    return {
      mimeType: inputImageMimeType || 'image/png',
      data: inputImage,
    }
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
      const base64Data = fileBuffer.toString('base64')
      const mimeType = (inputImage as { type?: string }).type || inputImageMimeType || 'image/png'

      logger.info('Converted image to base64 for inline data', {
        mimeType,
        length: base64Data.length,
      })

      return {
        mimeType,
        data: base64Data,
      }
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
 * Build the Nano Banana generateContent request payload.
 *
 * @param params - Request parameters including prompt, aspect ratio, and optional image.
 * @returns Request body ready for the Google Generative Language API.
 */
export const buildNanoBananaRequestBody = async (params: {
  prompt: string
  aspectRatio?: string
  /** For Nano Banana Pro (gemini-3-pro-image-preview): "1K" | "2K" | "4K". */
  imageSize?: string
  inputImage?: unknown
  inputImageMimeType?: string
}): Promise<NanoBananaRequestBody> => {
  const parts: Array<{ text?: string; inlineData?: InlineImageData }> = [
    {
      text: params.prompt,
    },
  ]
  const inlineImage = await resolveInlineImageData(params.inputImage, params.inputImageMimeType)
  if (inlineImage) {
    parts.push({
      inlineData: inlineImage,
    })
  }

  const body: NanoBananaRequestBody = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ['Image'],
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
