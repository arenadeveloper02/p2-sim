import type { ToolConfig } from '@/tools/types'
import {
  type SearchTaskQueryParams,
  type SearchTaskResponse,
} from '@/tools/arena_task_manager/types'
import { getArenaServiceBaseUrl } from '@/lib/arena-utils/arena-utils'
import {
  getToday,
  getTomorrow,
  getYesterday,
  getCurrentMonth,
  getCurrentWeek,
  getFutureDate,
  getPastDate,
  getLastMonth,
  getLastWeek,
  getNextMonth,
  getNextWeek,
} from '@/lib/arena-utils/arena-date-utils'

export const searchTask: ToolConfig<SearchTaskQueryParams, SearchTaskResponse> = {
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
      required: false,
      visibility: 'user-or-llm',
      description: 'Name of the task',
    },
    'search-task-client': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client associated with the task',
    },
    'search-task-project': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs',
    },
    'search-task-assignee': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee',
    },
    'search-task-visbility': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee',
    },
    'search-task-state': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'State of the task',
    },
    'search-task-due-date': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Due date of the task',
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
      if (params._context?.workflowId) {
        url += `&workflowId=${params._context?.workflowId}`
      }

      if (params['search-task-due-date'] === 'today') {
        const { startDate, endDate } = getToday()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'tomorrow') {
        const { startDate, endDate } = getTomorrow()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      //  if(params['search-task-due-date'] === 'yesterday') {
      //     const { startDate, endDate } = getYesterday()
      //     url += `&plannedEndDateFrom=${startDate}`
      //     url += `&plannedEndDateTo=${endDate}`
      //   }
      if (params['search-task-due-date'] === 'this-week') {
        const { startDate, endDate } = getCurrentWeek()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'next-week') {
        const { startDate, endDate } = getNextWeek()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'last-week') {
        const { startDate, endDate } = getLastWeek()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'this-month') {
        const { startDate, endDate } = getCurrentMonth()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'next-month') {
        const { startDate, endDate } = getNextMonth()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'last-month') {
        const { startDate, endDate } = getLastMonth()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'past-date') {
        const { startDate, endDate } = getPastDate()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
      }
      if (params['search-task-due-date'] === 'future-date') {
        const { startDate, endDate } = getFutureDate()
        url += `&plannedEndDateFrom=${startDate}`
        url += `&plannedEndDateTo=${endDate}`
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
