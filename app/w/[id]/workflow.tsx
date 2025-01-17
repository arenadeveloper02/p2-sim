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
import { getBlock } from '../../../blocks/configs'
import { WorkflowBlock } from '../components/workflow-block/workflow-block'
import { BlockConfig } from '../../../blocks/types/block'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { initializeStateLogger } from '@/stores/workflow/state-logger'
import { Serializer } from '@/serializer'
import { Executor } from '@/executor'
import { BlockState, SubBlockState } from '@/stores/workflow/types'

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
  const {
    blocks,
    edges,
    addBlock,
    updateBlockPosition,
    addEdge,
    removeEdge,
    setSelectedBlock,
  } = useWorkflowStore()
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)

  // Convert blocks to ReactFlow nodes
  const nodes = Object.values(blocks).map((block) => ({
    id: block.id,
    type: 'workflowBlock',
    position: block.position,
    selected: block.id === useWorkflowStore.getState().selectedBlockId,
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
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.stopPropagation()
      setSelectedBlock(node.id)
    },
    [setSelectedBlock]
  )

  // Handler for clicks on the empty canvas
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setSelectedBlock(null)
    },
    [setSelectedBlock]
  )

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

  useEffect(() => {
    initializeStateLogger()
  }, [])

  /**
   * Gets the initial node in the workflow by finding the node with no incoming edges
   * @returns {Object} Object containing the initial block and its configuration
   * @throws {Error} If no initial block is found or block configuration is invalid
   */
  const getInitialNode = () => {
    const initialBlockId = Object.values(blocks).find(block => 
      !edges.some(edge => edge.target === block.id)
    )?.id;

    if (!initialBlockId) {
      throw new Error('Could not determine the initial block in the workflow');
    }

    const blockConfig = getBlock(blocks[initialBlockId].type);
    if (!blockConfig) {
      throw new Error(`Block configuration not found for type: ${blocks[initialBlockId].type}`);
    }

    return {
      block: blocks[initialBlockId],
      config: blockConfig
    };
  };

  /**
   * Determines the initial input parameters based on the block type
   * @param {BlockState} block - The block to get initial input for
   * @param {BlockConfig} blockConfig - The block's configuration
   * @returns {Object} The initial input parameters for the block
   */
  const getInitialInput = (block: BlockState, blockConfig: BlockConfig) => {
    if (block.type === 'agent') {
      return {
        model: block.subBlocks?.['model']?.value || 'gpt-4o',
        systemPrompt: block.subBlocks?.['systemPrompt']?.value,
        temperature: block.subBlocks?.['temperature']?.value,
        apiKey: block.subBlocks?.['apiKey']?.value,
        prompt: block.subBlocks?.['systemPrompt']?.value
      };
    } else if (block.type === 'api') {
      return {
        url: block.subBlocks?.['url']?.value,
        method: block.subBlocks?.['method']?.value,
        headers: block.subBlocks?.['headers']?.value,
        body: block.subBlocks?.['body']?.value
      };
    }
    return {};
  };

  /**
   * Serializes a block into the format expected by the executor
   * @param {BlockState} block - The block to serialize
   * @returns {Object} The serialized block with its configuration and parameters
   * @throws {Error} If block configuration or tools are not properly defined
   */
  const serializeBlock = (block: BlockState) => {
    const blockConfig = getBlock(block.type);
    if (!blockConfig) {
      throw new Error(`Block configuration not found for type: ${block.type}`);
    }

    const tools = blockConfig.workflow.tools;
    if (!tools || !tools.access || tools.access.length === 0) {
      throw new Error(`No tools specified for block type: ${block.type}`);
    }

    // Get the values from subBlocks
    const params: Record<string, any> = {};
    Object.entries(block.subBlocks || {}).forEach(([id, subBlock]) => {
      if (subBlock) {
        params[id] = subBlock.value;
      }
    });

    return {
      id: block.id,
      type: 'custom',
      position: block.position,
      data: {
        tool: tools.access[0],
        params,
        interface: {
          inputs: block.type === 'agent' ? { prompt: 'string' } : {},
          outputs: {
            [block.type === 'agent' ? 'response' : 'output']: 
              typeof blockConfig.workflow.outputType === 'string' 
                ? blockConfig.workflow.outputType 
                : blockConfig.workflow.outputType.default
          }
        }
      },
    };
  };

  /**
   * Handles the execution of the workflow
   * Serializes the workflow, executes it, and handles the results
   */
  const handleRunWorkflow = async () => {
    try {
      setIsExecuting(true)
      setExecutionResult(null)

      // 1. Get initial node
      const { block: initialBlock, config: initialBlockConfig } = getInitialNode();

      // 2. Serialize the workflow
      const serializer = new Serializer()
      const serializedWorkflow = serializer.serializeWorkflow(
        Object.values(blocks).map(serializeBlock),
        edges
      );

      // 3. Create executor and run workflow
      const executor = new Executor(serializedWorkflow)
      const initialInput = getInitialInput(initialBlock, initialBlockConfig);
      
      const result = await executor.execute(
        window.location.pathname.split('/').pop() || 'workflow',
        initialInput
      )

      // 4. Handle result
      setExecutionResult(result)
      
      if (result.success) {
        console.log('Workflow executed successfully:', result.data)
      } else {
        console.error('Workflow execution failed:', result.error)
      }
    } catch (error) {
      console.error('Error executing workflow:', error)
      setExecutionResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    } finally {
      setIsExecuting(false)
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-56px)]">
      <style>{keyframeStyles}</style>
      
      {/* Run Button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleRunWorkflow}
          disabled={isExecuting || Object.keys(blocks).length === 0}
          className={`px-4 py-2 rounded-md text-white ${
            isExecuting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isExecuting ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {/* Execution Result */}
      {executionResult && (
        <div className={`absolute top-16 right-4 z-10 p-4 rounded-md ${
          executionResult.success ? 'bg-green-100' : 'bg-red-100'
        }`}>
          {executionResult.success ? (
            <div>
              <h3 className="font-bold text-green-800">Success</h3>
              <pre className="mt-2 text-sm">
                {JSON.stringify(executionResult.data, null, 2)}
              </pre>
            </div>
          ) : (
            <div>
              <h3 className="font-bold text-red-800">Error</h3>
              <p className="mt-2 text-sm text-red-600">{executionResult.error}</p>
            </div>
          )}
        </div>
      )}

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
