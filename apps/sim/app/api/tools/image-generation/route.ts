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

/**
 * Maximum number of concurrent base-tool executions per wrapper request.
 * Keep this low so that requesting N images does not amplify provider rate-limit pressure.
 */
const MAX_CONCURRENT_GENERATIONS = 2

interface ResolvedContext {
  workflowId?: string
}

const ImageGenerationWrapperSchema = z.object({
  baseToolId: z.enum(['openai_image', 'google_imagen', 'google_nano_banana']),
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

function extractImagesFromOutput(output: Record<string, unknown>): string[] {
  const images = output.images
  if (Array.isArray(images)) {
    return images.filter((image): image is string => typeof image === 'string' && image.length > 0)
  }

  const image = output.image
  if (typeof image === 'string' && image.length > 0) {
    return [image]
  }

  return []
}

function getOutputMetadata(output: Record<string, unknown>): Record<string, unknown> {
  return isRecord(output.metadata) ? output.metadata : {}
}

function getMetadataWarnings(metadata: Record<string, unknown>): string[] {
  const warnings = metadata.warnings
  if (!Array.isArray(warnings)) {
    return []
  }

  return warnings.filter((warning): warning is string => typeof warning === 'string' && warning.length > 0)
}

async function resolveRequestedImageCount(
  params: Record<string, unknown>
): Promise<{ imageCount: number; promptImageUrl?: string; singleImagePrompt?: string }> {
  const askedCount = clampImageCount(params.imageCount)
  const prompt = String(params.prompt ?? '').trim()

  if (!prompt) {
    return { imageCount: askedCount }
  }

  const { imageCount, promptImageUrl, singleImagePrompt } = await resolveImageGenerationCount({
    prompt,
    askedCount,
  })

  return {
    imageCount: clampImageCount(imageCount),
    promptImageUrl,
    singleImagePrompt,
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

    const body = await request.json()
    const validated = ImageGenerationWrapperSchema.parse(body)
    const { imageCount, promptImageUrl, singleImagePrompt } = await resolveRequestedImageCount(
      validated.params
    )
    const { imageCount: _imageCount, inputImageUrl, ...baseParams } = validated.params
    const inputImageWarning = normalizeOptionalString(validated.params.inputImageWarning)
    const promptToExecute = normalizeOptionalString(singleImagePrompt) ?? String(baseParams.prompt ?? '')
    const resolvedBaseParams = applyNanoBananaPromptImageParams({
      baseToolId: validated.baseToolId,
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
        baseToolId: validated.baseToolId,
        warning: inputImageWarning,
      })
    }

    const resolvedContext = resolvedBaseParams._context as ResolvedContext | undefined

    logger.info('Executing image generation wrapper', {
      baseToolId: validated.baseToolId,
      imageCount,
      hasPromptImageUrl: Boolean(promptImageUrl),
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
      async () => {
        try {
          const result = await executeTool(validated.baseToolId, { ...resolvedBaseParams })
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
        baseToolId: validated.baseToolId,
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
        baseToolId: validated.baseToolId,
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
        images,
        metadata: {
          ...outputMetadata,
          count: images.length,
          requested: imageCount,
          failed: failureMessages.length,
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(s3UploadFailed ? { s3UploadFailed } : {}),
        },
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
