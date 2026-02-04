// import { getBaseUrl } from '@/lib/core/utils/urls'
import { createLogger } from '@sim/logger'
import type { NanoBananaRequestBody } from '@/app/api/google/api-service'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('NanoBananaTool')

interface NanoBananaResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }>
}

const nanoBananaTool: ToolConfig = {
  id: 'google_nano_banana',
  name: 'Google Nano Banana',
  description: "Generate images using Google's Gemini Native Image (Nano Banana) model",
  version: '1.0.0',

  params: {
    model: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The Nano Banana model to use (gemini-2.5-flash-image)',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'A text description of the desired image',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'The aspect ratio of the generated image (1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9)',
    },
    inputImage: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Base64 encoded input image for editing (optional)',
    },
    inputImageMimeType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'MIME type of the input image (image/png, image/jpeg, etc.)',
    },
  },

  request: {
    timeout: 120000,
    url: (params) => {
      logger.info('Routing Nano Banana tool request through internal API')
      return '/api/google'
    },
    method: 'POST',
    headers: () => {
      return {
        'Content-Type': 'application/json',
      }
    },
    body: async (params) => ({
      model: params.model,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      inputImage: params.inputImage,
      inputImageMimeType: params.inputImageMimeType,
    }),
  },

  transformResponse: async (response, params) => {
    try {
      // Check if response is ok first
      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Nano Banana API error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        })
        throw new Error(
          `Nano Banana API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const dt: any = await response.json()

      if (!dt.data?.candidates || dt.data?.candidates.length === 0) {
        logger.error('No candidates found in Nano Banana response:', dt.data?.candidates)
        throw new Error('No candidates found in response')
      }

      const candidate = dt.data?.candidates[0]
      if (!candidate.content || !candidate.content.parts) {
        logger.error('No content parts found in candidate:', candidate)
        throw new Error('No content parts found in candidate')
      }

      // Find the image part
      let base64Image = null
      let mimeType = 'image/png'

      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          base64Image = part.inlineData.data
          mimeType = part.inlineData.mimeType || 'image/png'
          logger.info('Found image data in part, MIME type:', mimeType)
          break
        }
      }

      if (!base64Image) {
        logger.error('No image data found in response parts:', candidate.content.parts)
        throw new Error('No image data found in response')
      }

      logger.info('Successfully received Nano Banana image, length:', base64Image.length)

      return {
        success: true,
        output: {
          content: 'nano-banana-generated-image',
          image: base64Image,
          metadata: {
            model: params?.model || 'gemini-2.5-flash-image',
            mimeType: mimeType,
            aspectRatio: params?.aspectRatio || '1:1',
            imageSize: params?.imageSize ?? null,
            hasInputImage: !!(params?.inputImage && params?.inputImageMimeType),
            inputImageMimeType: params?.inputImageMimeType || null,
          },
        },
      }
    } catch (error) {
      logger.error('Error in Nano Banana response handling:', error)
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
            mimeType: { type: 'string', description: 'Image MIME type' },
            aspectRatio: { type: 'string', description: 'Image aspect ratio' },
            imageSize: {
              type: 'string',
              description: 'Output resolution (1K/2K/4K) when using Nano Banana Pro',
            },
            hasInputImage: {
              type: 'boolean',
              description: 'Whether an input image was provided for editing',
            },
            inputImageMimeType: {
              type: 'string',
              description: 'MIME type of the input image (if provided)',
            },
          },
        },
      },
    },
  },
}

export { nanoBananaTool }
export type { NanoBananaRequestBody, NanoBananaResponse }
