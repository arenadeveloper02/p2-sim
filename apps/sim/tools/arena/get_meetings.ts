import type { ArenaGetMeetingsParams, ArenaGetMeetingsResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getMeetings: ToolConfig<ArenaGetMeetingsParams, ArenaGetMeetingsResponse> = {
  id: 'arena_get_meetings',
  name: 'Arena Get Meetings',
  description: 'Fetch meeting data from Arena for a client.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform',
    },
    'meeting-client': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client associated with the meetings',
    },
    'meeting-page-size': {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of records per page (default: 50)',
    },
  },

  request: {
    url: () => {
      return `/api/tools/arena/meetings`
    },
    method: 'POST',
    headers: () => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
    body: (params: ArenaGetMeetingsParams) => {
      // Validation checks
      if (!params._context?.workflowId) {
        throw new Error('Missing required field: workflowId')
      }
      if (!params['meeting-client']?.clientId) {
        throw new Error('Missing required field: Meeting Client')
      }

      return {
        workflowId: params._context.workflowId,
        clientId: params['meeting-client'].clientId,
        pageSize: params['meeting-page-size'] || 50,
      }
    },
  },

  transformResponse: async (
    response: Response,
    params?: ArenaGetMeetingsParams
  ): Promise<ArenaGetMeetingsResponse> => {
    const data = await response.json()
    return {
      success: true,
      output: {
        success: true,
        output: data,
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
  },
}
