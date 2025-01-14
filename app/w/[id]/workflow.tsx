'use client'

import { useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  NodeProps,
  NodeTypes,
  EdgeTypes,
  Connection,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  XYPosition,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getBlock } from '../components/blocks/configs'
import { WorkflowBlock } from '../components/blocks/components/workflow-block/workflow-block'

// Types
interface WorkflowNodeData {
  type: string
  config: any // Consider adding a proper type for config
  name: string
}

// Node Components
const WorkflowNode = ({
  data,
  id,
  xPos,
  yPos,
}: NodeProps<WorkflowNodeData>) => (
  <WorkflowBlock
    id={id}
    type={data.type}
    position={{ x: xPos, y: yPos }}
    config={data.config}
    name={data.name}
  />
)

const nodeTypes: NodeTypes = {
  workflowBlock: WorkflowNode,
}

// Main Canvas Component
function WorkflowCanvas() {
  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { project } = useReactFlow()

  // Handlers
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      try {
        const reactFlowBounds = event.currentTarget.getBoundingClientRect()
        const position = project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        })

        const { type } = JSON.parse(
          event.dataTransfer.getData('application/json')
        )
        const blockConfig = getBlock(type)

        if (!blockConfig) {
          console.error('Invalid block type:', type)
          return
        }

        const newNode = {
          id: crypto.randomUUID(),
          type: 'workflowBlock',
          position,
          data: {
            type,
            config: blockConfig,
            name: `${blockConfig.toolbar.title} ${
              nodes.filter((n) => n.data.type === type).length + 1
            }`,
          },
        }

        setNodes((nds) => [...nds, newNode])
      } catch (err) {
        console.error('Error dropping block:', err)
      }
    },
    [project, nodes, setNodes]
  )

  return (
    <div className="w-full h-[calc(100vh-56px)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        fitView
        maxZoom={1}
        panOnScroll
      >
        <Background />
      </ReactFlow>
    </div>
  )
}

export default function Workflow() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
