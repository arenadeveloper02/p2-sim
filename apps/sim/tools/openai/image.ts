import { createLogger } from '@sim/logger'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { S3_AGENT_GENERATED_IMAGES_CONFIG } from '@/lib/uploads/config'
import { saveGeneratedImage } from '@/lib/uploads/utils/image-storage.server'
import type { BaseImageRequestBody } from '@/tools/openai/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('ImageTool')

export const imageTool: ToolConfig = {
  id: 'openai_image',
  name: 'Image Generator',
  description: "Generate images using OpenAI's Image models",
  version: '1.0.0',

  params: {
    model: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The model to use (gpt-image-1 or dall-e-3)',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'A text description of the desired image',
    },
    size: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The size of the generated images (1024x1024, 1024x1792, or 1792x1024)',
    },
    quality: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'The quality of the image (standard or hd)',
    },
    style: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'The style of the image (vivid or natural)',
    },
    background: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'The background color, only for gpt-image-1',
    },
    n: {
      type: 'number',
      required: false,
      visibility: 'hidden',
      description: 'The number of images to generate (1-10)',
    },
  },

  request: {
    url: 'https://api.openai.com/v1/images/generations',
    method: 'POST',
    timeout: 120000,
    headers: () => {
      const apiKey = getRotatingApiKey('openai')
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
    },
    body: (params) => {
      const body: BaseImageRequestBody = {
        model: params.model,
        prompt: params.prompt,
        size: params.size || '1024x1024',
        n: params.n ? Number(params.n) : 1,
      }

      // Add model-specific parameters
      if (params.model === 'dall-e-3') {
        if (params.quality) body.quality = params.quality
        if (params.style) body.style = params.style
      } else if (params.model === 'gpt-image-1') {
        if (params.background) body.background = params.background
      }

      return body
    },
  },

  transformResponse: async (response, params) => {
    try {
      const data = await response.json()

      const sanitizedData = JSON.parse(JSON.stringify(data))
      if (sanitizedData.data && Array.isArray(sanitizedData.data)) {
        sanitizedData.data.forEach((item: { b64_json?: string }) => {
          if (item.b64_json) {
            item.b64_json = `[base64 data truncated, length: ${item.b64_json.length}]`
          }
        })
      }

      const modelName = params?.model || 'dall-e-3'
      let imageUrl: string | null = null
      let base64Image: string | null = null

      if (data.data?.[0]?.url) {
        imageUrl = data.data[0].url
        logger.info('Found image URL in response for DALL-E 3', { imageUrl: imageUrl.substring(0, 100) })
      } else if (data.data?.[0]?.b64_json) {
        base64Image = data.data[0].b64_json
        logger.info(
          'Found base64 encoded image in response for GPT-Image-1',
          `length: ${base64Image.length}`
        )
      } else {
        logger.error('No image data found in API response:', data)
        throw new Error('No image data found in response')
      }

      // Preserve the original imageUrl before any processing
      const originalImageUrl = imageUrl

      // Get workflowId and userId from params context
      const workflowId = params?._context?.workflowId || 'unknown'
      const userId = params?._context?.userId || 'unknown'

      logger.info('Image generation context:', {
        workflowId,
        userId,
        hasImageUrl: !!imageUrl,
        hasBase64Image: !!base64Image,
        originalImageUrl: originalImageUrl ? originalImageUrl.substring(0, 100) : null,
      })

      let finalImageUrl: string | null = null

      if (imageUrl && !base64Image) {
        try {
          logger.info('Downloading image from DALL-E URL for storage...', {
            imageUrl: imageUrl.substring(0, 100),
          })
          // Fetch the image directly
          const imageResponse = await fetch(imageUrl, {
            cache: 'no-store',
            headers: {
              Accept: 'image/*',
            },
          })

          if (!imageResponse.ok) {
            logger.error('Failed to fetch image:', imageResponse.status, imageResponse.statusText)
            throw new Error(`Failed to fetch image: ${imageResponse.statusText}`)
          }

          const arrayBuffer = await imageResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          
          if (buffer.length === 0) {
            logger.error('Empty image buffer received')
            throw new Error('Empty image received')
          }

          base64Image = buffer.toString('base64')
          logger.info('Download from temporary storage completed', {
            base64Length: base64Image.length,
          })
        } catch (error) {
          logger.error('Error downloading image from URL:', {
            error: error instanceof Error ? error.message : String(error),
            imageUrl: imageUrl ? imageUrl.substring(0, 100) : 'null',
            originalImageUrl: originalImageUrl ? originalImageUrl.substring(0, 100) : 'null',
          })
          const agentS3Configured =
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.region
          if (agentS3Configured) {
            throw new Error(
              `Failed to download image from OpenAI temporary URL for S3 storage: ${error instanceof Error ? error.message : String(error)}`
            )
          }
          imageUrl = originalImageUrl
        }
      }

      // Save image to storage and get URL
      if (base64Image) {
        try {
          // Determine MIME type from base64 header or default to png
          let mimeType = 'image/png'
          if (base64Image.startsWith('/9j/') || base64Image.startsWith('iVBORw0KGgo')) {
            mimeType = base64Image.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
          }

          const agentS3Configured =
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.region
          if (agentS3Configured) {
            logger.info('S3 upload started', { workflowId, userId, mimeType })
          }
          finalImageUrl = await saveGeneratedImage(base64Image, workflowId, userId, mimeType)
          if (agentS3Configured && finalImageUrl) {
            logger.info('S3 URL returned', { url: finalImageUrl })
          }
          logger.info(`Successfully saved generated image to storage: ${finalImageUrl}`)
        } catch (error) {
          logger.error('Error saving generated image to storage:', {
            error: error instanceof Error ? error.message : String(error),
            workflowId,
            userId,
            stack: error instanceof Error ? error.stack : undefined,
          })
          const agentS3Configured =
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
            !!S3_AGENT_GENERATED_IMAGES_CONFIG.region
          if (agentS3Configured) {
            throw new Error(
              `Failed to upload generated image to S3: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
      } else if (imageUrl && !base64Image) {
        const agentS3Configured =
          !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
          !!S3_AGENT_GENERATED_IMAGES_CONFIG.region
        if (agentS3Configured) {
          throw new Error(
            'Could not download image from OpenAI temporary URL; S3 storage requires the image to be downloaded first.'
          )
        }
        logger.warn('Could not download image for storage, will return original URL', {
          imageUrl: imageUrl.substring(0, 100),
        })
      }

      // Use stored URL if available, otherwise fall back to original imageUrl
      // Always ensure we return a URL in the image field
      // Use originalImageUrl which was preserved before any processing
      const imageUrlToReturn = finalImageUrl || originalImageUrl || ''

      logger.info('Image generation result:', {
        hasFinalImageUrl: !!finalImageUrl,
        hasImageUrl: !!imageUrl,
        hasOriginalImageUrl: !!originalImageUrl,
        hasBase64Image: !!base64Image,
        originalImageUrl: originalImageUrl ? originalImageUrl.substring(0, 100) : null,
        imageUrlToReturn: imageUrlToReturn ? imageUrlToReturn.substring(0, 100) : '',
        stored: !!finalImageUrl,
      })

      // Ensure we always return a URL - use originalImageUrl as final fallback
      // If download failed but we have originalImageUrl, use it
      const finalContent = imageUrlToReturn || originalImageUrl || 'direct-image'
      // Always ensure image field has a value - prefer stored URL, then original URL
      const finalImage = finalImageUrl || originalImageUrl || ''

      // Log if we're falling back to original URL
      if (!finalImageUrl && originalImageUrl) {
        logger.warn('Using original DALL-E URL as fallback (download/storage failed)', {
          originalImageUrl: originalImageUrl.substring(0, 100),
        })
      }

      return {
        success: true,
        output: {
          content: finalContent,
          image: finalImage, // Return stored URL or original URL - always ensure this has a value
          metadata: {
            model: modelName,
            stored: !!finalImageUrl,
          },
        },
      }
    } catch (error) {
      logger.error('Error in image generation response handling:', error)
      throw error
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Generated image data',
      properties: {
        content: { type: 'string', description: 'Image URL or identifier' },
        image: { type: 'string', description: 'Image URL (stored in S3/local storage) or base64 encoded image data' },
        metadata: {
          type: 'object',
          description: 'Image generation metadata',
          properties: {
            model: { type: 'string', description: 'Model used for image generation' },
            stored: { type: 'boolean', description: 'Whether the image was stored in S3/local storage' },
          },
        },
      },
    },
  },
}
