import {
  getMaxReferenceImages,
  normalizeImageModelId,
  supportsMultipleReferenceImages,
} from '@/lib/image-generation/block-model-config'
import {
  isS3Uri,
  mergeUrlsAndDeduplicate,
  parseImageUrls,
  s3UriToPathObject,
} from '@/lib/utils/parse-image-urls'

export const MULTIPLE_INPUT_IMAGES_WARNING =
  'Multiple input images were provided. Using the latest image.'

export const REFERENCE_IMAGES_TRUNCATED_WARNING =
  'Only the first {count} reference images were used.'

export const NANO_BANANA_PRO_MODEL = 'gemini-3-pro-image-preview'

export const NANO_BANANA_MODELS = ['gemini-2.5-flash-image', NANO_BANANA_PRO_MODEL]

const INLINE_IMAGE_PAYLOAD_KEYS = ['base64', 'data', 'dataUrl', 'bytes'] as const

interface ResolveNanoBananaReferencesInput {
  model?: unknown
  uploadedReferences?: unknown[]
  inputImageUrl?: unknown
  inputImageUrls?: unknown
}

interface ApplyNanoBananaPromptImageInput {
  baseToolId: string
  baseParams: Record<string, unknown>
  inputImageUrl?: unknown
  inputImages?: unknown
  promptImageUrl?: string
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stripInlinePayloadFromFileReference(reference: unknown): unknown {
  if (Array.isArray(reference)) {
    return reference.map(stripInlinePayloadFromFileReference)
  }

  if (!isRecord(reference)) {
    return reference
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(reference)) {
    sanitized[key] = stripInlinePayloadFromFileReference(value)
  }
  for (const key of INLINE_IMAGE_PAYLOAD_KEYS) {
    delete sanitized[key]
  }
  return sanitized
}

/**
 * Sanitizes Image Generation wrapper params before JSON serialization.
 * Strips inline image bytes from file references and removes redundant legacy
 * input fields so merged block inputs cannot reintroduce multi-megabyte payloads.
 */
export function sanitizeImageGenerationWrapperParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = stripInlinePayloadFromFileReference(params) as Record<string, unknown>

  const hasInputImages = Array.isArray(sanitized.inputImages) && sanitized.inputImages.length > 0
  const hasInputImage =
    sanitized.inputImage !== undefined &&
    sanitized.inputImage !== null &&
    sanitized.inputImage !== ''

  if (hasInputImages || hasInputImage) {
    sanitized.inputImageUrl = undefined
    sanitized.inputImageUrls = undefined
  }

  if (hasInputImages) {
    sanitized.inputImage = undefined
  } else if (hasInputImage) {
    sanitized.inputImages = undefined
  }

  return sanitized
}

export function resolveNanoBananaReferences({
  model,
  uploadedReferences = [],
  inputImageUrl,
  inputImageUrls,
}: ResolveNanoBananaReferencesInput): {
  inputImage?: unknown
  inputImages?: unknown[]
  inputImageWarning?: string
} {
  const urls = mergeUrlsAndDeduplicate(
    parseImageUrls(inputImageUrl),
    parseImageUrls(inputImageUrls)
  )
  const httpUrls = urls.filter((url) => !isS3Uri(url))
  const s3Refs = urls.filter(isS3Uri).map(s3UriToPathObject)
  const references = [
    ...uploadedReferences.map(stripInlinePayloadFromFileReference),
    ...httpUrls,
    ...s3Refs,
  ]

  if (references.length === 0) {
    return {}
  }

  if (references.length === 1) {
    return { inputImage: references[0] }
  }

  const modelId = typeof model === 'string' ? (normalizeImageModelId(model) ?? model.trim()) : ''
  const maxReferenceImages = getMaxReferenceImages(modelId)

  if (supportsMultipleReferenceImages(modelId)) {
    const cappedReferences = references.slice(0, maxReferenceImages)
    const result: {
      inputImages: unknown[]
      inputImageWarning?: string
    } = { inputImages: cappedReferences }

    if (references.length > maxReferenceImages) {
      result.inputImageWarning = REFERENCE_IMAGES_TRUNCATED_WARNING.replace(
        '{count}',
        String(maxReferenceImages)
      )
    }

    return result
  }

  return {
    inputImage: references[references.length - 1],
    inputImageWarning: MULTIPLE_INPUT_IMAGES_WARNING,
  }
}

function applySingleReferenceImageParams(
  baseParams: Record<string, unknown>,
  inputImageUrl: unknown,
  inputImages: unknown,
  promptImageUrl?: string
): Record<string, unknown> {
  const blockInputImageUrl = normalizeOptionalString(inputImageUrl)
  const resolvedPromptImageUrl = normalizeOptionalString(promptImageUrl)
  const resolvedInputImage = resolvedPromptImageUrl ?? blockInputImageUrl
  const hasInputImages = Array.isArray(inputImages) && inputImages.length > 0

  if (!resolvedInputImage || hasInputImages) {
    return baseParams
  }

  const nextParams: Record<string, unknown> = { ...baseParams, inputImage: resolvedInputImage }
  nextParams.inputImageMimeType = undefined
  return nextParams
}

export function applyNanoBananaPromptImageParams({
  baseToolId,
  baseParams,
  inputImageUrl,
  inputImages,
  promptImageUrl,
}: ApplyNanoBananaPromptImageInput): Record<string, unknown> {
  if (baseToolId === 'openai_image') {
    return applySingleReferenceImageParams(baseParams, inputImageUrl, inputImages, promptImageUrl)
  }

  if (baseToolId !== 'google_nano_banana') {
    return baseParams
  }

  return applySingleReferenceImageParams(baseParams, inputImageUrl, inputImages, promptImageUrl)
}
