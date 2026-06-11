import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import {
  applyNanoBananaPromptImageParams,
  normalizeOptionalString,
} from '@/lib/image-generation/nano-banana-inputs'
import { resolveImageGenerationCount } from '@/lib/image-generation/resolve-image-count.server'
import { executeTool } from '@/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const logger = createLogger('ImageGenerationWrapperApi')

const INLINE_IMAGE_PAYLOAD_ERROR =
  'Image Generator request payload is too large or malformed. For 4K image generation with reference images, upload the reference image as a file or use an image URL instead of passing inline base64 image data.'

/**
 * Maximum number of concurrent base-tool executions per wrapper request.
 * Keep this low so that requesting N images does not amplify provider rate-limit pressure.
 */
const MAX_CONCURRENT_GENERATIONS = 2

interface ResolvedContext {
  workflowId?: string
}

const ImageGenerationWrapperSchema = z.object({
  baseToolId: z.enum(['openai_image', 'google_imagen', 'google_nano_banana', 'image_generate']),
  params: z.record(z.string(), z.unknown()),
})

type ToolResult = Awaited<ReturnType<typeof executeTool>>

/**
 * Run `task` over `count` invocations with bounded concurrency.
 * Preserves invocation order in the returned array.
 */
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

function hasReferenceImages(params: Record<string, unknown>): boolean {
  const inputImages = params.inputImages
  const inputImage = params.inputImage
  return (
    (Array.isArray(inputImages) && inputImages.length > 0) ||
    (inputImage !== undefined && inputImage !== null && inputImage !== '')
  )
}

function resolveExecutionToolId(
  baseToolId: z.infer<typeof ImageGenerationWrapperSchema>['baseToolId'],
  params: Record<string, unknown>
): 'openai_image' | 'google_imagen' | 'google_nano_banana' | 'image_generate' {
  if (baseToolId !== 'image_generate') {
    return baseToolId
  }

  const provider = getStringParam(params, 'provider') ?? 'openai'
  if (provider === 'openai' && hasReferenceImages(params)) {
    return 'image_generate'
  }
  if (provider === 'openai') {
    return 'openai_image'
  }
  if (provider === 'gemini') {
    return 'google_nano_banana'
  }
  return 'image_generate'
}

function buildExecutionParams(
  toolId: ReturnType<typeof resolveExecutionToolId>,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (toolId === 'google_nano_banana') {
    return {
      ...params,
      imageSize: params.imageSize ?? params.resolution,
    }
  }

  if (toolId === 'image_generate') {
    return {
      ...params,
      __skipSmartWrapper: true,
      __skipHostedKeyHandling: true,
    }
  }

  const { provider: _provider, ...openAIParams } = params
  return openAIParams
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

function isLikelyTruncatedJsonPayload(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('unterminated string in json') ||
    message.includes('unexpected end of json input')
  )
}

async function resolveRequestedImageCount(params: Record<string, unknown>): Promise<{
  imageCount: number
  promptImageUrl?: string
  singleImagePrompt?: string
  singleImagePrompts?: string[]
}> {
  const prompt = String(params.prompt ?? '').trim()

  if (!prompt) {
    return { imageCount: 1 }
  }

  const { imageCount, promptImageUrl, singleImagePrompt, singleImagePrompts } =
    await resolveImageGenerationCount({
      prompt,
    })

  return {
    imageCount: clampImageCount(imageCount),
    promptImageUrl,
    singleImagePrompt,
    singleImagePrompts,
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await checkInternalAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.error('Failed to parse image generation wrapper request body', {
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json(
        {
          success: false,
          error: isLikelyTruncatedJsonPayload(error)
            ? INLINE_IMAGE_PAYLOAD_ERROR
            : 'Invalid JSON request body',
        },
        { status: isLikelyTruncatedJsonPayload(error) ? 413 : 400 }
      )
    }
    const validated = ImageGenerationWrapperSchema.parse(body)
    const { imageCount, promptImageUrl, singleImagePrompt, singleImagePrompts } =
      await resolveRequestedImageCount(validated.params)
    const { imageCount: _imageCount, inputImageUrl, ...baseParams } = validated.params
    const inputImageWarning = normalizeOptionalString(validated.params.inputImageWarning)
    const promptToExecute =
      normalizeOptionalString(singleImagePrompt) ?? String(baseParams.prompt ?? '')
    const executionToolId = resolveExecutionToolId(validated.baseToolId, validated.params)
    const resolvedBaseParams = applyNanoBananaPromptImageParams({
      baseToolId: executionToolId,
      baseParams: {
        ...baseParams,
        ...(promptToExecute ? { prompt: promptToExecute } : {}),
      },
      inputImageUrl,
      inputImages: validated.params.inputImages,
      promptImageUrl,
    })

    if (inputImageWarning) {
      logger.warn('Image generation input warning', {
        baseToolId: executionToolId,
        warning: inputImageWarning,
      })
    }

    const resolvedContext = resolvedBaseParams._context as ResolvedContext | undefined

    logger.info('Executing image generation wrapper', {
      baseToolId: executionToolId,
      requestedBaseToolId: validated.baseToolId,
      imageCount,
      hasPromptImageUrl: Boolean(promptImageUrl),
      singleImagePromptsCount: singleImagePrompts?.length ?? 0,
      workflowId: resolvedContext?.workflowId,
      concurrency: Math.min(MAX_CONCURRENT_GENERATIONS, imageCount),
    })

    /**
     * Execute base-tool calls with bounded concurrency. allSettled lets a single failure
     * not discard sibling successful generations (which the user has already paid for).
     */
    const settled = await runWithConcurrency<PromiseSettledResult<ToolResult>>(
      imageCount,
      MAX_CONCURRENT_GENERATIONS,
      async (index) => {
        try {
          const promptForImage =
            normalizeOptionalString(singleImagePrompts?.[index]) ?? promptToExecute
          const result = await executeTool(executionToolId, {
            ...buildExecutionParams(executionToolId, resolvedBaseParams),
            ...(promptForImage ? { prompt: promptForImage } : {}),
          })
          return { status: 'fulfilled' as const, value: result }
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
      logger.error('All image generation attempts failed', {
        baseToolId: executionToolId,
        imageCount,
        failures: failureMessages,
      })
      return NextResponse.json(
        {
          success: false,
          error: failureMessages[0] || 'Image generation failed',
          failures: failureMessages,
        },
        { status: 500 }
      )
    }

    if (failureMessages.length > 0) {
      logger.warn('Partial image generation failure', {
        baseToolId: executionToolId,
        requested: imageCount,
        succeeded: successfulResults.length,
        failed: failureMessages.length,
      })
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
      getStringParam(firstOutput, 'provider') || getStringParam(outputMetadata, 'provider') || ''
    const model = getStringParam(firstOutput, 'model') || getStringParam(outputMetadata, 'model') || ''
    const falaiCostDollars = successfulResults.reduce((total, result) => {
      if (!isRecord(result.output)) return total
      const cost = result.output.__falaiCostDollars
      return typeof cost === 'number' && Number.isFinite(cost) ? total + cost : total
    }, 0)
    const falaiBilling = successfulResults
      .map((result) => (isRecord(result.output) ? result.output.__falaiBilling : undefined))
      .filter((billing) => billing !== undefined)
    const warnings = [
      ...getMetadataWarnings(outputMetadata),
      ...(inputImageWarning ? [inputImageWarning] : []),
      ...(failureMessages.length > 0
        ? [
            `Generated ${successfulResults.length} of ${imageCount} requested images; ${failureMessages.length} failed.`,
          ]
        : []),
    ]

    return NextResponse.json({
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
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(s3UploadFailed ? { s3UploadFailed } : {}),
        },
        ...(falaiCostDollars > 0 ? { __falaiCostDollars: falaiCostDollars } : {}),
        ...(falaiBilling.length > 0 ? { __falaiBilling: { requests: falaiBilling } } : {}),
        ...(s3UploadFailed ? { s3UploadFailed } : {}),
      },
    })
  } catch (error) {
    logger.error('Image generation wrapper request failed', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
