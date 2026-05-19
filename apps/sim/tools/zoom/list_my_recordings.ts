import type { ToolConfig } from '@/tools/types'
import type { ZoomListMyRecordingsParams, ZoomListMyRecordingsResponse } from '@/tools/zoom/types'
import {
  RECORDING_OUTPUT_PROPERTIES,
  RECORDING_PAGE_INFO_OUTPUT_PROPERTIES,
} from '@/tools/zoom/types'

export const zoomListMyRecordingsTool: ToolConfig<
  ZoomListMyRecordingsParams,
  ZoomListMyRecordingsResponse
> = {
  id: 'zoom_list_my_recordings',
  name: 'Zoom List My Recordings',
  description:
    'List cloud recordings for the logged-in Sim user using their account email as the Zoom user ID',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'zoom',
    requiredScopes: ['cloud_recording:read:list_user_recordings'],
  },

  params: {
    from: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Start date in yyyy-mm-dd format (within last 6 months)',
    },
    to: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'End date in yyyy-mm-dd format',
    },
    pageSize: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of records per page, 1-300 (e.g., 30, 50, 100)',
    },
    nextPageToken: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Token for pagination to get next page of results',
    },
    trash: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Set to true to list recordings from trash',
    },
  },

  request: {
    url: '/api/tools/zoom/list-my-recordings',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      accessToken: params.accessToken,
      ...(params.from?.trim() ? { from: params.from.trim() } : {}),
      ...(params.to?.trim() ? { to: params.to.trim() } : {}),
      ...(params.pageSize != null ? { pageSize: params.pageSize } : {}),
      ...(params.nextPageToken?.trim() ? { nextPageToken: params.nextPageToken.trim() } : {}),
      ...(params.trash === true ? { trash: true } : {}),
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Zoom API error: ${response.status} ${response.statusText}`,
        output: data.output ?? {
          userEmail: '',
          recordings: [],
          pageInfo: {
            from: '',
            to: '',
            pageSize: 0,
            totalRecords: 0,
          },
        },
      }
    }

    return {
      success: true,
      output: data.output,
    }
  },

  outputs: {
    userEmail: {
      type: 'string',
      description: 'Sim logged-in user email used as the Zoom user ID',
    },
    recordings: {
      type: 'array',
      description: 'List of recordings for the logged-in user',
      items: {
        type: 'object',
        properties: RECORDING_OUTPUT_PROPERTIES,
      },
    },
    pageInfo: {
      type: 'object',
      description: 'Pagination information',
      properties: RECORDING_PAGE_INFO_OUTPUT_PROPERTIES,
    },
  },
}
