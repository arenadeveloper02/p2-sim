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
import { X } from 'lucide-react'

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

  const midPoint = {
    x: (props.sourceX + props.targetX) / 2,
    y: (props.sourceY + props.targetY) / 2,
  }

  const isSelected = props.id === props.data?.selectedEdgeId

  return (
    <g>
      {/* Invisible wider path for better click interaction */}
      <path
        d={edgePath}
        strokeWidth={20}
        stroke="transparent"
        fill="none"
        className="react-flow__edge-interaction"
      />
      {/* Visible animated path */}
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

      {/* Delete button - only show when edge is selected */}
      {isSelected && (
        <foreignObject
          width={24}
          height={24}
          x={midPoint.x - 12}
          y={midPoint.y - 12}
          className="overflow-visible"
        >
          <div
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[#FAFBFC]"
            onClick={(e) => {
              e.stopPropagation()
              props.data?.onDelete?.(props.id)
            }}
          >
            <X className="h-5 w-5 text-red-500" />
          </div>
        </foreignObject>
      )}
    </g>
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
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
    setSelectedEdgeId(null)
  }, [])

  // Handler for clicks on the empty canvas
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    setSelectedBlockId(null)
    setSelectedEdgeId(null)
  }, [])

  // Add this new handler
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: any) => {
    setSelectedEdgeId(edge.id)
  }, [])

  // Add keyboard event handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedEdgeId
      ) {
        removeEdge(selectedEdgeId)
        setSelectedEdgeId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId, removeEdge])

  useEffect(() => {
    initializeStateLogger()
  }, [])

  // Update the edges to include both selectedEdgeId and onDelete handler
  const edgesWithSelection = edges.map((edge) => ({
    ...edge,
    data: {
      selectedEdgeId,
      onDelete: (edgeId: string) => {
        removeEdge(edgeId)
        setSelectedEdgeId(null)
      },
    },
  }))

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      <NotificationList />
      <ReactFlow
        nodes={nodes}
        edges={edgesWithSelection}
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
          strokeDasharray: '5,5',
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        nodesConnectable={true}
        nodesDraggable={true}
        draggable={false}
        noWheelClassName="allow-scroll"
        edgesFocusable={true}
        edgesUpdatable={true}
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
