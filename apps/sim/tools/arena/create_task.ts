import { startOfDayTimestamp } from '@/lib/arena-utils/arena-utils'
import type { ArenaCreateTaskParams, ArenaCreateTaskResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

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
      const url = `/api/tools/arena/tasks`
      return url
    },
    method: 'POST',
    headers: (params: ArenaCreateTaskParams) => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
    body: async (params: ArenaCreateTaskParams) => {
      // Dynamic import to avoid client-side bundling issues
      const { resolveAssigneeId, resolveClientId, resolveGroupId, resolveProjectId } = await import(
        './utils/resolve-ids'
      )

      const today = new Date()
      const nextWeekDay = new Date()
      nextWeekDay.setDate(today.getDate() + 7)
      const isTask = params.operation === 'arena_create_task'

      // ✅ Validation checks
      if (!params._context?.workflowId) throw new Error('Missing required field: workflowId')
      if (!params['task-name']) throw new Error('Missing required field: Task Name')
      if (!params['task-description']) throw new Error('Missing required field: Task Description')
      const workflowId = params._context.workflowId

      // Resolve client ID (supports name/id from advanced mode or variables)
      const clientId = await resolveClientId(params['task-client'] as any, workflowId)
      if (!clientId) throw new Error('Missing required field: Task Client')

      // Resolve project ID (supports name/id from advanced mode or variables)
      const projectId = await resolveProjectId(params['task-project'] as any, clientId, workflowId)
      if (!projectId) throw new Error('Missing required field: Project')

      // Resolve assignee ID (supports name/email/id from advanced mode or variables)
      const assigneeId = await resolveAssigneeId(
        params['task-assignee'] as any,
        clientId,
        projectId,
        workflowId
      )
      if (!assigneeId) throw new Error('Missing required field: Assignee')

      let taskId: string | undefined
      if (isTask) {
        const groupId = await resolveGroupId(
          params['task-group'] as any,
          clientId,
          projectId,
          workflowId
        )
        if (!groupId) throw new Error('Missing required field: Task Group')
      } else {
        taskId =
          typeof params['task-task'] === 'string'
            ? params['task-task']
            : params['task-task']?.sysId || params['task-task']?.id
        if (!taskId) throw new Error('Missing required field: Task')
      }

      const body: Record<string, any> = {
        workflowId: params._context.workflowId,
        name: params['task-name'],
        taskHtmlDescription: params['task-description'],
        plannedStartDate: startOfDayTimestamp(today),
        plannedEndDate: startOfDayTimestamp(nextWeekDay),
        taskType: isTask ? 'MILESTONE' : 'SHOW-ON-TIMELINE',
        clientId: clientId,
        projectId: projectId,
        assignedToId: assigneeId,
      }

      if (isTask) {
        const groupId = await resolveGroupId(
          params['task-group'] as any,
          clientId,
          projectId,
          workflowId
        )
        body.epicId = groupId
        body.epicName =
          typeof params['task-group'] === 'object' ? (params['task-group'] as any)?.name : undefined
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
    // Extract fields from the Arena response to make them available as top-level outputs
    // The output object becomes the block outputs, so we flatten the fields here
    return {
      success: true,
      output: {
        success: true,
        output: data, // Keep the full response for backward compatibility
        // Task identifiers - multiple aliases for flexibility
        task_id: data.sysId || data.id || '',
        id: data.id || data.sysId || '',
        sysId: data.sysId || '',
        // Client/Project/Group/Assignee IDs - multiple aliases
        client_id: data.customerId || '',
        customerId: data.customerId || '',
        project_id: data.projectId || '',
        projectId: data.projectId || '',
        group_id: data.epicId || '',
        epicId: data.epicId || '',
        assignee_id: data.assignedToId || '',
        assignedToId: data.assignedToId || '',
        // Task details
        task_name: data.name || '',
        name: data.name || '',
        description: data.taskHtmlDescription || data.description || '',
        // Additional useful fields
        taskNumber: data.taskNumber || '',
        status: data.status || '',
        arenaStatus: data.arenaStatus || '',
        projectName: data.projectName || '',
        customerName: data.customerName || '',
        epicName: data.epicName || '',
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
    // Task identifiers - multiple aliases for flexibility
    task_id: { type: 'string', description: 'Task ID (sysId)' },
    id: { type: 'string', description: 'Task ID (id field)' },
    sysId: { type: 'string', description: 'Task system ID' },
    // Client/Project/Group/Assignee IDs - multiple aliases
    client_id: { type: 'string', description: 'Client ID (customerId)' },
    customerId: { type: 'string', description: 'Customer ID' },
    project_id: { type: 'string', description: 'Project ID' },
    projectId: { type: 'string', description: 'Project ID' },
    group_id: { type: 'string', description: 'Group ID (epicId)' },
    epicId: { type: 'string', description: 'Epic/Group ID' },
    assignee_id: { type: 'string', description: 'Assignee ID (assignedToId)' },
    assignedToId: { type: 'string', description: 'Assigned user ID' },
    // Task details
    task_name: { type: 'string', description: 'Task name' },
    name: { type: 'string', description: 'Task name' },
    description: { type: 'string', description: 'Task description' },
    // Additional useful fields
    taskNumber: { type: 'string', description: 'Task number' },
    status: { type: 'string', description: 'Task status' },
    arenaStatus: { type: 'string', description: 'Arena status' },
    projectName: { type: 'string', description: 'Project name' },
    customerName: { type: 'string', description: 'Customer/Client name' },
    epicName: { type: 'string', description: 'Epic/Group name' },
  },
}
