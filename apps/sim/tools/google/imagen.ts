import { createLogger } from '@sim/logger'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('ImagenTool')

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
    timeout: 120000,
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

      logger.info('Imagen API request body:', JSON.stringify(body, null, 2))
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

      logger.info('Raw Imagen API response:', JSON.stringify(data, null, 2))

      // Handle different possible response structures
      let generatedImages = []

      if (data.predictions && data.predictions.length > 0) {
        // REST API format - predictions array contains the images directly
        generatedImages = data.predictions
        logger.info('Found predictions array with', generatedImages.length, 'images')
      } else if (data.generatedImages) {
        // Direct SDK format
        generatedImages = data.generatedImages
      } else if (data.generated_images) {
        // Alternative format
        generatedImages = data.generated_images
      } else if (data.images) {
        // Another possible format
        generatedImages = data.images
      } else if (data.data) {
        // Direct data format
        generatedImages = data.data
      }

      logger.info('Extracted generatedImages:', generatedImages)

      if (generatedImages.length === 0) {
        logger.error('No generated images found in response. Full response structure:', {
          keys: Object.keys(data),
          predictions: data.predictions,
          generatedImages: data.generatedImages,
          images: data.images,
          data: data.data,
        })
        throw new Error('No generated images found in response')
      }

      // Get the first generated image
      const generatedImage = generatedImages[0]
      logger.info('First generated image structure:', JSON.stringify(generatedImage, null, 2))

      let base64Image = null

      // Handle different image data formats
      if (generatedImage.bytesBase64Encoded) {
        base64Image = generatedImage.bytesBase64Encoded
      } else if (generatedImage.imageBytes) {
        base64Image = generatedImage.imageBytes
      } else if (generatedImage.image) {
        base64Image = generatedImage.image
      } else if (generatedImage.b64_json) {
        base64Image = generatedImage.b64_json
      } else if (generatedImage.bytes) {
        base64Image = generatedImage.bytes
      } else if (generatedImage.data) {
        base64Image = generatedImage.data
      }

      if (!base64Image) {
        logger.error('No image bytes found in generated image:', generatedImage)
        throw new Error('No image bytes found in generated image')
      }

      logger.info('Successfully received Imagen image, length:', base64Image.length)

      return {
        success: true,
        output: {
          content: 'imagen-generated-image',
          image: base64Image,
          metadata: {
            model: params?.model || 'imagen-4.0-generate-001',
            numberOfImages: generatedImages.length,
          },
        },
      }
    } catch (error) {
      logger.error('Error in Imagen response handling:', error)
      throw error
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Generated image data',
      properties: {
        content: { type: 'string', description: 'Image identifier' },
        image: { type: 'string', description: 'Base64 encoded image data' },
        metadata: {
          type: 'object',
          description: 'Image generation metadata',
          properties: {
            model: { type: 'string', description: 'Model used for image generation' },
            numberOfImages: { type: 'number', description: 'Number of images generated' },
          },
        },
      },
    },
  },
}
