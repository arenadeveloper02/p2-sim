import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
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

async function resolveRequestedImageCount(params: Record<string, unknown>): Promise<number> {
  const askedCount = clampImageCount(params.imageCount)
  const prompt = String(params.prompt ?? '').trim()

  if (!prompt) {
    return askedCount
  }

  const { imageCount } = await resolveImageGenerationCount({
    prompt,
    askedCount,
  })

  return clampImageCount(imageCount)
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
    const imageCount = await resolveRequestedImageCount(validated.params)
    const { imageCount: _imageCount, ...baseParams } = validated.params

    logger.info('Executing image generation wrapper', {
      baseToolId: validated.baseToolId,
      imageCount,
      workflowId:
        (baseParams._context as { workflowId?: string } | undefined)?.workflowId ?? undefined,
    })

    const results = await Promise.all(
      Array.from({ length: imageCount }, () => executeTool(validated.baseToolId, { ...baseParams }))
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

    return NextResponse.json({
      success: true,
      output: {
        content: primaryContent,
        image: primaryImage,
        images,
        metadata: {
          ...getOutputMetadata(firstOutput),
          count: images.length,
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
