import {
  getCurrentMonth,
  getCurrentWeek,
  getFutureDate,
  getLastMonth,
  getLastWeek,
  getNextMonth,
  getNextWeek,
  getPastDate,
  getToday,
  getTomorrow,
  getYesterday,
} from '@/lib/arena-utils/arena-date-utils'
import type { SearchTaskQueryParams, SearchTaskResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

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
    'search-task-number': {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Task number (unique identifier)',
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
      let url = `/api/tools/arena/search-tasks`

      const isSearchTask = params.operation === 'arena_search_task'
      if (isSearchTask) {
        const taskName = params['search-task-name']
        if (taskName) {
          url += `?name=${encodeURIComponent(taskName)}`
        }
        const taskNumber = params['search-task-number']
        if (taskNumber) {
          url += url.includes('?')
            ? `&taskNumber=${encodeURIComponent(taskNumber)}`
            : `?taskNumber=${encodeURIComponent(taskNumber)}`
        }
      }
      // Client filter: Arena search expects `account` as CLIENT NAME (not id).
      // This supports advanced mode variables like <loop.currentItem> that resolve to a name.
      if (params['search-task-client']) {
        const clientName =
          typeof params['search-task-client'] === 'string'
            ? String(params['search-task-client']).trim()
            : params['search-task-client']?.name
        if (clientName) {
          url += `&account=${encodeURIComponent(clientName)}`
        }
      }

      // Note: name->ID resolution for project/assignee (and for project resolution requiring clientId)
      // happens in request.postProcess below, because url() must remain synchronous.

      if (params['search-task-project']) {
        const projectId =
          typeof params['search-task-project'] === 'string'
            ? String(params['search-task-project']).trim()
            : params['search-task-project']?.sysId
        if (projectId) {
          url += `&projectSysId=${encodeURIComponent(projectId)}`
        }
      }
      if (params['search-task-state']) {
        // Handle both array (basic mode) and string (advanced mode - comma-separated or variable)
        const stateValue = Array.isArray(params['search-task-state'])
          ? params['search-task-state'].join(',')
          : String(params['search-task-state']).trim()
        if (stateValue) {
          url += `&statusList=${stateValue}`
        }
      }
      if (params['search-task-visibility']) {
        if (params['search-task-visibility'] === 'Internal') {
          url += `&taskType=INTERNAL`
        }
        if (params['search-task-visibility'] === 'Client Facing') {
          url += `&taskType=CLIENT-FACING`
        }
      }
      if (params['search-task-assignee']) {
        const assigneeId =
          typeof params['search-task-assignee'] === 'string'
            ? String(params['search-task-assignee']).trim()
            : params['search-task-assignee']?.value
        if (assigneeId) {
          url += `&assigneeId=${encodeURIComponent(assigneeId)}`
        }
      }
      if (params._context?.workflowId) {
        url += `&workflowId=${params._context?.workflowId}`
      }

      if (params['search-task-due-date'] === 'Today') {
        const { startDate, endDate } = getToday()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Yesterday') {
        const { startDate, endDate } = getYesterday()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Tomorrow') {
        const { startDate, endDate } = getTomorrow()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'This Week') {
        const { startDate, endDate } = getCurrentWeek()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Next Week') {
        const { startDate, endDate } = getNextWeek()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Last Week') {
        const { startDate, endDate } = getLastWeek()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'This Month') {
        const { startDate, endDate } = getCurrentMonth()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Next Month') {
        const { startDate, endDate } = getNextMonth()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Last Month') {
        const { startDate, endDate } = getLastMonth()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Past Dates') {
        const { startDate, endDate } = getPastDate()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-due-date'] === 'Future Dates') {
        const { startDate, endDate } = getFutureDate()
        url += `&fromDate=${startDate}`
        url += `&toDate=${endDate}`
      }
      if (params['search-task-max-results']) {
        const pageSize = Number(params['search-task-max-results'])
        if (Number.isInteger(pageSize)) {
          url += `&pageSize=${pageSize}`
        }
      }
      return url
    },
    method: 'GET',
    headers: (params: SearchTaskQueryParams) => {
      return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    },
  },

  postProcess: async (result, params, executeTool) => {
    // Dynamic import to avoid client-side bundling issues
    const { resolveAssigneeId, resolveClientId, resolveProjectId } = await import(
      './utils/resolve-ids'
    )

    // If caller provided names (via <loop.currentItem> etc.), resolve to IDs and re-run the query once.
    // Only attempt when workflowId exists and we have at least one resolvable field.
    const workflowId = (params as any)?._context?.workflowId || (params as any)?.workflowId
    if (!workflowId) return result

    // If params already contain variables (<...>), don't try to resolve (we can't evaluate here).
    // Variables should resolve before tool execution; by the time we are here, values should be plain strings.
    const rawClient = (params as any)['search-task-client']
    const rawProject = (params as any)['search-task-project']
    const rawAssignee = (params as any)['search-task-assignee']

    const stringClient = typeof rawClient === 'string' ? rawClient.trim() : rawClient?.clientId
    const stringProject = typeof rawProject === 'string' ? rawProject.trim() : rawProject?.sysId
    const stringAssignee = typeof rawAssignee === 'string' ? rawAssignee.trim() : rawAssignee?.value

    // Heuristic: if these look like UUIDs, skip resolution.
    const looksLikeUuid = (v?: string) =>
      !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

    // We still resolve clientId internally (to resolve project/assignee), but we do NOT overwrite
    // the outgoing `search-task-client` param because the search endpoint expects account=name.
    const needsClientResolution = !!stringClient && !looksLikeUuid(stringClient)
    const needsProjectResolution = !!stringProject && !looksLikeUuid(stringProject)
    const needsAssigneeResolution = !!stringAssignee && !looksLikeUuid(stringAssignee)

    if (!needsClientResolution && !needsProjectResolution && !needsAssigneeResolution) {
      return result
    }

    // Resolve client first (needed to resolve project/assignee in some cases)
    const resolvedClientId = stringClient ? await resolveClientId(rawClient as any, workflowId) : ''

    const resolvedProjectId =
      stringProject && resolvedClientId
        ? await resolveProjectId(rawProject as any, resolvedClientId, workflowId)
        : looksLikeUuid(stringProject)
          ? stringProject
          : ''

    const resolvedAssigneeId =
      stringAssignee && resolvedClientId
        ? await resolveAssigneeId(
            rawAssignee as any,
            resolvedClientId,
            resolvedProjectId || undefined,
            workflowId
          )
        : looksLikeUuid(stringAssignee)
          ? stringAssignee
          : ''

    const nextParams: Record<string, any> = { ...(params as any) }
    // IMPORTANT: keep `search-task-client` as the original name/string for `account=...` filtering
    if (resolvedProjectId) nextParams['search-task-project'] = resolvedProjectId
    if (resolvedAssigneeId) nextParams['search-task-assignee'] = resolvedAssigneeId

    // Re-run the same tool once with resolved IDs.
    const rerun = await executeTool('arena_search_task', nextParams)
    return rerun
  },

  transformResponse: async (
    response: Response,
    params?: SearchTaskQueryParams
  ): Promise<SearchTaskResponse> => {
    const data = await response.json()
    const outputData = data.output || data

    // Extract first task for common field access
    const tasks = outputData?.tasks || []
    const firstTask = tasks.length > 0 ? tasks[0] : null

    return {
      success: true,
      output: {
        success: true,
        output: data,
        // Expose tasks array and pagination
        tasks: tasks,
        pagination: outputData?.pagination,
        // Expose common fields from first task for convenience
        task_id: firstTask?.sysId || firstTask?.id,
        id: firstTask?.id,
        sysId: firstTask?.sysId,
        task_name: firstTask?.name,
        name: firstTask?.name,
        description: firstTask?.description,
        taskNumber: firstTask?.taskNumber,
        status: firstTask?.status,
        arenaStatus: firstTask?.arenaStatus,
        client_id: firstTask?.clientId || firstTask?.customerId,
        customerId: firstTask?.clientId || firstTask?.customerId,
        project_id: firstTask?.projectId,
        projectId: firstTask?.projectId,
        group_id: firstTask?.epicId,
        epicId: firstTask?.epicId,
        assignee_id: firstTask?.assignedToId,
        assignedToId: firstTask?.assignedToId,
        projectName: firstTask?.projectName,
        customerName: firstTask?.clientName || firstTask?.customerName,
        epicName: firstTask?.epicName || firstTask?.groupName,
      },
    }
  },

  //this output config will override block output config
  outputs: {
    success: { type: 'boolean', description: 'Indicates if transform was successful' },
    output: { type: 'object', description: 'Output from Arena' },
    tasks: { type: 'array', description: 'Array of matching tasks' },
    pagination: { type: 'object', description: 'Pagination information' },
    // Common fields from first task for convenience
    task_id: { type: 'string', description: 'First task ID (sysId)' },
    id: { type: 'string', description: 'First task ID (id field)' },
    sysId: { type: 'string', description: 'First task system ID' },
    task_name: { type: 'string', description: 'First task name' },
    name: { type: 'string', description: 'First task name' },
    description: { type: 'string', description: 'First task description' },
    taskNumber: { type: 'string', description: 'First task number' },
    status: { type: 'string', description: 'First task status' },
    arenaStatus: { type: 'string', description: 'First task arena status' },
    client_id: { type: 'string', description: 'First task client ID (customerId)' },
    customerId: { type: 'string', description: 'First task customer ID' },
    project_id: { type: 'string', description: 'First task project ID' },
    projectId: { type: 'string', description: 'First task project ID' },
    group_id: { type: 'string', description: 'First task group ID (epicId)' },
    epicId: { type: 'string', description: 'First task epic/group ID' },
    assignee_id: { type: 'string', description: 'First task assignee ID (assignedToId)' },
    assignedToId: { type: 'string', description: 'First task assigned user ID' },
    projectName: { type: 'string', description: 'First task project name' },
    customerName: { type: 'string', description: 'First task customer/client name' },
    epicName: { type: 'string', description: 'First task epic/group name' },
  },
}
