import { Node, Edge } from 'reactflow'
import { BlockType, OutputType, SubBlockType } from '@/blocks/types/block'

export interface Position {
  x: number
  y: number
}

export interface BlockState {
  id: string
  type: BlockType
  name: string
  position: Position
  inputs: Record<string, BlockInput>
  outputType: OutputType
}

export interface BlockInput {
  id: string
  type: SubBlockType
  value: string | number | string[][] | null
}

export interface WorkflowState {
  blocks: Record<string, BlockState>
  edges: Edge[]
  selectedBlockId: string | null
}

export interface WorkflowActions {
  addBlock: (
    id: string,
    type: BlockType,
    name: string,
    position: Position
  ) => void
  updateBlockPosition: (id: string, position: Position) => void
  updateBlockInput: (blockId: string, inputId: string, value: any) => void
  removeBlock: (id: string) => void
  addEdge: (edge: Edge) => void
  removeEdge: (edgeId: string) => void
  setSelectedBlock: (id: string | null) => void
  clear: () => void
}

export type WorkflowStore = WorkflowState & WorkflowActions 