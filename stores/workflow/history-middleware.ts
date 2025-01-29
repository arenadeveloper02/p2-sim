import { StateCreator } from 'zustand'
import { WorkflowState, WorkflowStore } from './types'
import { HistoryEntry, WorkflowHistory, HistoryActions } from './history-types'

const MAX_HISTORY_LENGTH = 20

export interface WorkflowStoreWithHistory extends WorkflowStore, HistoryActions {
  history: WorkflowHistory
}

export const withHistory = (
  config: StateCreator<WorkflowStoreWithHistory>
): StateCreator<WorkflowStoreWithHistory> => {
  return (set, get, api) => {
    const initialState = config(set, get, api)
    const initialHistoryEntry: HistoryEntry = {
      state: {
        blocks: initialState.blocks,
        edges: initialState.edges,
      },
      timestamp: Date.now(),
      action: 'Initial state',
    }

    return {
      ...initialState,
      history: {
        past: [],
        present: initialHistoryEntry,
        future: [],
      },

      canUndo: () => get().history.past.length > 0,
      canRedo: () => get().history.future.length > 0,

      undo: () => {
        const { history, ...state } = get()
        if (history.past.length === 0) return

        const previous = history.past[history.past.length - 1]
        const newPast = history.past.slice(0, history.past.length - 1)

        set({
          ...state,
          ...previous.state,
          history: {
            past: newPast,
            present: previous,
            future: [history.present, ...history.future],
          },
        })
      },

      redo: () => {
        const { history, ...state } = get()
        if (history.future.length === 0) return

        const next = history.future[0]
        const newFuture = history.future.slice(1)

        set({
          ...state,
          ...next.state,
          history: {
            past: [...history.past, history.present],
            present: next,
            future: newFuture,
          },
        })
      },

      clear: () => {
        const newState = {
          blocks: {},
          edges: [],
          history: {
            past: [],
            present: {
              state: { blocks: {}, edges: [] },
              timestamp: Date.now(),
              action: 'Clear workflow'
            },
            future: []
          }
        }
        set(newState)
        return newState
      },
    }
  }
}

export const createHistoryEntry = (
  state: WorkflowState,
  action: string
): HistoryEntry => ({
  state: {
    blocks: { ...state.blocks },
    edges: [...state.edges ],
  },
  timestamp: Date.now(),
  action,
})

export const pushHistory = (
  set: (
    partial:
      | Partial<WorkflowStoreWithHistory>
      | ((
          state: WorkflowStoreWithHistory
        ) => Partial<WorkflowStoreWithHistory>),
    replace?: boolean
  ) => void,
  get: () => WorkflowStoreWithHistory,
  newState: WorkflowState,
  action: string
) => {
  const { history } = get()
  const newEntry = createHistoryEntry(newState, action)

  set({
    history: {
      past: [...history.past, history.present].slice(-MAX_HISTORY_LENGTH),
      present: newEntry,
      future: [],
    },
  })
} 