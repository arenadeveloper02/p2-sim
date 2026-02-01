import type { ArenaProjectSummaryParams, ArenaProjectSummaryResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const projectSummary: ToolConfig<ArenaProjectSummaryParams, ArenaProjectSummaryResponse> = {
  id: 'arena_project_summary',
  name: 'Arena Project Summary',
  description: 'Get the project summary for a client in Arena.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., project_summary)',
    },
    'project-summary-cid': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client ID used to fetch project summary',
    },
  },

  request: {
    url: (params: ArenaProjectSummaryParams) => {
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      if (!params['project-summary-cid']?.trim()) throw new Error('Missing required field: Client ID')

      let url = `/api/tools/arena/project-summary`
      url += `?workflowId=${encodeURIComponent(params._context.workflowId)}`
      url += `&cid=${encodeURIComponent(params['project-summary-cid'].trim())}`

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

  transformResponse: async (
    response: Response
  ): Promise<ArenaProjectSummaryResponse> => {
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
