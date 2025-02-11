import { X } from 'lucide-react'
import { EdgeProps, getSmoothStepPath } from 'reactflow'

export const CustomEdge = (props: EdgeProps) => {
  const isHorizontal = props.sourcePosition === 'right' || props.sourcePosition === 'left'

  // For horizontal handles, we'll add a minimum extension to ensure the path
  // always goes outward before going up/down
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 8,
    offset: isHorizontal ? 30 : 20,
  })

  const isSelected = props.id === props.data?.selectedEdgeId

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={edgePath}
        strokeWidth={20}
        stroke="transparent"
        fill="none"
        className="react-flow__edge-interaction"
        style={{ pointerEvents: 'all' }}
      />
      <path
        d={edgePath}
        strokeWidth={2}
        stroke={isSelected ? '#475569' : '#94a3b8'}
        fill="none"
        strokeDasharray="5,5"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="10"
          to="0"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>

      {isSelected && (
        <foreignObject
          width={24}
          height={24}
          x={labelX - 12}
          y={labelY - 12}
          className="overflow-visible"
          style={{ zIndex: 999 }}
        >
          <div
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[#FAFBFC] relative z-[9999]"
            onClick={(e) => {
              e.stopPropagation()
              props.data?.onDelete?.(props.id)
            }}
          >
            <X className="h-5 w-5 text-red-500 hover:text-red-600" />
          </div>
        </foreignObject>
      )}
    </g>
  )
}
