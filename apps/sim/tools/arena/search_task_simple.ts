import type { SearchTaskResponse, SearchTaskSimpleQueryParams } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

/**
 * Name/number-only search — same `GET /api/tools/arena/search-tasks` as `arena_search_task`,
 * without client/project/filters. Block operation: `arena_search_task_simple`.
 */
export const searchTaskSimple: ToolConfig<SearchTaskSimpleQueryParams, SearchTaskResponse> = {
  id: 'arena_search_task_simple',
  name: 'Arena Search Task (name only)',
  description:
    'Search Arena tasks by name or number. Use the full “Search Task” operation when you need client, project, state, or other filters.',
  version: '1.0.0',

  params: {
    'search-task-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Task name or number to search',
    },
  },

  request: {
    url: (params: SearchTaskSimpleQueryParams) => {
      let url = `/api/tools/arena/search-tasks`
      let hasQuery = false
      const taskName = params['search-task-name']?.trim()
      if (taskName) {
        url += `?name=${encodeURIComponent(taskName)}`
        hasQuery = true
      }
      if (params._context?.workflowId) {
        url += hasQuery
          ? `&workflowId=${encodeURIComponent(params._context.workflowId)}`
          : `?workflowId=${encodeURIComponent(params._context.workflowId)}`
      }
      return url
    },
    method: 'GET',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (response: Response): Promise<SearchTaskResponse> => {
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
