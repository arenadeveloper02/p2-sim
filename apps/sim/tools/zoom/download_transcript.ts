import type { ToolConfig } from '@/tools/types'
import type {
  ZoomDownloadTranscriptParams,
  ZoomDownloadTranscriptResponse,
} from '@/tools/zoom/types'

export const zoomDownloadTranscriptTool: ToolConfig<
  ZoomDownloadTranscriptParams,
  ZoomDownloadTranscriptResponse
> = {
  id: 'zoom_download_transcript',
  name: 'Zoom Download Transcript',
  description: 'Download a Zoom recording transcript or file using a download URL',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'zoom',
    requiredScopes: ['cloud_recording:read:list_recording_files'],
  },

  params: {
    downloadUrl: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The download URL for the transcript or recording file',
    },
  },

  request: {
    url: (params) => params.downloadUrl,
    method: 'GET',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Missing access token for Zoom API request')
      }
      return {
        Authorization: `Bearer ${params.accessToken}`,
      }
    },
  },

  transformResponse: async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        success: false,
        error: `Failed to download: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        output: {
          content: '',
        },
      }
    }

    const content = await response.text()

    return {
      success: true,
      output: {
        content,
      },
    }
  },

  outputs: {
    content: {
      type: 'string',
      description: 'The downloaded content',
    },
  },
}
