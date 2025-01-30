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
import { useWorkflowExecution } from '../hooks/use-workflow-execution'
import { useWorkflowRegistry } from '@/stores/workflow/workflow-registry'
import { useParams, useRouter } from 'next/navigation'

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
  const { isExecuting, executionResult, handleRunWorkflow } =
    useWorkflowExecution()

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
  const { addNotification } = useNotificationStore()

  const params = useParams()

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
        const data = JSON.parse(event.dataTransfer.getData('application/json'))

        // Early return if this is a connection block drag
        if (data.type === 'connectionBlock') {
          return
        }

        const reactFlowBounds = event.currentTarget.getBoundingClientRect()
        const position = project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        })

        const blockConfig = getBlock(data.type)

        if (!blockConfig) {
          console.error('Invalid block type:', data.type)
          return
        }

        const id = crypto.randomUUID()
        const name = `${blockConfig.toolbar.title} ${
          Object.values(blocks).filter((b) => b.type === data.type).length + 1
        }`

        addBlock(id, data.type, name, position)
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

  useEffect(() => {
    initializeStateLogger()
  }, [])

  /**
   * CSS keyframe animation for the dashed line effect
   */
  const keyframeStyles = `
    @keyframes dashdraw {
      from { stroke-dashoffset: 10; }
      to { stroke-dashoffset: -10; }
    }
  `

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

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      <NotificationList />
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
  const params = useParams()
  const router = useRouter()
  const { workflows, setActiveWorkflow, addWorkflow } = useWorkflowRegistry()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // First, initialize the registry and wait for it
    if (typeof window !== 'undefined') {
      const savedRegistry = localStorage.getItem('workflow-registry')
      if (savedRegistry) {
        useWorkflowRegistry.setState({ workflows: JSON.parse(savedRegistry) })
      }
      setIsInitialized(true)
    }
  }, [])

  useEffect(() => {
    // Only proceed if we've initialized the registry
    if (!isInitialized) return

    // Helper function to create a new workflow
    const createInitialWorkflow = () => {
      const id = crypto.randomUUID()
      const newWorkflow = {
        id,
        name: 'Workflow 1',
        lastModified: new Date(),
        description: 'New workflow',
        color: '#3972F6',
      }
      addWorkflow(newWorkflow)
      return id
    }

    // Validate and handle workflow navigation
    const validateAndNavigate = () => {
      const workflowIds = Object.keys(workflows)
      const currentId = params.id as string

      // No workflows exist - create one and navigate
      if (workflowIds.length === 0) {
        const newId = createInitialWorkflow()
        router.replace(`/w/${newId}`)
        return
      }

      // Current workflow is invalid - navigate to first available
      if (!workflows[currentId]) {
        router.replace(`/w/${workflowIds[0]}`)
        return
      }

      // Valid workflow - set it as active
      setActiveWorkflow(currentId)
    }

    validateAndNavigate()
  }, [
    params.id,
    workflows,
    setActiveWorkflow,
    addWorkflow,
    router,
    isInitialized,
  ])

  if (!isInitialized) {
    return null // or a loading spinner
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  )
}
