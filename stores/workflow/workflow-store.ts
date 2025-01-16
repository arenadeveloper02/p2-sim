import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Edge } from 'reactflow'
import { BlockType } from '@/blocks/types/block'
import { Position } from '@/stores/workflow/types'
import { WorkflowStore } from './types'
import { getBlock } from '@/blocks/configs'

const initialState = {
  blocks: {},
  edges: [],
  selectedBlockId: null,
}

export const useWorkflowStore = create<WorkflowStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      addBlock: (id: string, type: BlockType, name: string, position: Position) => {
        const blockConfig = getBlock(type)
        if (!blockConfig) return

        const inputs: Record<string, any> = {}
        blockConfig.workflow.subBlocks.forEach((subBlock) => {
          inputs[subBlock.id || crypto.randomUUID()] = {
            id: subBlock.id || crypto.randomUUID(),
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
              inputs,
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

      updateBlockInput: (blockId: string, inputId: string, value: any) => {
        set((state) => ({
          blocks: {
            ...state.blocks,
            [blockId]: {
              ...state.blocks[blockId],
              inputs: {
                ...state.blocks[blockId].inputs,
                [inputId]: {
                  ...state.blocks[blockId].inputs[inputId],
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
            selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId,
          }
        })
      },

      addEdge: (edge: Edge) => {
        set((state) => ({
          edges: [...state.edges, edge],
        }))
      },

      removeEdge: (edgeId: string) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== edgeId),
        }))
      },

      setSelectedBlock: (id: string | null) => {
        set({ selectedBlockId: id })
      },

      clear: () => {
        set(initialState)
      },
    }),
    { name: 'workflow-store' }
  )
) 