import { useWorkflowStore } from './store'

export function initializeStateLogger() {
  useWorkflowStore.subscribe((state) => {
    console.log('Workflow State Updated:', {
      current: {
        blocks: state.blocks,
        edges: state.edges,
        loops: state.loops,
      },
      history: {
        past: state.history.past,
        present: state.history.present,
        future: state.history.future,
      },
    })
  })
}
