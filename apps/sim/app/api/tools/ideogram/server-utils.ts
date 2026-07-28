import { createLogger, type Logger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { IdeogramProxyBody } from '@/lib/api/contracts/tools/ideogram'
import { getEnv } from '@/lib/core/config/env'
import { IMAGE_GENERATION_DOWNLOAD_TIMEOUT_MS } from '@/lib/image-generation/constants'
import { S3_AGENT_GENERATED_IMAGES_CONFIG } from '@/lib/uploads/config'
import { generateFileId } from '@/lib/uploads/contexts/execution/utils'
import {
  extractStorageKey,
  processFilesToUserFiles,
  type RawFileInput,
} from '@/lib/uploads/utils/file-utils'
import { downloadFileFromStorage } from '@/lib/uploads/utils/file-utils.server'
import { saveGeneratedImage } from '@/lib/uploads/utils/image-storage.server'
import { assertToolFileAccess } from '@/app/api/files/authorization'
import type { UserFile } from '@/executor/types'
import {
  IDEOGRAM_API_BASE,
  IDEOGRAM_OPERATION_PATHS,
  type IdeogramOperation,
} from '@/tools/ideogram/constants'
import { appendFormField, mapIdeogramImages } from '@/tools/ideogram/utils'

const logger = createLogger('IdeogramProxy')

interface ResolvedFile {
  buffer: Buffer
  fileName: string
  mimeType: string
}

interface PersistContext {
  workflowId: string
  userId: string
  requestId: string
}

interface PersistedImage {
  url: string
  imageFile: UserFile
  s3UploadFailed?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeFileList(value: unknown): RawFileInput[] {
  if (!value) return []
  if (Array.isArray(value)) return value as RawFileInput[]
  return [value as RawFileInput]
}

async function resolveFiles(
  value: unknown,
  userId: string,
  requestId: string,
  log: Logger
): Promise<ResolvedFile[]> {
  const inputs = normalizeFileList(value)
  if (inputs.length === 0) return []

  const userFiles = processFilesToUserFiles(inputs, requestId, log)
  if (userFiles.length === 0) {
    throw new Error('Invalid file input')
  }

  const resolved: ResolvedFile[] = []
  for (const userFile of userFiles) {
    const denied = await assertToolFileAccess(userFile.key, userId, requestId, log)
    if (denied) {
      throw new Error('File access denied')
    }
    const buffer = await downloadFileFromStorage(userFile as UserFile, requestId, log)
    resolved.push({
      buffer,
      fileName: userFile.name || 'image.png',
      mimeType: userFile.type || 'application/octet-stream',
    })
  }
  return resolved
}

function appendResolvedFile(form: FormData, fieldName: string, file: ResolvedFile): void {
  form.append(
    fieldName,
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    file.fileName
  )
}

function appendResolvedFiles(form: FormData, fieldName: string, files: ResolvedFile[]): void {
  for (const file of files) {
    appendResolvedFile(form, fieldName, file)
  }
}

function isAgentS3Configured(): boolean {
  return !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket && !!S3_AGENT_GENERATED_IMAGES_CONFIG.region
}

function mimeTypeFromContentType(contentType: string | null): string {
  if (!contentType) return 'image/png'
  const base = contentType.split(';')[0]?.trim().toLowerCase()
  if (base === 'image/jpeg' || base === 'image/jpg' || base === 'image/webp' || base === 'image/png') {
    return base === 'image/jpg' ? 'image/jpeg' : base
  }
  return 'image/png'
}

/**
 * Downloads a temporary Ideogram CDN URL and persists it via saveGeneratedImage (S3 when configured).
 */
async function persistRemoteImageUrl(
  url: string,
  ctx: PersistContext
): Promise<PersistedImage> {
  const imageResponse = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'image/*' },
    signal: AbortSignal.timeout(IMAGE_GENERATION_DOWNLOAD_TIMEOUT_MS),
  })

  if (!imageResponse.ok) {
    throw new Error(`Failed to download Ideogram image: ${imageResponse.statusText}`)
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (buffer.length === 0) {
    throw new Error('Empty image received from Ideogram')
  }

  const mimeType = mimeTypeFromContentType(imageResponse.headers.get('content-type'))
  const extension = mimeType.split('/')[1] || 'png'
  const saveResult = await saveGeneratedImage(
    buffer.toString('base64'),
    ctx.workflowId,
    ctx.userId,
    mimeType
  )

  const imageFile: UserFile = {
    id: generateFileId(),
    name: `ideogram-${Date.now()}.${extension}`,
    url: saveResult.url,
    key: extractStorageKey(saveResult.url),
    size: buffer.length,
    type: mimeType,
    context: 'agent-generated-images',
  }

  logger.info(`[${ctx.requestId}] Persisted Ideogram image to storage`, {
    workflowId: ctx.workflowId,
    userId: ctx.userId,
    url: saveResult.url,
    s3UploadFailed: saveResult.s3UploadFailed,
  })

  return {
    url: saveResult.url,
    imageFile,
    s3UploadFailed: saveResult.s3UploadFailed,
  }
}

/**
 * Replaces temporary Ideogram URLs with durable storage URLs. Falls back to original URLs
 * when agent S3 is not configured and download/storage fails.
 */
async function persistImageUrlList(
  imageUrls: string[],
  ctx: PersistContext
): Promise<{
  imageUrls: string[]
  imageFiles: UserFile[]
  s3UploadFailed?: boolean
}> {
  if (imageUrls.length === 0) {
    return { imageUrls: [], imageFiles: [] }
  }

  const persistedUrls: string[] = []
  const imageFiles: UserFile[] = []
  let s3UploadFailed: boolean | undefined

  for (const url of imageUrls) {
    try {
      const persisted = await persistRemoteImageUrl(url, ctx)
      persistedUrls.push(persisted.url)
      imageFiles.push(persisted.imageFile)
      if (persisted.s3UploadFailed) {
        s3UploadFailed = true
      }
    } catch (error) {
      logger.error(`[${ctx.requestId}] Failed to persist Ideogram image`, {
        error: getErrorMessage(error),
        url: url.slice(0, 100),
      })
      if (isAgentS3Configured()) {
        throw new Error(
          `Failed to download Ideogram image for S3 storage: ${getErrorMessage(error)}`
        )
      }
      persistedUrls.push(url)
    }
  }

  return { imageUrls: persistedUrls, imageFiles, s3UploadFailed }
}

async function mapRemoveBackgroundOutput(data: Record<string, unknown>, ctx: PersistContext) {
  const images = Array.isArray(data.data)
    ? data.data.map((item) => {
        if (!isRecord(item)) {
          return { url: null, isImageSafe: false }
        }
        return {
          url: typeof item.url === 'string' ? item.url : null,
          isImageSafe: item.is_image_safe === true,
        }
      })
    : []
  const sourceUrls = images
    .map((image) => image.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
  const persisted = await persistImageUrlList(sourceUrls, ctx)

  let urlIndex = 0
  const remappedImages = images.map((image) => {
    if (typeof image.url !== 'string' || image.url.length === 0) {
      return image
    }
    const nextUrl = persisted.imageUrls[urlIndex] ?? image.url
    urlIndex += 1
    return { ...image, url: nextUrl }
  })

  return {
    created: typeof data.created === 'string' ? data.created : null,
    images: remappedImages,
    imageUrls: persisted.imageUrls,
    content: persisted.imageUrls[0] ?? '',
    image: persisted.imageFiles[0] ?? persisted.imageUrls[0] ?? '',
    imageUrl: persisted.imageUrls[0] ?? '',
    ...(persisted.imageFiles.length > 0 ? { imageFiles: persisted.imageFiles } : {}),
    ...(persisted.s3UploadFailed ? { s3UploadFailed: true } : {}),
  }
}

async function mapImagesOutput(data: Record<string, unknown>, ctx: PersistContext) {
  const { images, imageUrls } = mapIdeogramImages(data.data)
  const persisted = await persistImageUrlList(imageUrls, ctx)

  let urlIndex = 0
  const remappedImages = images.map((image) => {
    if (typeof image.url !== 'string' || image.url.length === 0) {
      return image
    }
    const nextUrl = persisted.imageUrls[urlIndex] ?? image.url
    urlIndex += 1
    return { ...image, url: nextUrl }
  })

  return {
    created: typeof data.created === 'string' ? data.created : null,
    images: remappedImages,
    imageUrls: persisted.imageUrls,
    content: persisted.imageUrls[0] ?? '',
    image: persisted.imageFiles[0] ?? persisted.imageUrls[0] ?? '',
    imageUrl: persisted.imageUrls[0] ?? '',
    responseType: typeof data.response_type === 'string' ? data.response_type : null,
    ...(persisted.imageFiles.length > 0 ? { imageFiles: persisted.imageFiles } : {}),
    ...(persisted.s3UploadFailed ? { s3UploadFailed: true } : {}),
  }
}

/**
 * Calls Ideogram Magic Prompt 4.0 to convert a text prompt into structured JSON.
 */
async function runIdeogramMagicPrompt(options: {
  apiKey: string
  textPrompt: string
  aspectRatio?: string
  requestId: string
}): Promise<{ jsonPrompt: unknown; aspectRatio: string }> {
  const response = await fetch(
    `${IDEOGRAM_API_BASE}${IDEOGRAM_OPERATION_PATHS.magic_prompt_v4.path}`,
    {
      method: 'POST',
      headers: {
        'Api-Key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text_prompt: options.textPrompt,
        ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      }),
    }
  )
  const data = await parseIdeogramResponse(response, options.requestId)
  return {
    jsonPrompt: data.json_prompt ?? null,
    aspectRatio: typeof data.aspect_ratio === 'string' ? data.aspect_ratio : '',
  }
}

/**
 * Resolves the Ideogram API key from the request body, falling back to IDEOGRAM_API_KEY.
 */
export function resolveIdeogramApiKey(provided: string | undefined): string {
  const fromBody = typeof provided === 'string' ? provided.trim() : ''
  if (fromBody.length > 0) {
    return fromBody
  }

  const fromEnv = getEnv('IDEOGRAM_API_KEY')?.trim()
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv
  }

  throw new Error(
    'Ideogram API key is required. Provide it on the block or set IDEOGRAM_API_KEY in the environment.'
  )
}

/**
 * Executes an Ideogram API operation after resolving any uploaded files.
 * Image-producing responses are downloaded and persisted to agent-generated storage (S3 when configured).
 */
export async function executeIdeogramOperation(
  body: IdeogramProxyBody,
  userId: string,
  requestId: string,
  workflowId = 'unknown',
  options?: { preResolvedImage?: ResolvedFile }
): Promise<Record<string, unknown>> {
  const operation = body.operation as IdeogramOperation
  const route = IDEOGRAM_OPERATION_PATHS[operation]
  const apiKey = resolveIdeogramApiKey(body.apiKey)
  const persistCtx: PersistContext = { workflowId, userId, requestId }

  const [
    resolvedImageFiles,
    maskFiles,
    imagesFiles,
    styleReferenceImages,
    characterReferenceImages,
    characterReferenceImagesMask,
  ] = await Promise.all([
    options?.preResolvedImage
      ? Promise.resolve([options.preResolvedImage])
      : resolveFiles(body.image, userId, requestId, logger),
    resolveFiles(body.mask, userId, requestId, logger),
    resolveFiles(body.images, userId, requestId, logger),
    resolveFiles(body.styleReferenceImages, userId, requestId, logger),
    resolveFiles(body.characterReferenceImages, userId, requestId, logger),
    resolveFiles(body.characterReferenceImagesMask, userId, requestId, logger),
  ])

  const imageFiles = resolvedImageFiles

  if (operation === 'poll_generation') {
    if (!body.generationId) {
      throw new Error('generationId is required')
    }
    const url = `${IDEOGRAM_API_BASE}${route.path.replace('{generation_id}', encodeURIComponent(body.generationId))}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Api-Key': apiKey },
    })
    const data = await parseIdeogramResponse(response, requestId)
    const mapped = await mapImagesOutput(data, persistCtx)
    return {
      generationId: typeof data.generation_id === 'string' ? data.generation_id : body.generationId,
      status: typeof data.status === 'string' ? data.status : '',
      ...mapped,
    }
  }

  if (operation === 'magic_prompt_v4') {
    if (!body.textPrompt) {
      throw new Error('textPrompt is required')
    }
    const magic = await runIdeogramMagicPrompt({
      apiKey,
      textPrompt: body.textPrompt,
      aspectRatio: body.aspectRatio,
      requestId,
    })
    return {
      jsonPrompt: magic.jsonPrompt,
      aspectRatio: magic.aspectRatio,
    }
  }

  let textPrompt = body.textPrompt
  let jsonPrompt = body.jsonPrompt
  let magicPromptUsed = false

  if (
    (operation === 'generate_v4' || operation === 'generate_v4_async') &&
    body.useMagicPrompt === true
  ) {
    if (jsonPrompt !== undefined && jsonPrompt !== null && jsonPrompt !== '') {
      logger.info(`[${requestId}] Skipping Magic Prompt because jsonPrompt was provided`)
    } else {
      if (!textPrompt || typeof textPrompt !== 'string' || textPrompt.trim().length === 0) {
        throw new Error('textPrompt is required when Magic Prompt is enabled')
      }
      const magic = await runIdeogramMagicPrompt({
        apiKey,
        textPrompt,
        aspectRatio: body.aspectRatio,
        requestId,
      })
      jsonPrompt = magic.jsonPrompt
      textPrompt = undefined
      magicPromptUsed = true
      logger.info(`[${requestId}] Magic Prompt converted text prompt to JSON prompt`)
    }
  }

  let url = `${IDEOGRAM_API_BASE}${route.path}`
  if (operation === 'generate_v4_async') {
    if (!body.webhookUrl) {
      throw new Error('webhookUrl is required')
    }
    url += `?webhook_url=${encodeURIComponent(body.webhookUrl)}`
  }

  const form = new FormData()

  switch (operation) {
    case 'generate_v4':
    case 'generate_v4_async': {
      appendFormField(form, 'text_prompt', textPrompt)
      appendFormField(form, 'json_prompt', jsonPrompt, { json: true })
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'enable_copyright_detection', body.enableCopyrightDetection)
      break
    }
    case 'remix_v4': {
      if (imageFiles.length === 0) throw new Error('image is required')
      if (!body.textPrompt) throw new Error('textPrompt is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendFormField(form, 'text_prompt', body.textPrompt)
      appendFormField(form, 'image_weight', body.imageWeight)
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'enable_copyright_detection', body.enableCopyrightDetection)
      break
    }
    case 'describe_v4': {
      if (imageFiles.length === 0) throw new Error('image is required')
      appendResolvedFile(form, 'image_file', imageFiles[0])
      appendFormField(form, 'include_bbox', body.includeBbox)
      break
    }
    case 'generate_v3': {
      if (!body.prompt) throw new Error('prompt is required')
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'aspect_ratio', body.aspectRatio)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'negative_prompt', body.negativePrompt)
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'style_type', body.styleType)
      appendFormField(form, 'style_preset', body.stylePreset)
      appendFormField(form, 'color_palette', body.colorPalette, { json: true })
      appendFormField(form, 'style_codes', body.styleCodes, { json: true })
      appendFormField(form, 'custom_model_uri', body.customModelUri)
      appendFormField(form, 'enable_copyright_detection', body.enableCopyrightDetection)
      appendResolvedFiles(form, 'style_reference_images', styleReferenceImages)
      appendResolvedFiles(form, 'character_reference_images', characterReferenceImages)
      appendResolvedFiles(form, 'character_reference_images_mask', characterReferenceImagesMask)
      break
    }
    case 'generate_transparent_v3': {
      if (!body.prompt) throw new Error('prompt is required')
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'upscale_factor', body.upscaleFactor)
      appendFormField(form, 'aspect_ratio', body.aspectRatio)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'negative_prompt', body.negativePrompt)
      appendFormField(form, 'num_images', body.numImages)
      break
    }
    case 'inpaint_v3': {
      if (imageFiles.length === 0) throw new Error('image is required')
      if (maskFiles.length === 0) throw new Error('mask is required')
      if (!body.prompt) throw new Error('prompt is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendResolvedFile(form, 'mask', maskFiles[0])
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'style_type', body.styleType)
      appendFormField(form, 'style_preset', body.stylePreset)
      appendFormField(form, 'color_palette', body.colorPalette, { json: true })
      appendFormField(form, 'style_codes', body.styleCodes, { json: true })
      appendResolvedFiles(form, 'style_reference_images', styleReferenceImages)
      appendResolvedFiles(form, 'character_reference_images', characterReferenceImages)
      appendResolvedFiles(form, 'character_reference_images_mask', characterReferenceImagesMask)
      break
    }
    case 'remix_v3': {
      if (imageFiles.length === 0) throw new Error('image is required')
      if (!body.prompt) throw new Error('prompt is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'image_weight', body.imageWeight)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'aspect_ratio', body.aspectRatio)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'negative_prompt', body.negativePrompt)
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'color_palette', body.colorPalette, { json: true })
      appendFormField(form, 'style_codes', body.styleCodes, { json: true })
      appendFormField(form, 'style_type', body.styleType)
      appendFormField(form, 'style_preset', body.stylePreset)
      appendResolvedFiles(form, 'style_reference_images', styleReferenceImages)
      appendResolvedFiles(form, 'character_reference_images', characterReferenceImages)
      appendResolvedFiles(form, 'character_reference_images_mask', characterReferenceImagesMask)
      break
    }
    case 'reframe_v3': {
      if (imageFiles.length === 0) throw new Error('image is required')
      if (!body.resolution) throw new Error('resolution is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'style_preset', body.stylePreset)
      appendFormField(form, 'color_palette', body.colorPalette, { json: true })
      appendFormField(form, 'style_codes', body.styleCodes, { json: true })
      appendResolvedFiles(form, 'style_reference_images', styleReferenceImages)
      break
    }
    case 'replace_background_v3': {
      if (imageFiles.length === 0) throw new Error('image is required')
      if (!body.prompt) throw new Error('prompt is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'rendering_speed', body.renderingSpeed)
      appendFormField(form, 'style_preset', body.stylePreset)
      appendFormField(form, 'color_palette', body.colorPalette, { json: true })
      appendFormField(form, 'style_codes', body.styleCodes, { json: true })
      appendResolvedFiles(form, 'style_reference_images', styleReferenceImages)
      break
    }
    case 'remove_background': {
      if (imageFiles.length === 0) throw new Error('image is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      break
    }
    case 'layerize_text': {
      if (imageFiles.length === 0) throw new Error('image is required')
      appendResolvedFile(form, 'image', imageFiles[0])
      appendFormField(form, 'prompt', body.prompt)
      appendFormField(form, 'seed', body.seed)
      break
    }
    case 'edit': {
      if (!body.prompt) throw new Error('prompt is required')
      appendFormField(form, 'prompt', body.prompt)
      appendResolvedFiles(form, 'images', imagesFiles)
      if (Array.isArray(body.imageUrls)) {
        for (const imageUrl of body.imageUrls) {
          if (typeof imageUrl === 'string' && imageUrl.trim()) {
            form.append('image_urls', imageUrl.trim())
          }
        }
      }
      appendFormField(form, 'num_images', body.numImages)
      appendFormField(form, 'seed', body.seed)
      appendFormField(form, 'magic_prompt', body.magicPrompt)
      appendFormField(form, 'resolution', body.resolution)
      appendFormField(form, 'aspect_ratio', body.aspectRatio)
      appendFormField(form, 'transparent_background', body.transparentBackground)
      break
    }
    case 'upscale': {
      if (imageFiles.length === 0) throw new Error('image is required')
      const imageRequest: Record<string, unknown> = {}
      if (body.prompt) imageRequest.prompt = body.prompt
      if (body.resemblance !== undefined) imageRequest.resemblance = body.resemblance
      if (body.detail !== undefined) imageRequest.detail = body.detail
      if (body.magicPromptOption) imageRequest.magic_prompt_option = body.magicPromptOption
      if (body.numImages !== undefined) imageRequest.num_images = body.numImages
      if (body.seed !== undefined) imageRequest.seed = body.seed
      form.append('image_request', JSON.stringify(imageRequest))
      appendResolvedFile(form, 'image_file', imageFiles[0])
      break
    }
    case 'describe': {
      if (imageFiles.length === 0) throw new Error('image is required')
      appendResolvedFile(form, 'image_file', imageFiles[0])
      appendFormField(form, 'describe_model_version', body.describeModelVersion)
      break
    }
    default: {
      throw new Error(`Unsupported Ideogram operation: ${operation}`)
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Api-Key': apiKey },
    body: form,
  })
  const data = await parseIdeogramResponse(response, requestId)

  switch (operation) {
    case 'generate_v4_async':
      return {
        generationId: typeof data.generation_id === 'string' ? data.generation_id : '',
        ...(magicPromptUsed ? { magicPromptUsed: true, jsonPrompt } : {}),
      }
    case 'describe_v4':
      return { jsonPrompt: data.json_prompt ?? null }
    case 'remove_background':
      return mapRemoveBackgroundOutput(data, persistCtx)
    case 'layerize_text': {
      const baseSource =
        typeof data.base_image_url === 'string' && data.base_image_url.length > 0
          ? data.base_image_url
          : null
      const originalSource =
        typeof data.original_image_url === 'string' && data.original_image_url.length > 0
          ? data.original_image_url
          : null
      const urlsToPersist = [baseSource, originalSource].filter(
        (url): url is string => typeof url === 'string'
      )
      const persisted = await persistImageUrlList(urlsToPersist, persistCtx)
      let nextIndex = 0
      const baseImageUrl = baseSource
        ? (persisted.imageUrls[nextIndex++] ?? baseSource)
        : ''
      const originalImageUrl = originalSource
        ? (persisted.imageUrls[nextIndex++] ?? originalSource)
        : null
      const textBlocks = Array.isArray(data.text_blocks)
        ? data.text_blocks
        : Array.isArray(data.textBlocks)
          ? data.textBlocks
          : []
      return {
        baseImageUrl,
        originalImageUrl,
        seed: typeof data.seed === 'number' ? data.seed : 0,
        textBlocks,
        ...(persisted.imageFiles[0]
          ? { image: persisted.imageFiles[0], imageUrl: baseImageUrl, content: baseImageUrl }
          : {}),
        ...(persisted.s3UploadFailed ? { s3UploadFailed: true } : {}),
      }
    }
    case 'describe':
      return {
        descriptions: Array.isArray(data.descriptions)
          ? data.descriptions.map((item) => ({
              text: isRecord(item) && typeof item.text === 'string' ? item.text : null,
            }))
          : [],
      }
    default: {
      const mapped = await mapImagesOutput(data, persistCtx)
      return {
        ...mapped,
        ...(magicPromptUsed ? { magicPromptUsed: true, jsonPrompt } : {}),
      }
    }
  }
}

async function parseIdeogramResponse(
  response: Response,
  requestId: string
): Promise<Record<string, unknown>> {
  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = { error: text }
    }
  }

  if (!response.ok) {
    const error =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.detail === 'string' && data.detail) ||
      `Ideogram API error (HTTP ${response.status})`
    logger.error(`[${requestId}] Ideogram API error`, {
      status: response.status,
      body: text.slice(0, 2000),
    })
    throw new Error(error)
  }

  return data
}

export function toIdeogramProxyErrorMessage(error: unknown): string {
  return getErrorMessage(error, 'Ideogram request failed')
}
