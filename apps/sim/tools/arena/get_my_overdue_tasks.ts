import type {
  ArenaGetMyOverdueTasksParams,
  ArenaGetMyOverdueTasksResponse,
} from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getMyOverdueTasks: ToolConfig<
  ArenaGetMyOverdueTasksParams,
  ArenaGetMyOverdueTasksResponse
> = {
  id: 'arena_get_my_overdue_tasks',
  name: 'Arena Get My Overdue Tasks',
  description: 'Get the current user’s overdue tasks from Arena.',
  version: '1.0.0',

  params: {},

  request: {
    url: (params: ArenaGetMyOverdueTasksParams) => {
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      return `/api/tools/arena/get-my-overdue-tasks?workflowId=${encodeURIComponent(
        params._context.workflowId
      )}`
    },
    method: 'GET',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (
    response: Response,
    _params?: ArenaGetMyOverdueTasksParams
  ): Promise<ArenaGetMyOverdueTasksResponse> => {
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
