import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Edge } from 'reactflow'
import { Position, SubBlockState, WorkflowStore } from './types'
import { getBlock } from '@/blocks'
import { withHistory, WorkflowStoreWithHistory, pushHistory } from './history-middleware'
import { resolveOutputType } from '@/blocks/utils'

const initialState = {
  blocks: {},
  edges: [],
  history: {
    past: [],
    present: {
      state: { blocks: {}, edges: [] },
      timestamp: Date.now(),
      action: 'Initial state',
    },
    future: [],
  },
}

export const useWorkflowStore = create<WorkflowStoreWithHistory>()(
  devtools(
    withHistory((set, get) => ({
      ...initialState,
      undo: () => {},
      redo: () => {},
      canUndo: () => false,
      canRedo: () => false,

      updateSubBlock: (blockId: string, subBlockId: string, value: any) => {
        set((state) => {
          const block = state.blocks[blockId]
          if (!block) return state
          
          const blockConfig = getBlock(block.type)
          if (!blockConfig) return state

          // Create new subBlocks state
          const newSubBlocks = {
            ...block.subBlocks,
            [subBlockId]: {
              ...block.subBlocks[subBlockId],
              value
            },
          }

          // Resolve new outputs
          const newOutputs = resolveOutputType(
            blockConfig.workflow.outputs,
            newSubBlocks
          )

          return {
            blocks: {
              ...state.blocks,
              [blockId]: {
                ...block,
                subBlocks: newSubBlocks,
                outputs: newOutputs,
              },
            },
          }
        })
      },

      addBlock: (id: string, type: string, name: string, position: Position) => {
        const blockConfig = getBlock(type)
        if (!blockConfig) return

        const subBlocks: Record<string, SubBlockState> = {}
        blockConfig.workflow.subBlocks.forEach((subBlock) => {
          const subBlockId = subBlock.id
          subBlocks[subBlockId] = {
            id: subBlockId,
            type: subBlock.type,
            value: null,
          }
        })

        const outputs = resolveOutputType(blockConfig.workflow.outputs, subBlocks)

        const newState = {
          blocks: {
            ...get().blocks,
            [id]: {
              id,
              type,
              name,
              position,
              subBlocks,
              outputs,
            },
          },
          edges: [...get().edges],
        }

        set(newState)
        pushHistory(set, get, newState, `Add ${type} block`)
      },

      updateBlockPosition: (id: string, position: Position) => {
        set((state) => ({
          blocks: {
            ...state.blocks,
            [id]: {
              ...state.blocks[id],
              position,
            },
          },
          edges: [...state.edges],
        }))
      },

      removeBlock: (id: string) => {
        const newState = {
          blocks: { ...get().blocks },
          edges: [...get().edges].filter(
            (edge) => edge.source !== id && edge.target !== id
          ),
        }
        delete newState.blocks[id]
        
        set(newState)
        pushHistory(set, get, newState, 'Remove block')
      },

      addEdge: (edge: Edge) => {
        const newState = {
          blocks: { ...get().blocks },
          edges: [
            ...get().edges,
            {
              id: edge.id || crypto.randomUUID(),
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle
            },
          ],
        }
        
        set(newState)
        pushHistory(set, get, newState, 'Add connection')
      },

      removeEdge: (edgeId: string) => {
        const newState = {
          blocks: { ...get().blocks },
          edges: get().edges.filter((edge) => edge.id !== edgeId),
        }
        
        set(newState)
        pushHistory(set, get, newState, 'Remove connection')
      },

      clear: () => {
        const newState = initialState
        set(newState)
        pushHistory(set, get, newState, 'Clear workflow')
      },
    })),
    { name: 'workflow-store' }
  )
) 