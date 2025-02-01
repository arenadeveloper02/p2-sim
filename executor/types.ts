import { BlockOutput } from '@/blocks/types'

/**
 * Describes a single block's logs, including timing and success/failure state.
 */
export interface BlockLog {
  blockId: string
  blockTitle?: string
  success: boolean
  error?: string
  startedAt: string
  endedAt: string
  durationMs: number
  output?: any
  blockType?: string
}

/**
 * Describes the runtime context for executing a workflow,
 * including all block outputs (blockStates), metadata for timing, and block logs.
 */
export interface ExecutionContext {
  workflowId: string
  blockStates: Map<string, BlockOutput>
  // Make metadata non-optional so we can assign .startTime or .endTime without TS warnings
  metadata: {
    startTime?: string
    endTime?: string
    // You can keep an index signature if you want to store extra fields
    [key: string]: any
  }
  // We store logs in an array so the final result includes a step-by-step record
  blockLogs: BlockLog[]
}

/**
 * The complete result from executing the workflow. Includes success/fail,
 * the "last block" output, optional error, timing metadata, and logs of each block's run.
 */
export interface ExecutionResult {
  success: boolean
  output: BlockOutput
  error?: string
  metadata?: {
    duration: number
    startTime: string
    endTime: string
  }
  // Detailed logs of what happened in each block
  logs?: BlockLog[]
}

/**
 * Defines how a particular tool is invoked (URLs, headers, etc.), how it transforms responses
 * and handles errors. Used by blocks that reference a particular tool ID.
 */
export interface Tool<P = any, O = Record<string, any>> {
  id: string
  name: string
  description: string
  version: string
  params: {
    [key: string]: {
      type: string
      required?: boolean
      description?: string
      default?: any
    }
  }
  request?: {
    url?: string | ((params: P) => string)
    method?: string
    headers?: (params: P) => Record<string, string>
    body?: (params: P) => Record<string, any>
  }
  transformResponse?: (response: any) => Promise<{
    success: boolean
    output: O
    error?: string
  }>
  transformError?: (error: any) => string
}

/**
 * A registry of Tools, keyed by their IDs or names.
 */
export interface ToolRegistry {
  [key: string]: Tool
} 