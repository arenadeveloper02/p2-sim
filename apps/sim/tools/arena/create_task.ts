import { createLogger } from '@sim/logger'
import { startOfDayTimestamp } from '@/lib/arena-utils/arena-utils'
import type { ArenaCreateTaskResponse, ArenaCreateTaskToolParams } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('ArenaCreateTask')

const transformResponse: ToolConfig['transformResponse'] = async (response: Response) => {
  const data = await response.json()
  return {
    success: true,
    output: { success: true, output: data },
  }
}

const outputs: ToolConfig['outputs'] = {
  success: { type: 'boolean', description: 'Indicates if transform was successful' },
  output: { type: 'object', description: 'Output from Arena' },
}

function buildFieldsBody(
  params: ArenaCreateTaskToolParams,
  isMainTask: boolean
): Record<string, unknown> {
  if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
  if (!params['task-name']) throw new Error('Missing required field: Task Name')
  if (!params['task-description']) throw new Error('Missing required field: Task Description')
  if (!params['task-client-name']) throw new Error('Missing required field: Client Name')
  if (!params['task-project-name']) throw new Error('Missing required field: Project Name')
  if (isMainTask && !params['task-epic-name']) {
    throw new Error('Missing required field: Group Name')
  }
  if (!isMainTask && !params['task-number']) {
    throw new Error('Missing required field: Task Number')
  }
  if (!params['task-assignee-email']) {
    throw new Error('Missing required field: Assignee Email')
  }

  const today = new Date()
  const nextWeekDay = new Date()
  nextWeekDay.setDate(today.getDate() + 7)

  const taskName = params['task-name']
  const taskDescription = params['task-description']

  if (!taskName || taskName.trim() === '') {
    throw new Error('Task Name is required and cannot be empty')
  }
  if (!taskDescription || taskDescription.trim() === '') {
    throw new Error('Task Description is required and cannot be empty')
  }

  const body: Record<string, unknown> = {
    workflowId: params._context.workflowId,
    name: taskName?.trim(),
    taskDescription: taskDescription?.trim(),
    clientName: params['task-client-name']?.trim(),
    projectName: params['task-project-name']?.trim(),
    plannedStartDate: startOfDayTimestamp(today),
    plannedEndDate: startOfDayTimestamp(nextWeekDay),
    taskType: isMainTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
    assignee: params['task-assignee-email']?.trim(),
    taskNumber: isMainTask ? '' : params['task-number']?.trim() || '',
  }

  if (isMainTask) {
    body.epicName = params['task-epic-name']?.trim()
  }

  return body
}

function buildSelectorBody(
  params: ArenaCreateTaskToolParams,
  isMainTask: boolean
): Record<string, unknown> {
  if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
  if (!params['task-name']) throw new Error('Missing required field: Task Name')
  if (!params['task-description']) throw new Error('Missing required field: Task Description')
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

  const today = new Date()
  const nextWeekDay = new Date()
  nextWeekDay.setDate(today.getDate() + 7)

  const body: Record<string, unknown> = {
    workflowId: params._context.workflowId,
    name: params['task-name'],
    taskHtmlDescription: params['task-description'],
    plannedStartDate: startOfDayTimestamp(today),
    plannedEndDate: startOfDayTimestamp(nextWeekDay),
    taskType: isMainTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
    clientId: params['task-client']?.clientId,
    projectId: projectId,
    assignedToId: assigneeId,
  }

  if (isMainTask) {
    if (!params['task-group']?.id) throw new Error('Missing required field: Task Group')
    body.epicId = params['task-group']?.id
    body.epicName = params['task-group']?.name
  } else {
    const taskId =
      typeof params['task-task'] === 'string'
        ? params['task-task']
        : params['task-task']?.sysId || params['task-task']?.id
    if (!taskId) throw new Error('Missing required field: Task')
    body.deliverableId = taskId
  }

  return body
}

/** Main task: client, project, group, and assignee selectors (`/api/tools/arena/tasks`). */
export const arenaCreateTaskMainTool: ToolConfig<ArenaCreateTaskToolParams, ArenaCreateTaskResponse> = {
  id: 'arena_create_task',
  name: 'Arena Create Task',
  description: 'Create a milestone task in Arena using workspace selectors (client, project, group, assignee).',
  version: '1.0.0',

  params: {
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
      required: false,
      visibility: 'user-or-llm',
      description: 'Client associated with the task',
    },
    'task-project': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project under which the task belongs',
    },
    'task-group': {
      type: 'object',
      required: false,
      visibility: 'user-or-llm',
      description: 'Task group',
    },
    'task-assignee': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee',
    },
  },

  request: {
    url: () => '/api/tools/arena/tasks',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: (params) => buildSelectorBody(params, true),
  },

  transformResponse,
  outputs,
}

/** Main task — names & emails (tasks-updated API). */
export const arenaCreateTaskFieldsTool: ToolConfig<ArenaCreateTaskToolParams, ArenaCreateTaskResponse> = {
  id: 'arena_create_task_fields',
  name: 'Arena Create Task (names & emails)',
  description: 'Create a milestone task in Arena using client/project/group names and assignee email.',
  version: '1.0.0',

  params: {
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
    'task-client-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client name',
    },
    'task-project-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project name',
    },
    'task-epic-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Group / epic name',
    },
    'task-assignee-email': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee email',
    },
  },

  request: {
    url: () => '/api/tools/arena/tasks-updated',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: (params) => {
      logger.debug('Arena create task (names & emails)', { keys: Object.keys(params) })
      return buildFieldsBody(params, true)
    },
  },

  transformResponse,
  outputs,
}

/** Subtask — selectors. */
export const arenaCreateSubTaskTool: ToolConfig<ArenaCreateTaskToolParams, ArenaCreateTaskResponse> = {
  id: 'arena_create_sub_task',
  name: 'Arena Create Sub Task',
  description: 'Create a subtask in Arena using workspace selectors.',
  version: '1.0.0',

  params: {
    'task-name': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Name of the subtask',
    },
    'task-description': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Detailed description',
    },
    'task-client': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client',
    },
    'task-project': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project',
    },
    'task-task': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Parent task',
    },
    'task-assignee': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee',
    },
  },

  request: {
    url: () => '/api/tools/arena/tasks',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: (params) => buildSelectorBody(params, false),
  },

  transformResponse,
  outputs,
}

/** Subtask — names, emails, and parent task number. */
export const arenaCreateSubTaskFieldsTool: ToolConfig<ArenaCreateTaskToolParams, ArenaCreateTaskResponse> = {
  id: 'arena_create_sub_task_fields',
  name: 'Arena Create Sub Task (names & emails)',
  description: 'Create a subtask in Arena using names, emails, and parent task number.',
  version: '1.0.0',

  params: {
    'task-name': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Name of the subtask',
    },
    'task-description': {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Detailed description',
    },
    'task-client-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Client name',
    },
    'task-project-name': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Project name',
    },
    'task-assignee-email': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Assignee email',
    },
    'task-number': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Parent task number',
    },
  },

  request: {
    url: () => '/api/tools/arena/tasks-updated',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: (params) => buildFieldsBody(params, false),
  },

  transformResponse,
  outputs,
}
