import type { ToolResponse } from '@/tools/types'

/** Arena create-task tools: the tool id selects the flow; params do not include `operation`. */
export type ArenaCreateTaskToolParams = {
  'task-name': string
  'task-description': string
  // Basic mode fields (optional when in advanced mode)
  'task-client'?: {
    clientId: string
    name: string
  }
  'task-project'?: string | { sysId: string; name: string; customDisplayValue?: string }
  'task-group'?: {
    id: string
    name: string
    customDisplayValue?: string
  }
  'task-task'?: string | { sysId: string; id?: string; name: string; customDisplayValue?: string }
  'task-assignee'?: string | { value: string; label: string; customDisplayValue?: string }
  // Advanced mode fields
  'task-client-name'?: string
  'task-project-name'?: string
  'task-epic-name'?: string
  'task-assignee-email'?: string
  'task-number'?: string
  _context: {
    workflowId: string
  }
}

export interface ArenaCreateTaskResponse extends ToolResponse {}

export interface SearchTaskResponse extends ToolResponse {}

export interface SearchTaskApiResponse {
  errors: string | null
  errorMessage: string | null
  pagination: {
    totalRecords: number
    totalPages: number
    recordsPerPage: number
    pageNumber: number
    pageSize: number
    startRange: number
    endRange: number
  }
  tasks: Task[]
}
/** `arena_search_task` — client/project/state/filters only (no name param; use `arena_search_task_simple` for name search). */
export interface SearchTaskQueryParams {
  'search-task-client'?: {
    clientId: string
    name: string
  }
  'search-task-project'?: string | { sysId: string; name: string; customDisplayValue?: string }
  'search-task-state'?: string[]
  'search-task-visibility'?: string
  'search-task-assignee'?: string | { value: string; label: string; customDisplayValue?: string }
  'search-task-due-date'?: string
  'search-task-max-results'?: number
  _context: {
    workflowId: string
  }
}

/** `arena_search_task_simple` — task name/number only; same search API, minimal query. */
export interface SearchTaskSimpleQueryParams {
  'search-task-name'?: string
  _context: {
    workflowId: string
  }
}

export type ArenaSaveSummaryParams = {
  'save-summary-client': {
    clientId: string
    name: string
  }
  'save-summary-text': string
  _context: {
    workflowId: string
  }
}

export interface ArenaSaveSummaryResponse extends ToolResponse {}

/** `arena_comments` — selectors on the block; uses the standard comments API. */
export type ArenaCommentsParams = {
  'comment-client'?: {
    clientId: string
    name: string
  }
  'comment-project'?: string | { sysId: string; name: string; customDisplayValue?: string }
  'comment-group'?: {
    id: string
    name: string
    customDisplayValue?: string
  }
  'comment-task'?:
    | string
    | { sysId: string; id?: string; name: string; customDisplayValue?: string }
  'comment-text': string
  'comment-client-note'?: boolean
  _context: {
    workflowId: string
  }
}

export interface ArenaCommentsResponse extends ToolResponse {}

/** `arena_comments_task_number` — task # + To/CC; uses comments-updated API. */
export type ArenaCommentsByTaskNumberParams = {
  'comment-task-number': string
  'comment-to'?: string
  'comment-cc'?: string
  'comment-text': string
  'comment-client-note'?: boolean
  _context: {
    workflowId: string
  }
}

export interface ArenaCommentsByTaskNumberResponse extends ToolResponse {}

/** Canonical merge puts the active client here: selector object (basic) or client ID string (advanced). */
export type ArenaGetMeetingsParams = {
  'get-meetings-client'?: string | { clientId: string; name: string }
  'get-meetings-period': string
  _context: {
    workflowId: string
  }
}

export interface ArenaGetMeetingsResponse extends ToolResponse {}

export type ArenaGetMyTasksParams = {
  _context: {
    workflowId: string
  }
}

export interface ArenaGetMyTasksResponse extends ToolResponse {}

export type ArenaGetMyOverdueTasksParams = {
  _context: {
    workflowId: string
  }
}

export interface ArenaGetMyOverdueTasksResponse extends ToolResponse {}

export type ArenaGetTokenParams = {
  _context?: {
    workflowId?: string
    workspaceId?: string
    executionId?: string
    isDeployedContext?: boolean
    userId?: string
    sessionUserId?: string
    workflowUserId?: string
    userEmail?: string
  }
}

export interface ArenaGetTokenResponse extends ToolResponse {}

export type ArenaClientUpdatedTasksParams = {
  'client-updated-tasks-client'?: {
    clientId: string
    name: string
  }
  'client-updated-tasks-client-id'?: string
  'client-updated-tasks-period': string
  'client-updated-tasks-page-number'?: number | string
  'client-updated-tasks-page-size'?: number | string
  _context?: {
    workflowId?: string
  }
}

export interface ArenaClientUpdatedTasksResponse extends ToolResponse {}

export interface ArenaClientUpdatedTasksApiResponse {
  errors: string | null
  errorMessage: string | null
  pagination: {
    totalRecords: number
    totalPages: number
    recordsPerPage: number
    pageNumber: number
    pageSize: number
    startRange: number
    endRange: number
    noOfRecordsPerPage: number
  }
  tasks: Task[]
}

export type ArenaConversationSummaryParams = {
  'conversation-summary-task-id': string
  _context: {
    workflowId: string
  }
}

export interface ArenaConversationSummaryResponse extends ToolResponse {}

export type ArenaProjectSummaryParams = {
  'project-summary-cid': string
  _context: {
    workflowId: string
  }
}

export interface ArenaProjectSummaryResponse extends ToolResponse {}

export interface Task {
  errors: string | null
  errorMessage: string | null
  name: string
  id: string
  type: string
  description: string | null
  deliverable: string | null
  remarks: string | null
  status: string
  groupName: string | null
  projectName: string | null
  clientName: string | null
  clientId: string | null
  additionalAssignee: string | null
  assignedToId: string | null
  assignedBy: string | null
  additionalAssignees: string[]
  assignedTo: string | null
  state: string | null
  department: string | null
  sysId: string
  deliverableTasks: string | null
  module: string | null
  moduleId: string | null
  customerId: string | null
  businessService: string | null
  projectId: string | null
  actionType: string | null
  showArena: boolean
  relatedItemType: string | null
  workFlowSysId: string | null
  fromClientRequest: {
    requestId: string | null
    requestSysId: string | null
    requestName: string | null
  }[]
  priority: string | null
  arenaState: string
  details: string | null
  estimatedStart: string | null
  estimatedEnd: string | null
  plannedStart: string | null
  plannedEnd: string | null
  plannedDuration: string | null
  plannedEffort: string | null
  allocatedEffort: string | null
  actualEffort: string | null
  changeInProgress: string | null
  taskType: string | null
  outOfScope: string | null
  ownerId: string | null
  watchList: string | null
  taskList: string | null
  key: string | null
  messageUpdatedTs: string | null
  favorite: string | null
  incidentId: string | null
  closedBy: string | null
  closedAt: string | null
  taskHtmlDescription: string | null
  taskrequest: string | null
  messageCommentUpdatedTs: string | null
  messageAttachmentUpdatedTs: string | null
  documentLink: string | null
  qcLink: string | null
  workFlowStage: string | null
  project: string | null
  epicId: string | null
  epicName: string | null
  ownerName: string | null
  createdBy: string | null
  plannedStartDate: string | null
  plannedEndDate: string | null
  arenaStatus: string | null
  completionDate: string | null
  recurring: boolean
  recurringData: string | null
  document: string | null
  extraData: Record<string, unknown>
  deliverableId: string | null
  checkListItems: string | null
  checkList: string | null
  catalogId: string | null
  catalogName: string | null
  stateManagementId: string | null
  stateManagementName: string | null
  versionType: string | null
  catalogStateId: string | null
  catalogStateName: string | null
  taskNumber: string | null
  archived: string | null
  typeDeliverable: boolean
}
