'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { getBlock } from '../../../blocks'
import { WorkflowBlock } from '../components/workflow-block/workflow-block'
import { BlockConfig } from '../../../blocks/types'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { initializeStateLogger } from '@/stores/workflow/state-logger'
import { BlockState } from '@/stores/workflow/types'
import { NotificationList } from '@/app/w/components/notifications/notifications'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { executeWorkflow } from '@/lib/workflow'

/**
 * Represents the data structure for a workflow node
 */
interface WorkflowNodeData {
  type: string
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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const {
    blocks,
    edges,
    addBlock,
    updateBlockPosition,
    addEdge,
    removeEdge,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useWorkflowStore()
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)
  const { addNotification } = useNotificationStore()

  // Convert blocks to ReactFlow nodes using local selectedBlockId
  const nodes = Object.values(blocks).map((block) => ({
    id: block.id,
    type: 'workflowBlock',
    position: block.position,
    selected: block.id === selectedBlockId,
    dragHandle: '.workflow-drag-handle',
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

  // Handler for node clicks
  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    event.stopPropagation()
    setSelectedBlockId(node.id)
  }, [])

  // Handler for clicks on the empty canvas
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    setSelectedBlockId(null)
  }, [])

  // useEffect(() => {
  //   initializeStateLogger()
  // }, [])

  /**
   * CSS keyframe animation for the dashed line effect
   */
  const keyframeStyles = `
    @keyframes dashdraw {
      from { stroke-dashoffset: 10; }
      to { stroke-dashoffset: -10; }
    }
  `

  /**
   * Handles the execution of the workflow
   * Serializes the workflow, executes it, and handles the results
   */
  const handleRunWorkflow = async () => {
    try {
      setIsExecuting(true)
      setExecutionResult(null)

      const result = await executeWorkflow(
        blocks,
        edges,
        window.location.pathname.split('/').pop() || 'workflow'
      )

      setExecutionResult(result)

      if (result.success) {
        addNotification('console', 'Workflow completed successfully')
      } else {
        addNotification('error', `Failed to execute workflow: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error executing workflow:', error)
      setExecutionResult({
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      })
      addNotification('error', `Failed to execute workflow: ${error.message}`)
    } finally {
      setIsExecuting(false)
    }
  }

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (event.shiftKey) {
          if (canRedo()) redo()
        } else {
          if (canUndo()) undo()
        }
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo])

  // useEffect(() => {
  //   addNotification('console', 'Welcome to the workflow editor!')
  // }, [])

  return (
    <div className="relative w-full h-[calc(100vh-56px)]">
      <NotificationList />
      <style>{keyframeStyles}</style>
      {/* <button
        onClick={handleRunWorkflow}
        disabled={isExecuting}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isExecuting ? 'Running...' : 'Test Run'}
      </button> */}
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
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        nodesConnectable={true}
        nodesDraggable={true}
        draggable={false}
        noWheelClassName="allow-scroll"
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
