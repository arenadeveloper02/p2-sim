import type { ToolConfig } from '@/tools/types'
import {
  type SearchTaskQueryParams,
  type SearchTaskResponse,
} from '@/tools/arena_task_manager/types'
import { getArenaServiceBaseUrl } from '@/lib/arena-utils'

export const createTask: ToolConfig<SearchTaskQueryParams, SearchTaskResponse> = {
  id: 'arena_search_task',
  name: 'Arena Search Task',
  description: 'Search Tasks In Arena',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., create)',
    },
    'search-task-name': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Name of the task',
    },
    'search-task-client': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client associated with the task',
    },
    'search-task-project': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs',
    },
    'search-task-assignee': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee',
    },
    'search-task-visbility': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee',
    },
  },

  request: {
    url: (params: SearchTaskQueryParams) => {
      const baseUrl = getArenaServiceBaseUrl()
      let url = `/api/tools/arena/search-tasks`

      const isSearchTask = params.operation === 'arena_search_task'
      if (isSearchTask) {
        url += `?name=${params['search-task-name']}`
      }
      if (params['search-task-client']) {
        url += `&account=${params['search-task-client']}`
      }
      if (params['search-task-project']) {
        url += `&projectSysId=${params['search-task-project']}`
      }
      if (params['search-task-state']) {
        url += `&status=${params['search-task-state']}`
      }
      if (params['search-task-visibility']) {
        url += `&taskType=${params['search-task-visibility']}`
      }
      if (params['search-task-assignee']) {
        url += `&assigneeId=${params['search-task-assignee']}`
      }
      if (params['search-task-from-date']) {
        url += `&fromDate=${params['search-task-from-date']}`
      }
      if (params['search-task-to-date']) {
        url += `&toDate=${params['search-task-to-date']}`
      }

      return url
    },
    method: 'GET',
    headers: (params: SearchTaskQueryParams) => {
      //const v2Token = Cookies.get('v2Token')
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        //Authorization: v2Token || '',
      }
    },
  },

  transformResponse: async (
    response: Response,
    params?: SearchTaskQueryParams
  ): Promise<SearchTaskResponse> => {
    const data = await response.json()
    return {
      success: true,
      output: {
        ts: new Date().toISOString(),
        response: data,
        success: true,
      },
    }
  },

  outputs: {
    ts: { type: 'string', description: 'Timestamp when response was transformed' },
    response: { type: 'object', description: 'Response from Arena' },
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
  },
}
