'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  ConnectionLineType,
  EdgeTypes,
  NodeTypes,
  useOnViewportChange,
  useReactFlow,
} from 'reactflow'
import { useNotificationStore } from '@/stores/notifications/store'
import { initializeStateLogger } from '@/stores/workflow/logger'
import { useWorkflowStore } from '@/stores/workflow/store'
import { NotificationList } from '@/app/w/components/notifications/notifications'
import { getBlock } from '../../../../../blocks'
import { useWorkflowExecution } from '../../../hooks/use-workflow-execution'
import { CustomEdge } from '../custom-edge/custom-edge'
import { createLoopNode, getRelativeLoopPosition } from '../workflow-loop/workflow-loop'
import { WorkflowNode } from '../workflow-node/workflow-node'

// Define custom node and edge types for ReactFlow
const nodeTypes: NodeTypes = {
  workflowBlock: WorkflowNode,
}
const edgeTypes: EdgeTypes = { custom: CustomEdge }

export function WorkflowCanvas() {
  // Track selected elements in the workflow
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Store references and state management hooks
  const { isExecuting, executionResult, handleRunWorkflow } = useWorkflowExecution()
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
  const { project, setViewport } = useReactFlow()
  const { loops } = useWorkflowStore()

  // Transform blocks and loops into ReactFlow node format
  const nodes = useMemo(() => {
    const nodeArray: any[] = []

    // Add loop group nodes first
    Object.entries(loops).forEach(([loopId, loop]) => {
      const loopNode = createLoopNode({ loopId, loop, blocks })
      if (loopNode) {
        nodeArray.push(loopNode)
      }
    })

    // Add block nodes with relative positions if they're in a loop
    Object.entries(blocks).forEach(([blockId, block]) => {
      // Skip loop position entries that don't have proper block structure
      if (!block.type || !block.name) {
        console.log('Skipping invalid block:', blockId, block)
        return
      }

      // Get block configuration
      const blockConfig = getBlock(block.type)
      if (!blockConfig) {
        console.error(`No configuration found for block type: ${block.type}`)
        return
      }

      // Find if block belongs to any loop
      const parentLoop = Object.entries(loops).find(([_, loop]) => loop.nodes.includes(block.id))

      let position = block.position
      if (parentLoop) {
        const [loopId] = parentLoop
        const loopNode = nodeArray.find((node) => node.id === `loop-${loopId}`)
        if (loopNode) {
          position = getRelativeLoopPosition(block.position, loopNode.position)
        }
      }

      nodeArray.push({
        id: block.id,
        type: 'workflowBlock',
        position,
        parentId: parentLoop ? `loop-${parentLoop[0]}` : undefined,
        dragHandle: '.workflow-drag-handle',
        selected: block.id === selectedBlockId,
        data: {
          type: block.type,
          config: blockConfig,
          name: block.name,
        },
      })
    })

    return nodeArray
  }, [blocks, loops, selectedBlockId])

  // Update node position handler
  const onNodesChange = useCallback(
    (changes: any) => {
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position) {
          const node = nodes.find((n) => n.id === change.id)
          if (!node) return

          // If node is part of a loop, convert position back to absolute
          if (node.parentId) {
            const loopNode = nodes.find((n) => n.id === node.parentId)
            if (loopNode) {
              const absolutePosition = {
                x: change.position.x + loopNode.position.x,
                y: change.position.y + loopNode.position.y,
              }
              updateBlockPosition(change.id, absolutePosition)
            }
          } else {
            updateBlockPosition(change.id, change.position)
          }
        }
      })
    },
    [nodes, updateBlockPosition]
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
      // Use ReactFlow's addEdge utility
      const newEdge = {
        ...connection,
        id: crypto.randomUUID(),
        type: 'custom',
      }

      // Validate connection before adding
      if (newEdge.source && newEdge.target) {
        addEdge(newEdge)
      }
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

  // Update onPaneClick to clear selections
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    setSelectedBlockId(null)
    setSelectedEdgeId(null)
  }, [])

  // Update selected edge when clicking on connections
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: any) => {
    setSelectedEdgeId(edge.id)
    setSelectedBlockId(null)
  }, [])

  // Handle keyboard shortcuts for edge deletion
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId) {
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

  const edgesWithSelection = edges.map((edge) => ({
    ...edge,
    type: edge.type || 'custom',
    data: {
      selectedEdgeId,
      onDelete: (edgeId: string) => {
        removeEdge(edgeId)
        setSelectedEdgeId(null)
      },
    },
  }))

  // Replace useViewport with useOnViewportChange
  useOnViewportChange({
    onStart: ({ x, y, zoom }) => {
      console.log('Viewport change start:', {
        x: Math.round(x),
        y: Math.round(y),
        zoom: zoom.toFixed(2),
      })
    },
    onEnd: ({ x, y, zoom }) => {
      console.log('Viewport change end:', {
        x: Math.round(x),
        y: Math.round(y),
        zoom: zoom.toFixed(2),
      })
    },
  })

  // For the random movement function, we can use setViewport from useReactFlow
  const moveToRandomLocation = useCallback(() => {
    const randomX = Math.random() * 1000 - 500
    const randomY = Math.random() * 1000 - 500
    const randomZoom = Math.random() * 0.5 + 0.5

    setViewport(
      {
        x: randomX,
        y: randomY,
        zoom: randomZoom,
      },
      { duration: 500 }
    )
  }, [setViewport])

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
