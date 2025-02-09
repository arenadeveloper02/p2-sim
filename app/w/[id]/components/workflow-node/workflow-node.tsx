import { useEffect, useState } from 'react'
import { NodeProps } from 'reactflow'
import { useWorkflowStore } from '@/stores/workflow/store'
import { BlockConfig } from '../../../../../blocks/types'
import { WorkflowBlock } from '../workflow-block/workflow-block'

interface WorkflowNodeData {
  type: string
  config: BlockConfig
  name: string
}

export const WorkflowNode = ({ data, id, xPos, yPos, selected }: NodeProps<WorkflowNodeData>) => {
  const [key, setKey] = useState(0)
  const horizontalHandles = useWorkflowStore(
    (state) => state.blocks[id]?.horizontalHandles ?? false
  )

  // Add effect to trigger immediate re-render after handle toggle
  useEffect(() => {
    setKey((prev) => prev + 1)
  }, [horizontalHandles])

  return (
    <WorkflowBlock
      key={key}
      id={id}
      type={data.type}
      position={{ x: xPos, y: yPos }}
      config={data.config}
      name={data.name}
      selected={selected}
    />
  )
}
