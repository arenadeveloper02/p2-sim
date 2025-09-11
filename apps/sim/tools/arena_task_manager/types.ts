import type { ToolResponse } from '@/tools/types'

export type ArenaCreateTaskParams = {
  operation: string
  'task-name': string
  'task-description': string
  'planned-start-date': Date
  'planned-end-date': Date
  'task-type': string
  'task-client': string
  'task-project': string
  'task-group'?: {
    id: string
    name: string
  }
  'task-task'?: string
  'task-assignee': string
}

export interface ArenaCreateTaskResponse extends ToolResponse {
  output: {
    ts: string
    name: string
    id: string
    success: boolean
  }
}
