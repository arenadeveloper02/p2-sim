import { NodeProps } from 'reactflow'
import { Badge } from '@/components/ui/badge'

export function LoopLabel({ data }: NodeProps) {
  return (
    <Badge
      variant="outline"
      className="bg-white border-[rgb(203,213,225)] text-gray-700 font-medium px-2 py-0.5 text-sm 
      hover:bg-gray-50 shadow-sm transition-colors duration-150"
    >
      {data.label}
    </Badge>
  )
}
