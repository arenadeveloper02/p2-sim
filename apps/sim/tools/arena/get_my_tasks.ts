import type { ArenaGetMyTasksParams, ArenaGetMyTasksResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getMyTasks: ToolConfig<ArenaGetMyTasksParams, ArenaGetMyTasksResponse> = {
  id: 'arena_get_my_tasks',
  name: 'Arena Get My Tasks',
  description: 'Get the current user’s tasks from Arena.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (get_my_tasks)',
    },
  },

  request: {
    url: (params: ArenaGetMyTasksParams) => {
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      return `/api/tools/arena/get-my-tasks?workflowId=${encodeURIComponent(params._context.workflowId)}`
    },
    method: 'GET',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (
    response: Response,
    _params?: ArenaGetMyTasksParams
  ): Promise<ArenaGetMyTasksResponse> => {
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
