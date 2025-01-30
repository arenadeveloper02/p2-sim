import { BlockOutput } from '@/blocks/types'

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
  request: {
    url: string | ((params: P) => string) 
    method: string 
    headers: (params: P) => Record<string, string> 
    body?: (params: P) => Record<string, any> 
  } 
  transformResponse: (response: any) => Promise<{
    success: boolean
    output: O
    error?: string
  }>
  transformError: (error: any) => string 
}

export interface ToolRegistry {
  [key: string]: Tool 
}

export interface ExecutionContext {
  workflowId: string 
  blockStates: Map<string, BlockOutput> 
  metadata?: Record<string, any> 
}

export interface ExecutionResult {
  success: boolean 
  output: BlockOutput
  error?: string 
  metadata?: {
    duration: number 
    startTime: string 
    endTime: string 
  } 
} 