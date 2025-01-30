import { Node, Edge } from 'reactflow'
import { OutputType, SubBlockType } from '@/blocks/types'
import { WorkflowHistory } from './history-types'

export interface Position {
  x: number
  y: number
}

export interface BlockState {
  id: string
  type: string
  name: string
  position: Position
  subBlocks: Record<string, SubBlockState>
  outputs: Record<string, OutputType>
  enabled: boolean
}

export interface SubBlockState {
  id: string
  type: SubBlockType
  value: string | number | string[][] | null
}

export interface WorkflowState {
  blocks: Record<string, BlockState>
  edges: Edge[]
  lastSaved?: number
}

export interface WorkflowActions {
  addBlock: (
    id: string,
    type: string,
    name: string,
    position: Position
  ) => void
  updateBlockPosition: (id: string, position: Position) => void
  updateSubBlock: (blockId: string, subBlockId: string, subBlock: SubBlockState) => void
  removeBlock: (id: string) => void
  addEdge: (edge: Edge) => void
  removeEdge: (edgeId: string) => void
  clear: () => void
  updateLastSaved: () => void
  toggleBlockEnabled: (id: string) => void
  duplicateBlock: (id: string) => void
}

export type WorkflowStore = WorkflowState & WorkflowActions 