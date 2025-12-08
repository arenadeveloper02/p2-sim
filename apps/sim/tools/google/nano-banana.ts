import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('NanoBananaTool')

interface NanoBananaRequestBody {
  contents: Array<{
    parts: Array<{
      text?: string
      inlineData?: {
        mimeType: string
        data: string
      }
    }>
  }>
  generationConfig?: {
    imageConfig?: {
      aspectRatio?: string
    }
    responseModalities?: string[]
  }
}

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
    url: (params) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent`
      logger.info('Nano Banana API URL:', url)
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
    body: async (params) => {
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
        {
          text: params.prompt,
        },
      ]

      // Add input image if provided
      if (params.inputImage) {
        let imageData: string
        let mimeType: string

        // Handle file object with path
        if (typeof params.inputImage === 'object' && params.inputImage.path) {
          try {
            // Fetch the file content from the path
            const baseUrl = getBaseUrl()
            const fileUrl = params.inputImage.path.startsWith('http')
              ? params.inputImage.path
              : `${baseUrl}${params.inputImage.path}`
            logger.info('Fetching image from URL:', fileUrl)
            const response = await fetch(fileUrl)
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.statusText}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            imageData = buffer.toString('base64')
            mimeType = params.inputImage.type || params.inputImageMimeType || 'image/png'
            logger.info('Successfully converted image to base64, length:', imageData.length)
          } catch (error) {
            logger.error('Error fetching image:', error)
            throw new Error(
              `Failed to process input image: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          }
        } else if (typeof params.inputImage === 'string') {
          // Direct base64 string
          imageData = params.inputImage
          mimeType = params.inputImageMimeType || 'image/png'
        } else {
          throw new Error('Invalid input image format')
        }

        parts.push({
          inlineData: {
            mimeType,
            data: imageData,
          },
        })
      }

      const body: NanoBananaRequestBody = {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          responseModalities: ['Image'],
        },
      }

      // Add aspect ratio if specified
      if (params.aspectRatio) {
        body.generationConfig!.imageConfig = {
          aspectRatio: params.aspectRatio,
        }
      }

      logger.info('Nano Banana API request body:', JSON.stringify(body, null, 2))
      return body
    },
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

      const data: NanoBananaResponse = await response.json()

      logger.info('Raw Nano Banana API response:', JSON.stringify(data, null, 2))

      if (!data.candidates || data.candidates.length === 0) {
        logger.error('No candidates found in Nano Banana response:', data)
        throw new Error('No candidates found in response')
      }

      const candidate = data.candidates[0]
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
