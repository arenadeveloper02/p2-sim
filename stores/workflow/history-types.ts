import { WorkflowState } from './types'

export interface HistoryEntry {
  state: WorkflowState
  timestamp: number
  action: string
}

export interface WorkflowHistory {
  past: HistoryEntry[]
  present: HistoryEntry
  future: HistoryEntry[]
}

export interface HistoryActions {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
} 