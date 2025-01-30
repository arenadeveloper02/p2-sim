"use client"

import { useState } from "react"
import { WorkflowBlock } from "./components/workflow-block/workflow-block"
import { BlockConfig, BlockCategory, BlockIcon } from "@/blocks/types"
import { LayoutDashboard } from "lucide-react"

const WorkflowIcon: BlockIcon = (props) => <LayoutDashboard {...props} />

interface WorkflowBlockState {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
  name: string
}

export default function Page() {
  const [workflows, setWorkflows] = useState<WorkflowBlockState[]>([])

  const createNewWorkflow = () => {
    const newWorkflow: WorkflowBlockState = {
      id: `workflow-${workflows.length + 1}`,
      type: "default",
      position: { x: 0, y: 0 },
      config: {
        type: "default",
        toolbar: {
          title: "New Workflow",
          description: "Empty workflow",
          bgColor: "#808080",
          icon: WorkflowIcon,
          category: "basic" as BlockCategory
        },
        tools: {
          access: []
        },
        workflow: {
          subBlocks: [],
          inputs: {},
          outputs: {}
        }
      },
      name: `New Workflow ${workflows.length + 1}`
    }
    setWorkflows([...workflows, newWorkflow])
  }

  return (
    <div>
      <button onClick={createNewWorkflow}>New Workflow</button>
      <div>
        {workflows.map((workflow) => (
          <WorkflowBlock
            key={workflow.id}
            id={workflow.id}
            type={workflow.type}
            position={workflow.position}
            config={workflow.config}
            name={workflow.name}
          />
        ))}
      </div>
    </div>
  )
}
