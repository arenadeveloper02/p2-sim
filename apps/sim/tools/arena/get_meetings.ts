import type { ArenaGetMeetingsParams, ArenaGetMeetingsResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

function clientIdFromMergedField(
  value: ArenaGetMeetingsParams['get-meetings-client']
): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && 'clientId' in value) {
    return value.clientId?.trim() ?? ''
  }
  return ''
}

export const getMeetings: ToolConfig<ArenaGetMeetingsParams, ArenaGetMeetingsResponse> = {
  id: 'arena_get_meetings',
  name: 'Arena Get Meetings',
  description:
    'Get meetings for a client in Arena. Use basic mode to pick a client, or advanced mode to enter a client ID.',
  version: '1.0.0',

  params: {
    'get-meetings-client': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Client: selector value (basic) or client ID as string (advanced). Merged on the block as one field.',
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
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')

      if (!params['get-meetings-period']) throw new Error('Missing required field: Period')

      const clientId = clientIdFromMergedField(params['get-meetings-client'])
      if (!clientId) throw new Error('Missing required field: Client')

      let url = `/api/tools/arena/get-meetings`
      url += `?workflowId=${encodeURIComponent(params._context.workflowId)}`
      url += `&clientId=${encodeURIComponent(clientId)}`
      url += `&period=${encodeURIComponent(params['get-meetings-period'])}`

      return url
    },
    method: 'GET',
    headers: () => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
  },

  transformResponse: async (response: Response): Promise<ArenaGetMeetingsResponse> => {
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
