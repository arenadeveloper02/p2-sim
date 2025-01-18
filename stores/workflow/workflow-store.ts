import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Edge } from 'reactflow'
import { Position, WorkflowStore } from './types'
import { getBlock } from '@/blocks'

const initialState = {
  blocks: {},
  edges: [],
}

export const useWorkflowStore = create<WorkflowStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      addBlock: (id: string, type: string, name: string, position: Position) => {
        const blockConfig = getBlock(type)
        if (!blockConfig) return

        const subBlocks: Record<string, any> = {}
        blockConfig.workflow.subBlocks.forEach((subBlock) => {
          const subBlockId = subBlock.id || crypto.randomUUID()
          subBlocks[subBlockId] = {
            id: subBlockId,
            type: subBlock.type,
            value: null,
          }
        })

        set((state) => ({
          blocks: {
            ...state.blocks,
            [id]: {
              id,
              type,
              name,
              position,
              subBlocks,
              outputType: 
                typeof blockConfig.workflow.outputType === 'string'
                  ? blockConfig.workflow.outputType
                  : blockConfig.workflow.outputType.default,
            },
          },
        }))
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
        }))
      },

      updateSubBlock: (blockId: string, subBlockId: string, value: any) => {
        set((state) => ({
          blocks: {
            ...state.blocks,
            [blockId]: {
              ...state.blocks[blockId],
              subBlocks: {
                ...state.blocks[blockId].subBlocks,
                [subBlockId]: {
                  ...state.blocks[blockId].subBlocks[subBlockId],
                  value,
                },
              },
            },
          },
        }))
      },

      removeBlock: (id: string) => {
        set((state) => {
          const { [id]: _, ...remainingBlocks } = state.blocks
          const remainingEdges = state.edges.filter(
            (edge) => edge.source !== id && edge.target !== id
          )
          return {
            blocks: remainingBlocks,
            edges: remainingEdges,
          }
        })
      },

      addEdge: (edge: Edge) => {
        set((state) => ({
          edges: [
            ...state.edges,
            {
              id: edge.id || crypto.randomUUID(),
              source: edge.source,
              target: edge.target,
            },
          ],
        }))
      },

      removeEdge: (edgeId: string) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== edgeId),
        }))
      },

      clear: () => {
        set(initialState)
      },
    }),
    { name: 'workflow-store' }
  )
) 