import type { ToolConfig } from '@/tools/types'
import {
  type ArenaCreateTaskParams,
  type ArenaCreateTaskResponse,
} from '@/tools/arena_task_manager/types'
import { getArenaServiceBaseUrl, startOfDayTimestamp, isValidDate } from '@/lib/arena-utils'
import Cookies from 'js-cookie'
import { plainTextSelectors } from '@react-email/components'

export const createTask: ToolConfig<ArenaCreateTaskParams, ArenaCreateTaskResponse> = {
  id: 'arena_create_task',
  name: 'Arena Create Task',
  description: 'Create a task in Arena.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (e.g., create)',
    },
    'task-name': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Name of the task',
    },
    'task-description': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Detailed description of the task',
    },
    'task-client': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Client associated with the task',
    },
    'task-project': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs',
    },
    'task-group': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional task group with id and name',
    },
    'task-task': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional parent task reference',
    },
    'task-assignee': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee',
    },
  },

  request: {
    url: (params: ArenaCreateTaskParams) => {
      const baseUrl = getArenaServiceBaseUrl()
      const url = `/api/tools/arena/tasks`
      return url
    },
    method: 'POST',
    headers: (params: ArenaCreateTaskParams) => {
      //const v2Token = Cookies.get('v2Token')
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        //Authorization: v2Token || '',
      }
    },
    body: (params: ArenaCreateTaskParams) => {
      const today = new Date()
      const nextWeekDay = new Date()
      nextWeekDay.setDate(today.getDate() + 7)
      const isTask = params['operation'] === 'arena_create_task'
      const body: Record<string, any> = {
        workflowId: params._context.workflowId,
        name: params['task-name'],
        taskHtmlDescription: params['task-description'],
        // plannedStartDate: startOfDayTimestamp(new Date(params['planned-start-date']) || today),
        // plannedEndDate: startOfDayTimestamp(
        //   new Date(params['planned-end-date']) || new Date().setDate(today.getDate() + 7)
        // ),
        plannedStartDate: startOfDayTimestamp(today),
        plannedEndDate: startOfDayTimestamp(nextWeekDay),
        taskType: isTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
        clientId: params['task-client'],
        projectId: params['task-project'],
        assignedToId: params['task-assignee'],
      }

      if (isTask) {
        body.epicId = params['task-group']?.id
        body.epicName = params['task-group']?.name
      } else {
        body.deliverableId = params['task-task']
      }
      return body
    },
  },

  transformResponse: async (
    response: Response,
    params?: ArenaCreateTaskParams
  ): Promise<ArenaCreateTaskResponse> => {
    const data = await response.json()
    return {
      success: true,
      output: data,
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
  },
}
