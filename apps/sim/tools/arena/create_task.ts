import { createLogger } from '@sim/logger'
import { startOfDayTimestamp } from '@/lib/arena-utils/arena-utils'
import type { ArenaCreateTaskParams, ArenaCreateTaskResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('ArenaCreateTask')

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
    // Basic mode fields
    'task-client': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client associated with the task (basic mode)',
    },
    'task-project': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs (basic mode)',
    },
    'task-group': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional task group with id and name (basic mode)',
    },
    'task-task': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional parent task reference (basic mode)',
    },
    'task-assignee': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'User ID of the assignee (basic mode)',
    },
    // Advanced mode fields
    'task-client-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client name (advanced mode)',
    },
    'task-project-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project name (advanced mode)',
    },
    'task-epic-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Group/Epic name (advanced mode)',
    },
    'task-assignee-email': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee email (advanced mode)',
    },
    'task-number': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Task number for subtask creation (advanced mode)',
    },
  },

  request: {
    url: (params: ArenaCreateTaskParams) => {
      // Check if we're in advanced mode (task-client-name is present)
      const isAdvancedMode = !!params['task-client-name']
      return isAdvancedMode ? `/api/tools/arena/tasks-updated` : `/api/tools/arena/tasks`
    },
    method: 'POST',
    headers: (params: ArenaCreateTaskParams) => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
    body: (params: ArenaCreateTaskParams) => {
      const isTask = params.operation === 'arena_create_task'
      const isAdvancedMode = !!params['task-client-name']

      // ✅ Common validation
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      if (!params['task-name']) throw new Error('Missing required field: Task Name')
      if (!params['task-description']) throw new Error('Missing required field: Task Description')

      if (isAdvancedMode) {
        // Advanced mode validation
        if (!params['task-name']) throw new Error('Missing required field: Task Name')
        if (!params['task-description']) throw new Error('Missing required field: Task Description')
        if (!params['task-client-name']) throw new Error('Missing required field: Client Name')
        if (!params['task-project-name']) throw new Error('Missing required field: Project Name')
        if (isTask && !params['task-epic-name']) {
          throw new Error('Missing required field: Group Name')
        }
        if (!isTask && !params['task-number']) {
          throw new Error('Missing required field: Task Number')
        }
        if (!params['task-assignee-email']) {
          throw new Error('Missing required field: Assignee Email')
        }

        // Use same date logic as basic mode
        const today = new Date()
        const nextWeekDay = new Date()
        nextWeekDay.setDate(today.getDate() + 7)

        // Advanced mode payload
        const taskName = params['task-name']
        const taskDescription = params['task-description']

        // Log for debugging
        logger.debug('Advanced mode create task params', {
          isTask,
          taskName,
          taskDescription,
          hasTaskName: !!taskName,
          hasTaskDescription: !!taskDescription,
          allParams: Object.keys(params),
        })

        if (!taskName || taskName.trim() === '') {
          throw new Error('Task Name is required and cannot be empty')
        }
        if (!taskDescription || taskDescription.trim() === '') {
          throw new Error('Task Description is required and cannot be empty')
        }

        const body: Record<string, any> = {
          workflowId: params._context.workflowId,
          name: taskName?.trim(),
          taskDescription: taskDescription?.trim(),
          clientName: params['task-client-name']?.trim(),
          projectName: params['task-project-name']?.trim(),
          plannedStartDate: startOfDayTimestamp(today),
          plannedEndDate: startOfDayTimestamp(nextWeekDay),
          taskType: isTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
          assignee: params['task-assignee-email']?.trim(),
          // taskNumber: empty string for tasks, actual value for subtasks
          taskNumber: isTask ? '' : params['task-number']?.trim() || '',
        }

        // epicName: only for create task, not for subtask
        if (isTask) {
          body.epicName = params['task-epic-name']?.trim()
        }

        return body
      }

      // Basic mode validation
      if (!params['task-client']?.clientId) throw new Error('Missing required field: Task Client')
      const projectId =
        typeof params['task-project'] === 'string'
          ? params['task-project']
          : params['task-project']?.sysId
      if (!projectId) throw new Error('Missing required field: Project')
      const assigneeId =
        typeof params['task-assignee'] === 'string'
          ? params['task-assignee']
          : params['task-assignee']?.value
      if (!assigneeId) throw new Error('Missing required field: Assignee')

      let taskId: string | undefined
      if (isTask) {
        if (!params['task-group']?.id) throw new Error('Missing required field: Task Group')
      } else {
        taskId =
          typeof params['task-task'] === 'string'
            ? params['task-task']
            : params['task-task']?.sysId || params['task-task']?.id
        if (!taskId) throw new Error('Missing required field: Task')
      }

      // Basic mode payload
      const today = new Date()
      const nextWeekDay = new Date()
      nextWeekDay.setDate(today.getDate() + 7)

      const body: Record<string, any> = {
        workflowId: params._context.workflowId,
        name: params['task-name'],
        taskHtmlDescription: params['task-description'],
        plannedStartDate: startOfDayTimestamp(today),
        plannedEndDate: startOfDayTimestamp(nextWeekDay),
        taskType: isTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
        clientId: params['task-client']?.clientId,
        projectId: projectId,
        assignedToId: assigneeId,
      }

      if (isTask) {
        body.epicId = params['task-group']?.id
        body.epicName = params['task-group']?.name
      } else {
        body.deliverableId = taskId
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
