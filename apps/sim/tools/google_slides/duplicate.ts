import { createLogger } from '@sim/logger'
import type {
  GoogleSlidesCreateResponse,
  GoogleSlidesToolParams,
} from '@/tools/google_slides/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleSlidesDuplicateTool')

interface GoogleSlidesDuplicateParams extends GoogleSlidesToolParams {
  sourcePresentationId: string
  title: string
  folderId?: string
  folderSelector?: string
}

export const duplicateTool: ToolConfig<GoogleSlidesDuplicateParams, GoogleSlidesCreateResponse> = {
  id: 'google_slides_duplicate',
  name: 'Duplicate Google Slides Presentation',
  description: 'Create a duplicate of an existing Google Slides presentation',
  version: '1.0',

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
    sourcePresentationId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The ID of the presentation to duplicate',
    },
    title: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The title for the duplicated presentation',
    },
    folderSelector: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Select the folder to create the duplicate in',
    },
    folderId: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'The ID of the folder to create the duplicate in (internal use)',
    },
  },

  request: {
    url: (params) => {
      if (!params.sourcePresentationId) {
        throw new Error('Source presentation ID is required')
      }
      const url = new URL(
        `https://www.googleapis.com/drive/v3/files/${params.sourcePresentationId.trim()}/copy`
      )
      url.searchParams.append('supportsAllDrives', 'true')
      url.searchParams.append(
        'fields',
        'id,name,mimeType,webViewLink,parents,createdTime,modifiedTime'
      )
      return url.toString()
    },
    method: 'POST',
    headers: (params) => {
      // Validate access token
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    body: (params) => {
      if (!params.title) {
        throw new Error('Title is required')
      }

      const requestBody: any = {
        name: params.title,
      }

      // Add parent folder if specified (prefer folderSelector over folderId)
      const folderId = params.folderSelector || params.folderId
      if (folderId) {
        requestBody.parents = [folderId]
      }

      return requestBody
    },
  },

  transformResponse: async (response: Response) => {
    try {
      // Get the response data
      const responseText = await response.text()
      const data = JSON.parse(responseText)

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to duplicate presentation')
      }

      const presentationId = data.id
      const title = data.name

      const metadata = {
        presentationId,
        title: title || 'Untitled Presentation',
        mimeType: 'application/vnd.google-apps.presentation',
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      }

      return {
        success: true,
        output: {
          metadata,
        },
      }
    } catch (error) {
      logger.error('Google Slides duplicate - Error processing response:', {
        error,
      })
      throw error
    }
  },

  outputs: {
    metadata: {
      type: 'json',
      description: 'Duplicated presentation metadata including ID, title, and URL',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The presentation ID',
        },
        title: {
          type: 'string',
          description: 'The presentation title',
        },
        mimeType: {
          type: 'string',
          description: 'The mime type of the presentation',
        },
        url: {
          type: 'string',
          description: 'URL to open the presentation',
        },
      },
    },
  },
}
