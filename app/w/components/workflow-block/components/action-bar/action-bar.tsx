import { Button } from '@/components/ui/button'
import { Trash2, Play, Circle, CircleOff } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ActionBarProps {
  blockId: string
}

export function ActionBar({ blockId }: ActionBarProps) {
  const removeBlock = useWorkflowStore((state) => state.removeBlock)
  const toggleBlockEnabled = useWorkflowStore(
    (state) => state.toggleBlockEnabled
  )
  const isEnabled = useWorkflowStore(
    (state) => state.blocks[blockId]?.enabled ?? true
  )

  return (
    <div className="absolute -top-20 right-0 inline-flex items-center gap-2 p-2 bg-white rounded-md shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeBlock(blockId)}
            className="text-gray-500 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Block</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleBlockEnabled(blockId)}
            className="text-gray-500"
          >
            {isEnabled ? (
              <Circle className="h-4 w-4" />
            ) : (
              <CircleOff className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isEnabled ? 'Disable Block' : 'Enable Block'}
        </TooltipContent>
      </Tooltip>

      <Button className="gap-2 bg-[#7F2FFF] hover:bg-[#7F2FFF]/90" size="sm">
        <Play fill="currentColor" className="!h-3.5 !w-3.5" />
        Run
      </Button>
    </div>
  )
}
