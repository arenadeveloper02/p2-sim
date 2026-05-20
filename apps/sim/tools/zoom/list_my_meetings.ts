import type { ToolConfig } from '@/tools/types'
import type { ZoomListMyMeetingsParams, ZoomListMyMeetingsResponse } from '@/tools/zoom/types'
import {
  MEETING_LIST_ITEM_OUTPUT_PROPERTIES,
  MEETING_PAGE_INFO_OUTPUT_PROPERTIES,
  SCHEDULED_SESSION_OUTPUT_PROPERTIES,
} from '@/tools/zoom/types'

export const zoomListMyMeetingsTool: ToolConfig<
  ZoomListMyMeetingsParams,
  ZoomListMyMeetingsResponse
> = {
  id: 'zoom_list_my_meetings',
  name: 'Zoom List My Meetings',
  description:
    'List meetings for the logged-in Sim user. For scheduling (e.g. tomorrow), use scheduledSessions or start_time — not created_at. Recurring templates (type 3) omit list-level start_time; occurrences are expanded automatically.',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'zoom',
    requiredScopes: ['meeting:read:list_meetings'],
  },

  params: {
    type: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Meeting type filter: scheduled, live, upcoming, upcoming_meetings, or previous_meetings',
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
  },

  request: {
    url: '/api/tools/zoom/list-my-meetings',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      accessToken: params.accessToken,
      ...(params.type ? { type: params.type } : {}),
      ...(params.pageSize != null ? { pageSize: params.pageSize } : {}),
      ...(params.nextPageToken?.trim() ? { nextPageToken: params.nextPageToken.trim() } : {}),
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
          meetings: [],
          scheduledSessions: [],
          pageInfo: {
            pageCount: 0,
            pageNumber: 0,
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
    meetings: {
      type: 'array',
      description:
        'List of meetings including recurring templates with occurrence metadata when applicable',
      items: {
        type: 'object',
        properties: MEETING_LIST_ITEM_OUTPUT_PROPERTIES,
      },
    },
    scheduledSessions: {
      type: 'array',
      description:
        'Flattened sessions with concrete start_time values — preferred for date/time questions (e.g. meetings tomorrow)',
      items: {
        type: 'object',
        properties: SCHEDULED_SESSION_OUTPUT_PROPERTIES,
      },
    },
    pageInfo: {
      type: 'object',
      description: 'Pagination information',
      properties: MEETING_PAGE_INFO_OUTPUT_PROPERTIES,
    },
  },
}
