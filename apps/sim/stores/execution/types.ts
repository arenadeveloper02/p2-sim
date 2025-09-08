import type { Executor } from '@/executor'
import type { ExecutionContext } from '@/executor/types'
import { C } from 'vitest/dist/chunks/environment.d.cL3nLXbE.js'

export interface ExecutionState {
  activeBlockIds: Set<string>
  isExecuting: boolean
  isDebugging: boolean
  pendingBlocks: string[]
  executor: Executor | null
  debugContext: ExecutionContext | null
  currentRespondToChatContext: ExecutionContext | null
  autoPanDisabled: boolean
  isRespondToChatBlockRunning?: boolean
}

export interface ExecutionActions {
  setActiveBlocks: (blockIds: Set<string>) => void
  setIsExecuting: (isExecuting: boolean) => void
  setIsDebugging: (isDebugging: boolean) => void
  setPendingBlocks: (blockIds: string[]) => void
  setExecutor: (executor: Executor | null) => void
  setDebugContext: (context: ExecutionContext | null) => void
  setAutoPanDisabled: (disabled: boolean) => void
  setIsRespondToChatBlockRunning: (isRespondToChatBlockRunning: boolean) => void
  setCurrentRespondToChatContext: (Context: ExecutionContext | null) => void
  reset: () => void
}

export const initialState: ExecutionState = {
  activeBlockIds: new Set(),
  isExecuting: false,
  isDebugging: false,
  pendingBlocks: [],
  executor: null,
  debugContext: null,
  autoPanDisabled: false,
  isRespondToChatBlockRunning: false,
  currentRespondToChatContext: null,
}

// Types for panning functionality
export type PanToBlockCallback = (blockId: string) => void
export type SetPanToBlockCallback = (callback: PanToBlockCallback | null) => void
