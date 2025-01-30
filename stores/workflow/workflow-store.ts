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
  lastSaved: undefined,
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
      revertToHistoryState: () => {},

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
              enabled: true,
            },
          },
          edges: [...get().edges],
        }

        set(newState)
        pushHistory(set, get, newState, `Add ${type} block`)
        get().updateLastSaved()
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
        get().updateLastSaved()
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
        get().updateLastSaved()
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
        get().updateLastSaved()
      },

      removeEdge: (edgeId: string) => {
        const newState = {
          blocks: { ...get().blocks },
          edges: get().edges.filter((edge) => edge.id !== edgeId),
        }
        
        set(newState)
        pushHistory(set, get, newState, 'Remove connection')
        get().updateLastSaved()
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
              action: 'Initial state'
            },
            future: []
          },
          lastSaved: Date.now(),
        }
        set(newState)
        return newState
      },

      updateLastSaved: () => {
        set({ lastSaved: Date.now() })
      },

      toggleBlockEnabled: (id: string) => {
        const newState = {
          blocks: {
            ...get().blocks,
            [id]: {
              ...get().blocks[id],
              enabled: !get().blocks[id].enabled,
            },
          },
          edges: [...get().edges],
        }
        
        set(newState)
        get().updateLastSaved()
      },

      duplicateBlock: (id: string) => {
        const block = get().blocks[id]
        if (!block) return

        const newId = crypto.randomUUID()
        const offsetPosition = {
          x: block.position.x + 250, // Offset to the right
          y: block.position.y + 20,  // Slight offset down
        }

        // Deep clone the block's subBlocks
        const newSubBlocks = Object.entries(block.subBlocks).reduce(
          (acc, [subId, subBlock]) => ({
            ...acc,
            [subId]: {
              ...subBlock,
              value: JSON.parse(JSON.stringify(subBlock.value)), // Deep clone values
            },
          }),
          {}
        )

        const newState = {
          blocks: {
            ...get().blocks,
            [newId]: {
              ...block,
              id: newId,
              name: `${block.name}`,
              position: offsetPosition,
              subBlocks: newSubBlocks,
            },
          },
          edges: [...get().edges],
        }

        set(newState)
        pushHistory(set, get, newState, `Duplicate ${block.type} block`)
        get().updateLastSaved()
      },

      toggleBlockHandles: (id: string) => {
        const newState = {
          blocks: {
            ...get().blocks,
            [id]: {
              ...get().blocks[id],
              horizontalHandles: !get().blocks[id].horizontalHandles,
            },
          },
          edges: [...get().edges],
        }
        
        set(newState)
        get().updateLastSaved()
      },
    })),
    { name: 'workflow-store' }
  )
) 