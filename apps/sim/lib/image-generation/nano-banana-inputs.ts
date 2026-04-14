import {
  isS3Uri,
  mergeUrlsAndDeduplicate,
  parseImageUrls,
  s3UriToPathObject,
} from '@/lib/utils/parse-image-urls'

export const MULTIPLE_INPUT_IMAGES_WARNING =
  'Multiple input images were provided. Using the latest image.'

export const NANO_BANANA_PRO_MODEL = 'gemini-3-pro-image-preview'

export const NANO_BANANA_MODELS = ['gemini-2.5-flash-image', NANO_BANANA_PRO_MODEL]

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
  const urls = mergeUrlsAndDeduplicate(parseImageUrls(inputImageUrl), parseImageUrls(inputImageUrls))
  const httpUrls = urls.filter((url) => !isS3Uri(url))
  const s3Refs = urls.filter(isS3Uri).map(s3UriToPathObject)
  const references = [...uploadedReferences, ...httpUrls, ...s3Refs]

  if (references.length === 0) {
    return {}
  }

  if (references.length === 1) {
    return { inputImage: references[0] }
  }

  if (model === NANO_BANANA_PRO_MODEL) {
    return { inputImages: references }
  }

  return {
    inputImage: references[references.length - 1],
    inputImageWarning: MULTIPLE_INPUT_IMAGES_WARNING,
  }
}

export function applyNanoBananaPromptImageParams({
  baseToolId,
  baseParams,
  inputImageUrl,
  inputImages,
  promptImageUrl,
}: ApplyNanoBananaPromptImageInput): Record<string, unknown> {
  if (baseToolId !== 'google_nano_banana') {
    return baseParams
  }

  const blockInputImageUrl = normalizeOptionalString(inputImageUrl)
  const resolvedPromptImageUrl = normalizeOptionalString(promptImageUrl)
  const resolvedInputImage = resolvedPromptImageUrl ?? blockInputImageUrl
  const hasInputImages = Array.isArray(inputImages) && inputImages.length > 0

  if (!resolvedInputImage || hasInputImages) {
    return baseParams
  }

  const nextParams: Record<string, unknown> = { ...baseParams, inputImage: resolvedInputImage }
  delete nextParams.inputImageMimeType
  return nextParams
}
