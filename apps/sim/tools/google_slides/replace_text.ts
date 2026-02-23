import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleSlidesReplaceTextTool')

interface ReplaceTextParams {
  accessToken: string
  presentationId: string
  objectId: string
  text: string
}

interface ReplaceTextResponse {
  success: boolean
  output: {
    replaced: boolean
    objectId: string
    text: string
    metadata: {
      presentationId: string
      url: string
    }
  }
}

export const replaceTextTool: ToolConfig<ReplaceTextParams, ReplaceTextResponse> = {
  id: 'google_slides_replace_text',
  name: 'Replace Text in Google Slides',
  description:
    'Replace all text in a shape or table cell in a Google Slides presentation. This deletes existing text and inserts new text.',
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
      description:
        'The object ID of the shape or table cell to replace text in. For table cells, use the cell object ID.',
    },
    text: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The new text to replace the existing text with',
    },
  },

  request: {
    url: (params) => {
      const presentationId = params.presentationId?.trim()
      if (!presentationId) {
        throw new Error('Presentation ID is required')
      }
      return `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`
    },
    method: 'POST',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }
      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    body: (params) => {
      const objectId = params.objectId?.trim()
      if (!objectId) {
        throw new Error('Object ID is required')
      }

      if (params.text === undefined || params.text === null) {
        throw new Error('Text is required')
      }

      return {
        requests: [
          {
            deleteText: {
              objectId,
              textRange: {
                type: 'ALL',
              },
            },
          },
          {
            insertText: {
              objectId,
              insertionIndex: 0,
              text: params.text,
            },
          },
        ],
      }
    },
  },

  transformResponse: async (response: Response, params) => {
    const data = await response.json()

    if (!response.ok) {
      logger.error('Google Slides API error:', { data })
      throw new Error(data.error?.message || 'Failed to replace text')
    }

    const presentationId = params?.presentationId?.trim() || ''
    const objectId = params?.objectId?.trim() || ''

    return {
      success: true,
      output: {
        replaced: true,
        objectId,
        text: params?.text ?? '',
        metadata: {
          presentationId,
          url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
        },
      },
    }
  },

  outputs: {
    replaced: {
      type: 'boolean',
      description: 'Whether the text was successfully replaced',
    },
    objectId: {
      type: 'string',
      description: 'The object ID where text was replaced',
    },
    text: {
      type: 'string',
      description: 'The text that was inserted',
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
