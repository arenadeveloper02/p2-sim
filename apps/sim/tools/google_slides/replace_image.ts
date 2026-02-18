import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleSlidesReplaceImageTool')

interface ReplaceImageParams {
  accessToken: string
  presentationId: string
  objectId: string
  imageUrl: string
}

interface ReplaceImageResponse {
  success: boolean
  output: {
    replaced: boolean
    objectId: string
    imageUrl: string
    metadata: {
      presentationId: string
      url: string
    }
  }
}

export const replaceImageTool: ToolConfig<ReplaceImageParams, ReplaceImageResponse> = {
  id: 'google_slides_replace_image',
  name: 'Replace Image in Google Slides',
  description:
    'Replace an existing image in a Google Slides presentation with a new image URL while maintaining all existing properties (size, position, etc.)',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-drive',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Slides API',
    },
    presentationId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the presentation',
    },
    objectId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The object ID of the image to replace',
    },
    imageUrl: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'The publicly accessible URL of the new image (must be PNG, JPEG, or GIF, max 50MB)',
    },
  },

  request: {
    url: (params) => {
      const presentationId = params.presentationId?.trim()
      if (!presentationId) {
        throw new Error('Presentation ID is required')
      }
      // First, read the presentation to verify the image exists
      return `https://slides.googleapis.com/v1/presentations/${presentationId}`
    },
    method: 'GET',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }
      return {
        Authorization: `Bearer ${params.accessToken}`,
      }
    },
  },

  postProcess: async (result, params, _executeTool) => {
    if (!result.success) {
      return result
    }

    const presentationId = params?.presentationId?.trim()
    const objectId = params?.objectId?.trim()
    const imageUrl = params?.imageUrl?.trim()

    if (!presentationId || !objectId || !imageUrl) {
      throw new Error('Presentation ID, Object ID, and Image URL are required')
    }

    try {
      // Get the presentation data from the read response
      const presentationData = result.output as any
      const slides = presentationData.slides || []

      // Verify the image exists
      let imageFound = false
      for (const slide of slides) {
        const pageElements = slide.pageElements || []
        for (const element of pageElements) {
          if (element.objectId === objectId) {
            if (element.image) {
              imageFound = true
            } else {
              throw new Error(`Object with ID ${objectId} exists but is not an image`)
            }
            break
          }
        }
        if (imageFound) break
      }

      if (!imageFound) {
        throw new Error(`Image with objectId ${objectId} not found in presentation`)
      }

      // Use replaceImage request which maintains all existing properties
      const batchUpdateResponse = await fetch(
        `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                replaceImage: {
                  imageObjectId: objectId,
                  url: imageUrl,
                  // imageReplaceMethod is optional - defaults to CENTER_INSIDE which maintains aspect ratio
                  // We don't specify it to preserve existing behavior
                },
              },
            ],
          }),
        }
      )

      const batchUpdateData = await batchUpdateResponse.json()

      if (!batchUpdateResponse.ok) {
        logger.error('Google Slides batchUpdate error:', { data: batchUpdateData })
        throw new Error(batchUpdateData.error?.message || 'Failed to replace image')
      }

      return {
        success: true,
        output: {
          replaced: true,
          objectId,
          imageUrl,
          metadata: {
            presentationId,
            url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
          },
        },
      }
    } catch (error) {
      logger.error('Google Slides replace image - Error processing:', { error })
      throw error
    }
  },

  transformResponse: async (response: Response, params) => {
    const data = await response.json()

    if (!response.ok) {
      logger.error('Google Slides API error:', { data })
      throw new Error(data.error?.message || 'Failed to read presentation')
    }

    // Return the presentation data for postProcess to use
    return {
      success: true,
      output: data,
    }
  },

  outputs: {
    replaced: {
      type: 'boolean',
      description: 'Whether the image was successfully replaced',
    },
    objectId: {
      type: 'string',
      description: 'The object ID of the replaced image',
    },
    imageUrl: {
      type: 'string',
      description: 'The new image URL that was set',
    },
    metadata: {
      type: 'object',
      description: 'Operation metadata including presentation ID and URL',
      properties: {
        presentationId: { type: 'string', description: 'The presentation ID' },
        url: { type: 'string', description: 'URL to the presentation' },
      },
    },
  },
}
