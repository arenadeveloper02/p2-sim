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

const ImageGenerationWrapperSchema = z.object({
  baseToolId: z.enum(['openai_image', 'google_imagen', 'google_nano_banana']),
  params: z.record(z.string(), z.unknown()),
})

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

    logger.info('Executing image generation wrapper', {
      baseToolId: validated.baseToolId,
      imageCount,
      hasPromptImageUrl: Boolean(promptImageUrl),
      workflowId:
        (resolvedBaseParams._context as { workflowId?: string } | undefined)?.workflowId ?? undefined,
    })

    const results = await Promise.all(
      Array.from({ length: imageCount }, () => executeTool(validated.baseToolId, { ...resolvedBaseParams }))
    )

    const failedResult = results.find((result) => !result.success)
    if (failedResult) {
      return NextResponse.json(failedResult, { status: 500 })
    }

    const firstOutput = isRecord(results[0]?.output) ? results[0].output : {}
    const images = results.flatMap((result) =>
      isRecord(result.output) ? extractImagesFromOutput(result.output) : []
    )
    const s3UploadFailed = results.some((result) => {
      if (!isRecord(result.output)) return false
      return (
        result.output.s3UploadFailed === true || getOutputMetadata(result.output).s3UploadFailed === true
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
