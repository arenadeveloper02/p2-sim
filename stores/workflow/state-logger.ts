import { useWorkflowStore } from './workflow-store'

export function initializeStateLogger() {
  useWorkflowStore.subscribe((state) => {
    console.log('Workflow State Updated:', {
      blocks: state.blocks,
      edges: state.edges,
      selectedBlockId: state.selectedBlockId,
    })
  })
} 