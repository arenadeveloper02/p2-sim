'use client'

import { useCallback, useEffect } from 'react'
import ReactFlow, {
  Background,
  NodeProps,
  NodeTypes,
  EdgeTypes,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
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
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { initializeStateLogger } from '@/stores/workflow/state-logger'

/**
 * Represents the data structure for a workflow node
 */
interface WorkflowNodeData {
  type: BlockType
  config: BlockConfig
  name: string
}

/**
 * Custom node component for rendering workflow blocks in the workflow editor
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
 * Custom edge component that renders an animated dashed line between nodes
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

/**
 * Component type definitions for ReactFlow nodes and edges
 */
const nodeTypes: NodeTypes = { workflowBlock: WorkflowNode }
const edgeTypes: EdgeTypes = { custom: CustomEdge }

/**
 * Main canvas component that handles the interactive workflow editor functionality
 * including drag and drop, node connections, and position updates
 */
function WorkflowCanvas() {
  const { blocks, edges, addBlock, updateBlockPosition, addEdge, removeEdge } =
    useWorkflowStore()

  // Convert blocks to ReactFlow nodes
  const nodes = Object.values(blocks).map((block) => ({
    id: block.id,
    type: 'workflowBlock',
    position: block.position,
    data: {
      type: block.type,
      config: getBlock(block.type),
      name: block.name,
    },
  }))

  const { project } = useReactFlow()

  /**
   * Handles updating node positions when they are dragged
   */
  const onNodesChange = useCallback(
    (changes: any) => {
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position) {
          updateBlockPosition(change.id, change.position)
        }
      })
    },
    [updateBlockPosition]
  )

  /**
   * Handles edge removal when they are deleted
   */
  const onEdgesChange = useCallback(
    (changes: any) => {
      changes.forEach((change: any) => {
        if (change.type === 'remove') {
          removeEdge(change.id)
        }
      })
    },
    [removeEdge]
  )

  /**
   * Handles creating new connections between nodes
   */
  const onConnect = useCallback(
    (connection: any) => {
      addEdge({
        ...connection,
        id: crypto.randomUUID(),
        type: 'custom',
      })
    },
    [addEdge]
  )

  /**
   * Handles the drop event when a new block is dragged onto the canvas
   */
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

        const id = crypto.randomUUID()
        const name = `${blockConfig.toolbar.title} ${
          Object.values(blocks).filter((b) => b.type === type).length + 1
        }`

        addBlock(id, type, name, position)
      } catch (err) {
        console.error('Error dropping block:', err)
      }
    },
    [project, blocks, addBlock]
  )

  /**
   * CSS keyframe animation for the dashed line effect
   */
  const keyframeStyles = `
    @keyframes dashdraw {
      from { stroke-dashoffset: 10; }
      to { stroke-dashoffset: -10; }
    }
  `

  useEffect(() => {
    initializeStateLogger()
  }, [])

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
 * Root workflow component that provides the ReactFlow context to the canvas
 */
export default function Workflow() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
