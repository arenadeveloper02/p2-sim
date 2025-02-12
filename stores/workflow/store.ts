import { Edge } from 'reactflow'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { getBlock } from '@/blocks'
import { resolveOutputType } from '@/blocks/utils'
import { WorkflowStoreWithHistory, pushHistory, withHistory } from './middleware'
import { Loop, Position, SubBlockState } from './types'
import { detectCycle } from './utils'

const initialState = {
  blocks: {},
  edges: [],
  loops: {},
  lastSaved: undefined,
  history: {
    past: [],
    present: {
      state: { blocks: {}, edges: [], loops: {} },
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

          // Validate responseFormat if it's the agent block's responseFormat input
          if (blockConfig.type === 'agent' && subBlockId === 'responseFormat' && value) {
            console.log('Validating responseFormat input:', {
              type: typeof value,
              rawValue: value,
            })

            try {
              // Parse the input string to validate JSON but keep original string value
              const parsed = JSON.parse(value)
              console.log('Parsed responseFormat:', parsed)

              // Simple validation of required schema structure
              if (!parsed.fields || !Array.isArray(parsed.fields)) {
                console.error('Validation failed: missing fields array')
                throw new Error('Response format must have a fields array')
              }

              for (const field of parsed.fields) {
                console.log('Validating field:', field)
                if (!field.name || !field.type) {
                  console.error('Validation failed: field missing name or type', field)
                  throw new Error('Each field must have a name and type')
                }
                if (!['string', 'number', 'boolean', 'array', 'object'].includes(field.type)) {
                  console.error('Validation failed: invalid field type', field)
                  throw new Error(
                    `Invalid type "${field.type}" - must be one of: string, number, boolean, array, object`
                  )
                }
              }

              console.log('responseFormat validation successful')
              // Don't modify the value, keep it as the original string
            } catch (error: any) {
              console.error('responseFormat validation error:', error)
              throw new Error(`Invalid JSON schema: ${error.message}`)
            }
          }

          // Create new subBlocks state with the original value
          const newSubBlocks = {
            ...block.subBlocks,
            [subBlockId]: {
              ...block.subBlocks[subBlockId],
              value:
                // Keep tools as arrays
                subBlockId === 'tools' && Array.isArray(value)
                  ? value
                  : // Keep responseFormat as string
                    subBlockId === 'responseFormat'
                    ? value
                    : // For all other values, use the previous logic of stringifying
                      typeof value === 'string'
                      ? value
                      : JSON.stringify(value, null, 2),
            },
          }

          // Resolve new outputs
          const newOutputs = resolveOutputType(blockConfig.workflow.outputs, newSubBlocks)

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
              horizontalHandles: true,
              isWide: false,
              height: 0,
            },
          },
          edges: [...get().edges],
          loops: { ...get().loops },
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
          edges: [...get().edges].filter((edge) => edge.source !== id && edge.target !== id),
          loops: { ...get().loops },
        }

        // Remove the block from any loops that contain it
        Object.entries(newState.loops).forEach(([loopId, loop]) => {
          if (loop.nodes.includes(id)) {
            // If the loop would only have 1 or 0 nodes after removal, delete the loop
            if (loop.nodes.length <= 2) {
              delete newState.loops[loopId]
            } else {
              // Otherwise, just remove the node from the loop
              newState.loops[loopId] = {
                ...loop,
                nodes: loop.nodes.filter((nodeId) => nodeId !== id),
              }
            }
          }
        })

        // Delete the block itself
        delete newState.blocks[id]

        set(newState)
        pushHistory(set, get, newState, 'Remove block')
        get().updateLastSaved()
      },

      addEdge: (edge: Edge) => {
        const newEdge = {
          id: edge.id || crypto.randomUUID(),
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        }

        const newEdges = [...get().edges, newEdge]

        // Recalculate all loops after adding the edge
        const newLoops: Record<string, Loop> = {}
        const processedPaths = new Set<string>()

        // Check for cycles from each node
        const nodes = new Set(newEdges.map((e) => e.source))
        nodes.forEach((node) => {
          const { paths } = detectCycle(newEdges, node)
          paths.forEach((path) => {
            // Create a canonical path representation for deduplication
            const canonicalPath = [...path].sort().join(',')
            if (!processedPaths.has(canonicalPath)) {
              const loopId = crypto.randomUUID()
              newLoops[loopId] = {
                id: loopId,
                nodes: path,
              }
              processedPaths.add(canonicalPath)
            }
          })
        })

        const newState = {
          blocks: { ...get().blocks },
          edges: newEdges,
          loops: newLoops,
        }

        set(newState)
        pushHistory(set, get, newState, 'Add connection')
        get().updateLastSaved()
      },

      removeEdge: (edgeId: string) => {
        const newEdges = get().edges.filter((edge) => edge.id !== edgeId)

        // Recalculate all loops after edge removal
        const newLoops: Record<string, Loop> = {}
        const processedPaths = new Set<string>()

        // Check for cycles from each node
        const nodes = new Set(newEdges.map((e) => e.source))
        nodes.forEach((node) => {
          const { paths } = detectCycle(newEdges, node)
          paths.forEach((path) => {
            // Create a canonical path representation for deduplication
            const canonicalPath = [...path].sort().join(',')
            if (!processedPaths.has(canonicalPath)) {
              const loopId = crypto.randomUUID()
              newLoops[loopId] = {
                id: loopId,
                nodes: path,
              }
              processedPaths.add(canonicalPath)
            }
          })
        })

        const newState = {
          blocks: { ...get().blocks },
          edges: newEdges,
          loops: newLoops,
        }

        set(newState)
        pushHistory(set, get, newState, 'Remove connection')
        get().updateLastSaved()
      },

      clear: () => {
        const newState = {
          blocks: {},
          edges: [],
          loops: {},
          history: {
            past: [],
            present: {
              state: { blocks: {}, edges: [], loops: {} },
              timestamp: Date.now(),
              action: 'Initial state',
            },
            future: [],
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
          x: block.position.x + 250,
          y: block.position.y + 20,
        }

        // More efficient name handling
        const match = block.name.match(/(.*?)(\d+)?$/)
        const newName =
          match && match[2] ? `${match[1]}${parseInt(match[2]) + 1}` : `${block.name} 1`

        const newSubBlocks = Object.entries(block.subBlocks).reduce(
          (acc, [subId, subBlock]) => ({
            ...acc,
            [subId]: {
              ...subBlock,
              value: JSON.parse(JSON.stringify(subBlock.value)),
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
              name: newName,
              position: offsetPosition,
              subBlocks: newSubBlocks,
            },
          },
          edges: [...get().edges],
          loops: { ...get().loops },
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

      updateBlockName: (id: string, name: string) => {
        const newState = {
          blocks: {
            ...get().blocks,
            [id]: {
              ...get().blocks[id],
              name,
            },
          },
          edges: [...get().edges],
          loops: { ...get().loops },
        }

        set(newState)
        pushHistory(set, get, newState, `${name} block name updated`)
        get().updateLastSaved()
      },

      toggleBlockWide: (id: string) => {
        set((state) => ({
          blocks: {
            ...state.blocks,
            [id]: {
              ...state.blocks[id],
              isWide: !state.blocks[id].isWide,
            },
          },
          edges: [...state.edges],
          loops: { ...get().loops },
        }))
      },

      updateBlockHeight: (id: string, height: number) => {
        set((state) => ({
          blocks: {
            ...state.blocks,
            [id]: {
              ...state.blocks[id],
              height,
            },
          },
          edges: [...state.edges],
        }))
      },
    })),
    { name: 'workflow-store' }
  )
)
