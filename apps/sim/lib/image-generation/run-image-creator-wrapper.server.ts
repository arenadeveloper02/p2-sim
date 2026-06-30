import { createLogger } from '@sim/logger'
import { z } from 'zod'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import {
  applyNanoBananaPromptImageParams,
  normalizeOptionalString,
} from '@/lib/image-generation/nano-banana-inputs'
import { resolveImageCreatorIntent } from '@/lib/image-generation/resolve-image-creator-intent.server'

const logger = createLogger('ImageCreatorWrapper')

const MAX_CONCURRENT_GENERATIONS = 2

const ImageCreatorWrapperSchema = z.object({
  params: z.record(z.string(), z.unknown()),
})

export type ImageCreatorWrapperInput = z.infer<typeof ImageCreatorWrapperSchema>

export interface ImageCreatorWrapperSuccess {
  success: true
  output: Record<string, unknown>
}

export interface ImageCreatorWrapperFailure {
  success: false
  error: string
  failures?: string[]
  status: number
}

export type ImageCreatorWrapperResult = ImageCreatorWrapperSuccess | ImageCreatorWrapperFailure

type ToolResult = {
  success: boolean
  output?: Record<string, unknown>
  error?: string
}

function clampImageCount(value: unknown): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 1
  return Math.min(MAX_IMAGES_TO_GENERATE, Math.max(1, Math.round(numericValue)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractImageUrl(image: unknown): string | undefined {
  if (typeof image === 'string' && image.length > 0) {
    return image
  }

  if (isRecord(image) && typeof image.url === 'string' && image.url.length > 0) {
    return image.url
  }

  return undefined
}

function extractImagesFromOutput(output: Record<string, unknown>): string[] {
  const images = output.images
  if (Array.isArray(images)) {
    return images
      .map((image) => extractImageUrl(image))
      .filter((image): image is string => typeof image === 'string' && image.length > 0)
  }

  const image = extractImageUrl(output.image)
  if (image) {
    return [image]
  }

  const imageUrl = extractImageUrl(output.imageUrl)
  return imageUrl ? [imageUrl] : []
}

function getOutputMetadata(output: Record<string, unknown>): Record<string, unknown> {
  return isRecord(output.metadata) ? output.metadata : {}
}

function getStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function getMetadataWarnings(metadata: Record<string, unknown>): string[] {
  const warnings = metadata.warnings
  if (!Array.isArray(warnings)) {
    return []
  }

  return warnings.filter(
    (warning): warning is string => typeof warning === 'string' && warning.length > 0
  )
}

function hasReferenceImages(params: Record<string, unknown>): boolean {
  const inputImages = params.inputImages
  const inputImage = params.inputImage
  return (
    (Array.isArray(inputImages) && inputImages.length > 0) ||
    (inputImage !== undefined && inputImage !== null && inputImage !== '')
  )
}

async function runWithConcurrency<T>(
  count: number,
  concurrency: number,
  task: (index: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(count)
  let cursor = 0

  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= count) return
      results[index] = await task(index)
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Runs the Image Creator smart wrapper in-process for Gemini Nano Banana models.
 */
export async function runImageCreatorWrapper(
  input: ImageCreatorWrapperInput
): Promise<ImageCreatorWrapperResult> {
  const validated = ImageCreatorWrapperSchema.parse(input)
  const originalPrompt = String(validated.params.prompt ?? '').trim()
  const hasReferenceImage = hasReferenceImages(validated.params)

  const intent = await resolveImageCreatorIntent({
    prompt: originalPrompt,
    hasReferenceImage,
  })

  const imageCount = clampImageCount(intent.imageCount)
  const { inputImageUrl, ...baseParams } = validated.params
  const inputImageWarning = normalizeOptionalString(validated.params.inputImageWarning)

  const resolvedBaseParams = applyNanoBananaPromptImageParams({
    baseToolId: 'google_nano_banana',
    baseParams: {
      ...baseParams,
      provider: 'gemini',
      ...(originalPrompt ? { prompt: originalPrompt } : {}),
    },
    inputImageUrl,
    inputImages: validated.params.inputImages,
    promptImageUrl: intent.promptImageUrl,
  })

  if (inputImageWarning) {
    logger.warn('Image creator input warning', { warning: inputImageWarning })
  }

  logger.info('Executing image creator wrapper', {
    imageCount,
    mode: intent.mode,
    hasReferenceImage,
    hasPromptImageUrl: Boolean(intent.promptImageUrl),
    concurrency: Math.min(MAX_CONCURRENT_GENERATIONS, imageCount),
  })

  const { executeTool } = await import('@/tools')

  const settled = await runWithConcurrency<PromiseSettledResult<ToolResult>>(
    imageCount,
    MAX_CONCURRENT_GENERATIONS,
    async (index) => {
      try {
        const promptForImage =
          intent.singleImagePrompts[index] ?? intent.singleImagePrompt ?? originalPrompt
        const executionParams = {
          ...resolvedBaseParams,
          imageSize: resolvedBaseParams.imageSize ?? resolvedBaseParams.resolution,
          prompt: promptForImage,
          __skipSmartWrapper: true,
          __skipHostedKeyHandling: true,
        }

        const result = await executeTool('google_nano_banana', executionParams)
        return { status: 'fulfilled' as const, value: result as ToolResult }
      } catch (err) {
        return {
          status: 'rejected' as const,
          reason: err instanceof Error ? err : new Error(String(err)),
        }
      }
    }
  )

  const successfulResults: ToolResult[] = []
  const failureMessages: string[] = []

  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value.success) {
      successfulResults.push(item.value)
    } else if (item.status === 'fulfilled') {
      failureMessages.push(item.value.error || 'Image generation failed')
    } else {
      failureMessages.push(item.reason?.message || 'Image generation failed')
    }
  }

  if (successfulResults.length === 0) {
    return {
      success: false,
      error: failureMessages[0] || 'Image generation failed',
      failures: failureMessages,
      status: 500,
    }
  }

  const firstOutput = isRecord(successfulResults[0]?.output) ? successfulResults[0].output : {}
  const images = successfulResults.flatMap((result) =>
    isRecord(result.output) ? extractImagesFromOutput(result.output) : []
  )
  const s3UploadFailed = successfulResults.some((result) => {
    if (!isRecord(result.output)) return false
    return (
      result.output.s3UploadFailed === true ||
      getOutputMetadata(result.output).s3UploadFailed === true
    )
  })
    ? true
    : undefined

  const primaryImage = images[0] ?? ''
  const primaryContent =
    primaryImage ||
    (typeof firstOutput.content === 'string' && firstOutput.content.length > 0
      ? firstOutput.content
      : '')
  const outputMetadata = getOutputMetadata(firstOutput)
  const provider =
    getStringParam(firstOutput, 'provider') || getStringParam(outputMetadata, 'provider') || 'gemini'
  const model =
    getStringParam(firstOutput, 'model') || getStringParam(outputMetadata, 'model') || ''
  const warnings = [
    ...getMetadataWarnings(outputMetadata),
    ...(inputImageWarning ? [inputImageWarning] : []),
    ...(failureMessages.length > 0
      ? [
          `Generated ${successfulResults.length} of ${imageCount} requested images; ${failureMessages.length} failed.`,
        ]
      : []),
  ]

  return {
    success: true,
    output: {
      content: primaryContent,
      image: primaryImage,
      imageUrl: primaryImage,
      images,
      provider,
      model,
      metadata: {
        ...outputMetadata,
        provider,
        model,
        count: images.length,
        requested: imageCount,
        failed: failureMessages.length,
        mode: intent.mode,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(s3UploadFailed ? { s3UploadFailed } : {}),
      },
      ...(s3UploadFailed ? { s3UploadFailed } : {}),
    },
  }
}
