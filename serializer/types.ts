import { Position } from '@/stores/workflow/types'
import { BlockOutput, ParamType } from '@/blocks/types'

export interface SerializedWorkflow {
  version: string
  blocks: SerializedBlock[]
  connections: SerializedConnection[]
}

export interface SerializedConnection {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface SerializedBlock {
  id: string
  position: Position
  config: {
    tool: string
    params: Record<string, any>
  }
  inputs: Record<string, ParamType>
  outputs: Record<string, BlockOutput>
  metadata?: {
    title?: string
    description?: string
    category?: string
    icon?: string
    color?: string
    type: string
  }
  enabled: boolean
}
