import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import sharp from 'sharp'
import type { ToolResponse } from '@/tools/types'
import type { StorageContext } from '@/lib/uploads'
import { S3_AGENT_GENERATED_IMAGES_CONFIG } from '@/lib/uploads/config'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import { saveGeneratedImage } from '@/lib/uploads/utils/image-storage.server'
import {
  extractStorageKey,
  inferContextFromKey,
  isInternalFileUrl,
} from '@/lib/uploads/utils/file-utils'

const logger = createLogger('GoogleApiService')

const SVG_MIME = 'image/svg+xml'
const MAX_URL_IMAGE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
const URL_FETCH_TIMEOUT_MS = 30_000 // 30 seconds

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

interface NanoBananaResponseParams {
  model?: string
  aspectRatio?: string
  imageSize?: string
  inputImage?: unknown
  inputImageMimeType?: string
  inputImages?: unknown[]
  _context?: {
    workflowId?: string
    sessionUserId?: string
    userId?: string
  }
}

interface CandidatePart {
  text?: string
  inlineData?: {
    mimeType?: string
    data?: string
  }
  inline_data?: {
    mime_type?: string
    data?: string
  }
  image?: {
    data?: string
    mimeType?: string
    mime_type?: string
  }
}

function getObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.keys(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const extractCandidateParts = (candidate: Record<string, unknown>): CandidatePart[] => {
  const directParts = candidate.parts
  if (Array.isArray(directParts)) {
    return directParts as CandidatePart[]
  }

  const content = candidate.content as
    | { parts?: CandidatePart[]; role?: string }
    | CandidatePart[]
    | undefined

  if (Array.isArray(content)) {
    return content
  }

  if (content?.parts && Array.isArray(content.parts)) {
    return content.parts
  }

  return []
}

export async function buildNanoBananaToolResponse(
  dt: unknown,
  params?: NanoBananaResponseParams
): Promise<ToolResponse> {
  const responseData = isRecord(dt) && isRecord(dt.data) ? dt.data : dt
  const candidates = isRecord(responseData) ? responseData.candidates : undefined

  if (!Array.isArray(candidates) || candidates.length === 0) {
    logger.error('No candidates found in Nano Banana response', {
      topLevelKeys: getObjectKeys(dt),
      dataKeys: getObjectKeys(responseData),
    })
    throw new Error('No candidates found in response')
  }

  const candidate = candidates[0] as Record<string, unknown>
  const finishReason =
    typeof candidate.finishReason === 'string' ? candidate.finishReason : 'UNKNOWN'
  if (finishReason === 'NO_IMAGE') {
    logger.error('Nano Banana did not return an image', {
      finishReason,
      candidateKeys: getObjectKeys(candidate),
      hasPromptFeedback: Boolean(isRecord(responseData) ? responseData.promptFeedback : undefined),
      modelVersion: isRecord(responseData) ? responseData.modelVersion : undefined,
    })
    throw new Error(
      'Google Nano Banana returned NO_IMAGE. The model did not generate an image for this prompt; try a shorter/simpler prompt or a different aspect ratio.'
    )
  }

  const candidateParts = extractCandidateParts(candidate)
  if (candidateParts.length === 0) {
    logger.error('No content parts found in Nano Banana candidate', {
      candidateKeys: getObjectKeys(candidate),
    })
    throw new Error(
      `No content parts found in candidate (keys: ${Object.keys(candidate).join(', ') || 'none'})`
    )
  }

  let base64Image: string | null = null
  let mimeType = 'image/png'

  for (const part of candidateParts) {
    const inlineData = part.inlineData ?? part.inline_data
    const imageData = inlineData?.data ?? part.image?.data
    if (imageData) {
      base64Image = imageData
      mimeType =
        part.inlineData?.mimeType ??
        part.inline_data?.mime_type ??
        part.image?.mimeType ??
        part.image?.mime_type ??
        'image/png'
      logger.info('Found image data in part', { mimeType })
      break
    }
  }

  if (!base64Image) {
    logger.error('No image data found in Nano Banana response parts', {
      candidatePartCount: candidateParts.length,
    })
    throw new Error('No image data found in response parts')
  }

  logger.info('Successfully received Nano Banana image', { base64Length: base64Image.length })

  const workflowId = params?._context?.workflowId || 'unknown'
  const userId = params?._context?.sessionUserId ?? params?._context?.userId ?? 'unknown'

  let finalImageUrl: string | null = null
  let s3UploadFailed: boolean | undefined
  try {
    const saveResult = await saveGeneratedImage(base64Image, workflowId, userId, mimeType)
    finalImageUrl = saveResult.url
    s3UploadFailed = saveResult.s3UploadFailed
    logger.info('Successfully saved Nano Banana image to storage', { url: finalImageUrl })
  } catch (error) {
    logger.error('Error saving Nano Banana image to storage:', error)
    throw new Error(`Failed to save generated image to storage: ${toError(error).message}`)
  }

  const metadata = {
    model: params?.model || 'gemini-2.5-flash-image',
    mimeType,
    aspectRatio: params?.aspectRatio || '1:1',
    imageSize: params?.imageSize ?? null,
    hasInputImage: !!(params?.inputImage && params?.inputImageMimeType),
    hasInputImages: Array.isArray(params?.inputImages) && params.inputImages.length > 0,
    inputImageCount: Array.isArray(params?.inputImages) ? params.inputImages.length : null,
    inputImageMimeType: params?.inputImageMimeType || null,
    stored: !!finalImageUrl,
    s3UploadFailed,
  }

  return {
    success: true,
    output: {
      content: finalImageUrl || 'nano-banana-generated-image',
      image: finalImageUrl,
      images: [finalImageUrl],
      metadata,
      s3UploadFailed,
    },
  }
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
    const str = inputImage.trim()
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)
        const response = await fetch(str, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Sim-Workflow/1.0' },
        })
        clearTimeout(timeoutId)
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        if (buffer.length > MAX_URL_IMAGE_SIZE_BYTES) {
          throw new Error(
            `Image from URL exceeds 20MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)}MB)`
          )
        }
        const contentType = response.headers.get('content-type') || 'image/png'
        const mimeType = contentType.split(';')[0].trim() || inputImageMimeType || 'image/png'
        logger.info('Fetched image from URL for inline data', { mimeType, size: buffer.length })
        return ensureSupportedMime(buffer, mimeType)
      } catch (error) {
        logger.error('Failed to fetch image from URL', { url: str.slice(0, 80), error })
        throw new Error(`Failed to fetch image from URL: ${toError(error).message}`)
      }
    }
    const mimeType = inputImageMimeType || 'image/png'
    const buffer = Buffer.from(inputImage, 'base64')
    return ensureSupportedMime(buffer, mimeType)
  }

  const obj = inputImage as { path?: string; key?: string; url?: string; type?: string }
  if (typeof inputImage !== 'object' || inputImage === null) {
    throw new Error('Invalid input image format')
  }

  if (obj.key) {
    try {
      const context = inferContextFromKey(obj.key)
      const fileBuffer = await downloadFile({ key: obj.key, context })
      const mimeType = obj.type || inputImageMimeType || 'image/png'
      logger.info('Resolved image from key for inline data', { mimeType, size: fileBuffer.length })
      return ensureSupportedMime(fileBuffer, mimeType)
    } catch (error) {
      logger.error('Failed to resolve inline image data from key', error)
      throw new Error(
        `Failed to process input image: ${toError(error).message}`
      )
    }
  }

  if (obj.path) {
    try {
      const filePath = obj.path
      let s3Key: string
      let context: StorageContext
      if (filePath.startsWith('s3://')) {
        const urlWithoutProtocol = filePath.replace('s3://', '')
        const pathParts = urlWithoutProtocol.split('/')
        const bucket = pathParts[0]
        s3Key = pathParts.slice(1).join('/').split('?')[0]
        context =
          bucket && bucket === S3_AGENT_GENERATED_IMAGES_CONFIG.bucket
            ? 'agent-generated-images'
            : 'workspace'
      } else {
        s3Key = extractStorageKey(filePath)
        context = inferContextFromKey(s3Key)
      }

      const fileBuffer = await downloadFile({ key: s3Key, context })
      const mimeType = obj.type || inputImageMimeType || 'image/png'

      logger.info('Resolved image for inline data', { mimeType, size: fileBuffer.length })

      return ensureSupportedMime(fileBuffer, mimeType)
    } catch (error) {
      logger.error('Failed to resolve inline image data', error)
      throw new Error(
        `Failed to process input image: ${toError(error).message}`
      )
    }
  }

  if (obj.url && isInternalFileUrl(obj.url)) {
    try {
      const s3Key = extractStorageKey(obj.url)
      const fileBuffer = await downloadFile({ key: s3Key, context: inferContextFromKey(s3Key) })
      const mimeType = obj.type || inputImageMimeType || 'image/png'
      logger.info('Resolved image from URL for inline data', { mimeType, size: fileBuffer.length })
      return ensureSupportedMime(fileBuffer, mimeType)
    } catch (error) {
      logger.error('Failed to resolve inline image data from URL', error)
      throw new Error(
        `Failed to process input image: ${toError(error).message}`
      )
    }
  }

  throw new Error('Invalid input image format')
}

/**
 * Deduplicate inputImages array before processing. First occurrence wins.
 * Keys: URL strings by value; objects by key, url, or path (whichever present).
 *
 * @param inputImages - Raw array of image refs
 * @returns Deduplicated array
 */
function deduplicateInputImages(inputImages: unknown[]): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []
  for (const item of inputImages) {
    let key: string
    if (typeof item === 'string') {
      key = item.trim()
    } else if (item && typeof item === 'object') {
      const obj = item as { key?: string; url?: string; path?: string }
      key = (obj.key || obj.url || obj.path || JSON.stringify(item)) as string
    } else {
      key = String(item)
    }
    if (key && !seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

/**
 * Resolve an array of image references to inline data for multi-image fusion.
 * Deduplicates before processing.
 *
 * @param inputImages - Array of base64 strings, URLs, or objects with path/key/url.
 * @returns Array of inline image data in order, or empty array if none.
 */
export const resolveInlineImageDataArray = async (
  inputImages: unknown[]
): Promise<InlineImageData[]> => {
  const deduplicated = deduplicateInputImages(inputImages)
  const results: InlineImageData[] = []
  for (let i = 0; i < deduplicated.length; i++) {
    const item = deduplicated[i]
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
    const inlineImage = await resolveInlineImageData(params.inputImage, params.inputImageMimeType)
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
