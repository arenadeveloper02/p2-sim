import { createLogger } from '@sim/logger'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { IMAGE_GENERATION_PROVIDER_TIMEOUT_MS } from '@/lib/image-generation/constants'
import { saveGeneratedImage } from '@/lib/uploads/utils/image-storage.server'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('ImagenTool')

function getObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.keys(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function collectImagenImages(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data)) {
    return []
  }

  const images: Record<string, unknown>[] = []
  const appendImages = (items: Record<string, unknown>[]) => {
    for (const item of items) {
      const nestedGeneratedImages = asRecordArray(item.generatedImages)
      if (nestedGeneratedImages.length > 0) {
        images.push(...nestedGeneratedImages)
      } else {
        images.push(item)
      }
    }
  }

  appendImages(asRecordArray(data.predictions))
  appendImages(asRecordArray(data.generatedImages))
  appendImages(asRecordArray(data.generated_images))
  appendImages(asRecordArray(data.images))
  appendImages(asRecordArray(data.data))

  return images
}

function getStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function extractBase64Image(generatedImage: Record<string, unknown>): string | undefined {
  const directImage =
    getStringField(generatedImage, 'bytesBase64Encoded') ??
    getStringField(generatedImage, 'imageBytes') ??
    getStringField(generatedImage, 'image') ??
    getStringField(generatedImage, 'b64_json') ??
    getStringField(generatedImage, 'bytes') ??
    getStringField(generatedImage, 'data')

  if (directImage) {
    return directImage
  }

  const nestedImage = generatedImage.image
  if (!isRecord(nestedImage)) {
    return undefined
  }

  return (
    getStringField(nestedImage, 'bytesBase64Encoded') ??
    getStringField(nestedImage, 'imageBytes') ??
    getStringField(nestedImage, 'bytes') ??
    getStringField(nestedImage, 'data')
  )
}

export interface ImagenRequestBody {
  instances: Array<{
    prompt: string
  }>
  parameters: {
    sampleCount?: number
    imageSize?: string
    aspectRatio?: string
    personGeneration?: string
  }
}

export interface ImagenResponse {
  predictions: Array<{
    generatedImages: Array<{
      imageBytes: string
    }>
  }>
}

export const imagenTool: ToolConfig = {
  id: 'google_imagen',
  name: 'Google Imagen',
  description: "Generate images using Google's Imagen models",
  version: '1.0.0',

  params: {
    model: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description:
        'The Imagen model to use (imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001, or imagen-3.0-generate-002)',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'A text description of the desired image (max 480 tokens)',
    },
    imageSize: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The size of the generated image (1K or 2K)',
    },
    aspectRatio: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The aspect ratio of the generated image (1:1, 3:4, 4:3, 9:16, 16:9)',
    },
    personGeneration: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Person generation setting (dont_allow, allow_adult, allow_all)',
    },
  },

  request: {
    timeout: IMAGE_GENERATION_PROVIDER_TIMEOUT_MS,
    url: (params) => {
      // Try the Generative Language API first
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:predict`
      logger.info('Imagen API URL:', url)
      return url
    },
    method: 'POST',
    headers: () => {
      const apiKey = getRotatingApiKey('google')
      return {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      }
    },
    body: (params) => {
      // Try a simpler request format first
      const body: ImagenRequestBody = {
        instances: [
          {
            prompt: params.prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
        },
      }

      // Add optional parameters only if they exist
      if (params.imageSize) {
        body.parameters.imageSize = params.imageSize
      }
      if (params.aspectRatio) {
        body.parameters.aspectRatio = params.aspectRatio
      }
      if (params.personGeneration) {
        body.parameters.personGeneration = params.personGeneration
      }

      logger.info('Imagen API request', {
        model: params.model,
        promptLength: typeof params.prompt === 'string' ? params.prompt.length : 0,
        sampleCount: body.parameters.sampleCount ?? 1,
        imageSize: body.parameters.imageSize ?? null,
        aspectRatio: body.parameters.aspectRatio ?? null,
        personGeneration: body.parameters.personGeneration ?? null,
      })
      return body
    },
  },

  transformResponse: async (response, params) => {
    try {
      // Check if response is ok first
      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Imagen API error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        })
        throw new Error(
          `Imagen API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const data = await response.json()

      logger.info('Imagen API response received', {
        topLevelKeys: getObjectKeys(data),
        predictionsCount: Array.isArray(data?.predictions) ? data.predictions.length : 0,
      })

      const generatedImages = collectImagenImages(data)

      if (generatedImages.length === 0) {
        logger.error('No generated images found in Imagen response', {
          topLevelKeys: getObjectKeys(data),
          predictionsCount: Array.isArray(data.predictions) ? data.predictions.length : 0,
          generatedImagesCount: Array.isArray(data.generatedImages)
            ? data.generatedImages.length
            : 0,
          imagesCount: Array.isArray(data.images) ? data.images.length : 0,
          dataCount: Array.isArray(data.data) ? data.data.length : 0,
        })
        throw new Error('No generated images found in response')
      }

      // Get the first generated image
      const generatedImage = generatedImages[0]
      logger.info('Imagen first generated image received', {
        generatedImageKeys: getObjectKeys(generatedImage),
      })

      const base64Image = extractBase64Image(generatedImage)

      if (!base64Image) {
        logger.error('No image bytes found in generated Imagen image', {
          generatedImageKeys: getObjectKeys(generatedImage),
        })
        throw new Error('No image bytes found in generated image')
      }

      logger.info('Successfully received Imagen image, length:', base64Image.length)

      // Use session user for path when present so path reflects who triggered the run
      const workflowId = params?._context?.workflowId || 'unknown'
      const userId = params?._context?.sessionUserId ?? params?._context?.userId ?? 'unknown'

      let finalImageUrl: string | null = null
      let s3UploadFailed: boolean | undefined
      try {
        const mimeType = 'image/png'
        const saveResult = await saveGeneratedImage(base64Image, workflowId, userId, mimeType)
        finalImageUrl = saveResult.url
        s3UploadFailed = saveResult.s3UploadFailed
        logger.info(`Successfully saved Imagen image to storage: ${finalImageUrl}`)
      } catch (error) {
        logger.error('Error saving Imagen image to storage:', error)
        logger.warn('Falling back to base64 image data URL due to storage error')
      }

      const imageUrlToReturn =
        finalImageUrl || (base64Image ? `data:image/png;base64,${base64Image}` : '')

      return {
        success: true,
        output: {
          content: finalImageUrl || 'imagen-generated-image',
          image: imageUrlToReturn,
          images: imageUrlToReturn ? [imageUrlToReturn] : [],
          metadata: {
            model: params?.model || 'imagen-4.0-generate-001',
            numberOfImages: generatedImages.length,
            stored: !!finalImageUrl,
            s3UploadFailed,
          },
          s3UploadFailed,
        },
      }
    } catch (error) {
      logger.error('Error in Imagen response handling:', error)
      throw error
    }
  },

  outputs: {
    content: { type: 'string', description: 'Image URL or identifier' },
    image: {
      type: 'file',
      description: 'Generated image (URL in S3/local storage or base64)',
    },
    images: {
      type: 'array',
      description: 'Generated images (URLs in S3/local storage or base64)',
      items: { type: 'file', description: 'Generated image' },
    },
    metadata: {
      type: 'json',
      description: 'Generation metadata (model, count, storage status, etc.)',
    },
  },
}
