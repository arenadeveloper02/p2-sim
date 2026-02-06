import type { ArenaGetMeetingsParams, ArenaGetMeetingsResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getMeetings: ToolConfig<ArenaGetMeetingsParams, ArenaGetMeetingsResponse> = {
  id: 'arena_get_meetings',
  name: 'Arena Get Meetings',
  description: 'Get meetings for a client in Arena.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., get_meetings)',
    },
    'get-meetings-client': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client associated with the meetings (basic mode)',
    },
    'get-meetings-client-id': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client ID for the meetings (advanced mode)',
    },
    'get-meetings-period': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Time period for meetings (7days, today, 14days)',
    },
  },

  request: {
    url: (params: ArenaGetMeetingsParams) => {
      // ✅ Validation checks
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')

      if (!params['get-meetings-period']) throw new Error('Missing required field: Period')

      // Determine if advanced mode (has client-id field) or basic mode (has client object)
      const isAdvancedMode = !!params['get-meetings-client-id']

      let clientId: string
      if (isAdvancedMode) {
        // Advanced mode: use direct client ID input
        clientId = params['get-meetings-client-id']?.trim() || ''
        if (!clientId) throw new Error('Missing required field: Client ID')
      } else {
        // Basic mode: extract client ID from client object
        const clientValue = params['get-meetings-client']
        clientId = typeof clientValue === 'string' ? clientValue : clientValue?.clientId || ''
        if (!clientId) throw new Error('Missing required field: Client')
      }

      let url = `/api/tools/arena/get-meetings`
      url += `?workflowId=${encodeURIComponent(params._context.workflowId)}`
      url += `&clientId=${encodeURIComponent(clientId)}`
      url += `&period=${encodeURIComponent(params['get-meetings-period'])}`

      return url
    },
    method: 'GET',
    headers: (params: ArenaGetMeetingsParams) => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
