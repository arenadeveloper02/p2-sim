'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  NodeTypes,
  EdgeTypes,
  useReactFlow,
  ConnectionLineType,
} from 'reactflow'
import { getBlock } from '../../../../../blocks'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { useWorkflowExecution } from '../../../hooks/use-workflow-execution'
import { NotificationList } from '@/app/w/components/notifications/notifications'
import { WorkflowNode } from '../workflow-node/workflow-node'
import { CustomEdge } from '../custom-edge/custom-edge'
import { initializeStateLogger } from '@/stores/workflow/state-logger'

// Define custom node and edge types for ReactFlow
const nodeTypes: NodeTypes = { workflowBlock: WorkflowNode }
const edgeTypes: EdgeTypes = { custom: CustomEdge }

export function WorkflowCanvas() {
  // Track selected elements in the workflow
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Store references and state management hooks
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
  const { project } = useReactFlow()

  // Transform blocks into ReactFlow node format
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

  // Handle node position updates during drag operations
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

  // Handle edge removal and updates
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

  // Create new edges when nodes are connected
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

  // Handle new block creation from toolbar drag and drop
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'))
        if (data.type === 'connectionBlock') return

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

  // Update selection state when clicking nodes
  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    event.stopPropagation()
    setSelectedBlockId(node.id)
    setSelectedEdgeId(null)
  }, [])

  // Clear selection when clicking on the canvas
  const onPaneClick = useCallback(() => {
    setSelectedBlockId(null)
    setSelectedEdgeId(null)
  }, [])

  // Update selected edge when clicking on connections
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: any) => {
    setSelectedEdgeId(edge.id)
  }, [])

  // Handle keyboard shortcuts for edge deletion
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

  // Initialize state logging for debugging
  useEffect(() => {
    initializeStateLogger()
  }, [])

  // Add selection data to edges for visual feedback
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
