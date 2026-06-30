import { isUserFile } from '@/lib/core/utils/user-file'
import { IMAGE_GENERATION_PROVIDER_TIMEOUT_MS } from '@/lib/image-generation/constants'
import { sanitizeImageGenerationWrapperParams } from '@/lib/image-generation/nano-banana-inputs'
import type { ImageGenerationParams, ImageGenerationResponse } from '@/tools/image/types'
import type { ToolConfig } from '@/tools/types'

interface ImageCreatorRuntimeParams extends ImageGenerationParams {
  _context?: { workspaceId?: string; workflowId?: string; executionId?: string }
  __usingHostedKey?: boolean
  __skipSmartWrapper?: boolean
  workspaceId?: string
  workflowId?: string
  executionId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractImageUrl(image: unknown): string {
  if (typeof image === 'string') {
    return image
  }

  if (isRecord(image) && typeof image.url === 'string') {
    return image.url
  }

  return ''
}

function toImageFile(image: unknown, contentType = 'image/png') {
  if (isUserFile(image)) {
    return image
  }

  const imageUrl = extractImageUrl(image)
  if (!imageUrl) {
    return ''
  }

  const name =
    isRecord(image) && typeof image.name === 'string' && image.name.trim().length > 0
      ? image.name
      : 'generated-image.png'
  const mimeType =
    isRecord(image) && typeof image.mimeType === 'string' && image.mimeType.trim().length > 0
      ? image.mimeType
      : contentType

  return {
    name,
    url: imageUrl,
    mimeType,
  }
}

function normalizeImagesOutput(
  images: unknown[] | undefined,
  primaryImage: unknown,
  contentType?: string
) {
  if (Array.isArray(images) && images.length > 0) {
    return images.map((image) => toImageFile(image, contentType))
  }

  const primary = toImageFile(primaryImage, contentType)
  return primary ? [primary] : []
}

export const imageCreatorTool: ToolConfig<ImageGenerationParams, ImageGenerationResponse> = {
  id: 'image_creator',
  name: 'Image Creator',
  description:
    'Generate, edit, or create variations of images using Google Gemini Nano Banana models with smart prompt interpretation',
  version: '1.0.0',

  params: {
    model: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Gemini Nano Banana model ID',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Text prompt describing the image to generate, edit, or vary',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Aspect ratio, such as 1:1, 16:9, or 9:16',
    },
    resolution: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Output resolution: 0.5K, 1K, 2K, or 4K depending on model',
    },
    inputImage: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Reference image for editing or variation',
    },
    inputImages: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Multiple reference images for fusion on Nano Banana Pro',
    },
    inputImageUrl: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Reference image URLs or refs',
    },
    inputImageUrls: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Multiple reference image URLs or refs',
    },
    inputImageMimeType: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'MIME type of input image',
    },
    inputImageWarning: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description:
        'Warning emitted when multiple input images were provided and the latest one was used',
    },
  },

  request: {
    url: '/api/tools/image-creator',
    method: 'POST',
    timeout: IMAGE_GENERATION_PROVIDER_TIMEOUT_MS,
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: ImageCreatorRuntimeParams) => ({
      params: sanitizeImageGenerationWrapperParams({
        provider: 'gemini',
        model: params.model,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        inputImage: params.inputImage,
        inputImages: params.inputImages,
        inputImageUrl: params.inputImageUrl,
        inputImageUrls: params.inputImageUrls,
        inputImageMimeType: params.inputImageMimeType,
        inputImageWarning: params.inputImageWarning,
        workspaceId: params._context?.workspaceId ?? params.workspaceId,
        workflowId: params._context?.workflowId ?? params.workflowId,
        executionId: params._context?.executionId ?? params.executionId,
        _context: params._context,
      } as Record<string, unknown>),
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as {
      success?: boolean
      error?: string
      output?: Partial<ImageGenerationResponse['output']> & {
        image?: unknown
        images?: unknown[]
        s3UploadFailed?: boolean
      }
    }

    if (!response.ok || data.error || data.success === false) {
      return {
        success: false,
        error: data.error || 'Image creation failed',
        output: {
          content: '',
          image: '',
          images: [],
          imageUrl: '',
          provider: 'gemini',
          model: '',
          metadata: {
            provider: 'gemini',
            model: '',
          },
        },
      }
    }

    const output = data.output ?? {}
    const contentType = output.metadata?.contentType || 'image/png'
    const imageUrl =
      typeof output.imageUrl === 'string'
        ? output.imageUrl
        : extractImageUrl(output.image) || extractImageUrl(output.images?.[0])
    const image = toImageFile(output.image ?? imageUrl, contentType)
    const images = normalizeImagesOutput(output.images, image, contentType)
    const metadata = output.metadata ?? { provider: 'gemini', model: '' }

    return {
      success: true,
      output: {
        content: output.content || imageUrl || 'image-creator',
        image: image || images[0] || '',
        images,
        imageUrl,
        provider: output.provider || metadata.provider || 'gemini',
        model: output.model || metadata.model || '',
        metadata: {
          ...metadata,
          provider: output.provider || metadata.provider || 'gemini',
          model: output.model || metadata.model || '',
        },
        s3UploadFailed: output.s3UploadFailed,
      },
    }
  },

  outputs: {
    content: { type: 'string', description: 'Generated image URL or identifier' },
    image: { type: 'file', description: 'Primary generated image file' },
    images: {
      type: 'array',
      description: 'All generated image files when multiple images were requested',
      items: { type: 'file', description: 'Generated image file' },
    },
    imageUrl: { type: 'string', description: 'Generated image URL' },
    provider: { type: 'string', description: 'Provider used' },
    model: { type: 'string', description: 'Model used' },
    metadata: {
      type: 'json',
      description: 'Generation metadata',
      properties: {
        provider: { type: 'string', description: 'Provider used' },
        model: { type: 'string', description: 'Model used' },
        count: { type: 'number', description: 'Number of images returned', optional: true },
        requested: { type: 'number', description: 'Number of images requested', optional: true },
        failed: { type: 'number', description: 'Number of failed generations', optional: true },
        mode: {
          type: 'string',
          description: 'Resolved intent mode: generate, edit, or variation',
          optional: true,
        },
        warnings: {
          type: 'array',
          description: 'Warnings emitted during generation',
          items: { type: 'string', description: 'Warning message' },
          optional: true,
        },
        s3UploadFailed: {
          type: 'boolean',
          description: 'Whether storage upload failed for any image',
          optional: true,
        },
      },
    },
  },
}
