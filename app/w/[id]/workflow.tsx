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
  ConnectionLineType,
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getBlock } from '../../../blocks/configs'
import { WorkflowBlock } from '../components/workflow-block/workflow-block'
import { BlockConfig } from '../../../blocks/types/block'
import { BlockType } from '../../../blocks/types/block'

/**
 * Represents the data structure for a workflow node
 */
interface WorkflowNodeData {
  type: BlockType // Updated to use the proper type from block.ts
  config: BlockConfig // Updated to use the proper type
  name: string
}

/**
 * Custom node component for rendering workflow blocks
 */
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

/**
 * Custom edge component with animated dashed line styling
 */
const CustomEdge = (props: EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  })

  return (
    <BaseEdge
      {...props}
      path={edgePath}
      style={{
        stroke: props.selected ? '#475569' : '#94a3b8',
        strokeWidth: 2,
        strokeDasharray: '5',
        strokeDashoffset: '0',
        animation: 'dashdraw 1s linear infinite',
      }}
    />
  )
}

// Component type definitions
const nodeTypes: NodeTypes = { workflowBlock: WorkflowNode }
const edgeTypes: EdgeTypes = { custom: CustomEdge }

/**
 * Main canvas component for the workflow editor
 */
function WorkflowCanvas() {
  // Flow state management
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { project } = useReactFlow()

  /**
   * Handles new edge connections between nodes
   */
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  /**
   * Handles dropping new blocks onto the canvas
   */
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      try {
        // Calculate drop position
        const reactFlowBounds = event.currentTarget.getBoundingClientRect()
        const position = project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        })

        // Get block configuration
        const { type } = JSON.parse(
          event.dataTransfer.getData('application/json')
        )
        const blockConfig = getBlock(type)

        if (!blockConfig) {
          console.error('Invalid block type:', type)
          return
        }

        // Create new node
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

  // Keyframe animation styles
  const keyframeStyles = `
    @keyframes dashdraw {
      from { stroke-dashoffset: 10; }
      to { stroke-dashoffset: -10; }
    }
  `

  return (
    <div className="w-full h-[calc(100vh-56px)]">
      <style>{keyframeStyles}</style>
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
        defaultEdgeOptions={{ type: 'custom' }}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{
          stroke: '#94a3b8',
          strokeWidth: 2,
          strokeDasharray: '5',
          strokeDashoffset: '0',
          animation: 'dashdraw 1s linear infinite',
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}

/**
 * Root workflow component wrapped with ReactFlow provider
 */
export default function Workflow() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
