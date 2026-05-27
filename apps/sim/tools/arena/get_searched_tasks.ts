import type {
  ArenaGetSearchedTasksParams,
  ArenaGetSearchedTasksResponse,
} from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getSearchedTasks: ToolConfig<
  ArenaGetSearchedTasksParams,
  ArenaGetSearchedTasksResponse
> = {
  id: 'arena_fetch_searched_tasks',
  name: 'Arena Fetch Searched Tasks',
  description:
    'Search Arena tasks by client name, project name, assignee name, and state (free-text filters).',
  version: '1.0.0',

  params: {
    'fetch-searched-client-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client name filter',
    },
    'fetch-searched-project-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project name filter',
    },
    'fetch-searched-assignee-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee name filter',
    },
    'fetch-searched-state': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'State name filter',
    },
  },

  request: {
    url: () => '/api/tools/arena/get-searched-tasks',
    method: 'POST',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: (params: ArenaGetSearchedTasksParams) => {
      if (!params._context?.workflowId) {
        throw new Error('Missing required field: workflowId')
      }

      return {
        workflowId: params._context.workflowId,
        clientName: params['fetch-searched-client-name']?.trim() ?? '',
        projectName: params['fetch-searched-project-name']?.trim() ?? '',
        assigneeName: params['fetch-searched-assignee-name']?.trim() ?? '',
        state: params['fetch-searched-state']?.trim() ?? '',
      }
    },
  },

  transformResponse: async (response: Response): Promise<ArenaGetSearchedTasksResponse> => {
    const data = await response.json()
    if (!response.ok) {
      throw new Error(
        typeof data?.error === 'string'
          ? data.error
          : (data?.details?.errorMessage ?? 'Failed to fetch searched tasks')
      )
    }

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
