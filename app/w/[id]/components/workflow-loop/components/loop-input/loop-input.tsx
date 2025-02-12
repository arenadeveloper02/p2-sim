import { NodeProps } from 'reactflow'
import { Badge } from '@/components/ui/badge'
import { useWorkflowStore } from '@/stores/workflow/store'

export function LoopInput({ id }: NodeProps) {
  // Extract the loop ID from the node ID (removes 'loop-input-' prefix)
  const loopId = id.replace('loop-input-', '')

  // Get the max iterations from the store for this loop
  const maxIterations = useWorkflowStore((state) => state.loops[loopId]?.maxIterations ?? 5)

  return (
    <Badge
      variant="outline"
      className="bg-white border-[rgb(203,213,225)] text-gray-700 font-medium px-2 py-0.5 text-sm 
      hover:bg-gray-50 transition-colors duration-150"
    >
      Max Iterations: {maxIterations}
    </Badge>
  )
}
