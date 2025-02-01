import { NodeProps } from 'reactflow'
import { WorkflowBlock } from '../workflow-block/workflow-block'
import { BlockConfig } from '../../../../../blocks/types'

interface WorkflowNodeData {
  type: string
  config: BlockConfig
  name: string
}

export const WorkflowNode = ({
  data,
  id,
  xPos,
  yPos,
  selected,
}: NodeProps<WorkflowNodeData>) => (
  <WorkflowBlock
    id={id}
    type={data.type}
    position={{ x: xPos, y: yPos }}
    config={data.config}
    name={data.name}
    selected={selected}
  />
)
