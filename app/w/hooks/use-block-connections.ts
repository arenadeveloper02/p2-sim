import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { shallow } from 'zustand/shallow'

export interface ConnectedBlock {
  id: string
  type: string
  outputType: string
  name: string
}

export function useBlockConnections(blockId: string) {
  const { edges, blocks } = useWorkflowStore(
    (state) => ({
      edges: state.edges,
      blocks: state.blocks
    }),
    shallow
  )

  const incomingConnections = edges
    .filter(edge => edge.target === blockId)
    .map(edge => {
      const sourceBlock = blocks[edge.source]
      return {
        id: sourceBlock.id,
        type: sourceBlock.type,
        outputType: 'response',
        name: sourceBlock.name,
      }
    })

  return {
    incomingConnections,
    hasIncomingConnections: incomingConnections.length > 0
  }
}