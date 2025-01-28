import { SerializedWorkflow, SerializedBlock } from '@/serializer/types'
import { ExecutionContext, ExecutionResult, Tool } from './types'
import { tools } from '@/tools'

export class Executor {
  private workflow: SerializedWorkflow

  constructor(workflow: SerializedWorkflow) {
    this.workflow = workflow
  }

  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config = block.config
    const toolId = config.tool

    if (!toolId) {
      throw new Error(`Block ${block.id} does not specify a tool`)
    }

    const tool = tools[toolId]
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    // Merge block parameters with runtime inputs
    const params = {
      ...config.params,
      ...inputs
    }

    // Validate tool parameters and apply defaults
    const validatedParams: Record<string, any> = {}
    for (const [paramName, paramConfig] of Object.entries(tool.params)) {
      if (paramName in params) {
        validatedParams[paramName] = params[paramName]
      } else if ('default' in paramConfig) {
        validatedParams[paramName] = paramConfig.default
      } else if (paramConfig.required) {
        throw new Error(`Missing required parameter '${paramName}' for tool ${toolId}`)
      }
    }

    try {
      // Make the HTTP request
      const url = typeof tool.request.url === 'function'
        ? tool.request.url(validatedParams)
        : tool.request.url

      const response = await fetch(url, {
        method: tool.request.method,
        headers: tool.request.headers(validatedParams),
        body: tool.request.body ? JSON.stringify(tool.request.body(validatedParams)) : undefined
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(tool.transformError(error))
      }

      return await tool.transformResponse(response)
    } catch (error) {
      throw new Error(`Tool ${toolId} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private determineExecutionOrder(): string[] {
    const { blocks, connections } = this.workflow
    const order: string[] = []
    const visited = new Set<string>()
    const inDegree = new Map<string, number>()
    
    blocks.forEach(block => inDegree.set(block.id, 0))
    connections.forEach(conn => {
      const target = conn.target
      inDegree.set(target, (inDegree.get(target) || 0) + 1)
    })
    
    const queue = blocks
      .filter(block => (inDegree.get(block.id) || 0) === 0)
      .map(block => block.id)
    
    while (queue.length > 0) {
      const blockId = queue.shift()!
      if (visited.has(blockId)) continue
      
      visited.add(blockId)
      order.push(blockId)
      
      connections
        .filter(conn => conn.source === blockId)
        .forEach(conn => {
          const targetId = conn.target
          inDegree.set(targetId, (inDegree.get(targetId) || 0) - 1)
          
          if (inDegree.get(targetId) === 0) {
            queue.push(targetId)
          }
        })
    }
    
    if (order.length !== blocks.length) {
      throw new Error('Workflow contains cycles')
    }
    
    return order
  }

  private resolveInputs(
    block: SerializedBlock,
    context: ExecutionContext
  ): Record<string, any> {
    const inputs: Record<string, any> = {}
    
    // Get all incoming connections for this block
    const incomingConnections = this.workflow.connections.filter(
      conn => conn.target === block.id
    )
    
    // Map outputs from previous blocks to inputs for this block
    incomingConnections.forEach(conn => {
      const sourceOutput = context.blockStates.get(conn.source)
      if (sourceOutput && conn.sourceHandle && conn.targetHandle) {
        inputs[conn.targetHandle] = sourceOutput[conn.sourceHandle]
      }
    })
    
    // If this is a start block with no inputs, use the block's params
    if (Object.keys(inputs).length === 0) {
      const targetBlock = this.workflow.blocks.find(b => b.id === block.id)
      if (targetBlock) {
        return targetBlock.config.params
      }
    }
    
    return inputs
  }

  async execute(workflowId: string): Promise<ExecutionResult> {
    const startTime = new Date()
    const context: ExecutionContext = {
      workflowId,
      blockStates: new Map(),
      metadata: {
        startTime: startTime.toISOString()
      }
    }

    try {
      const executionOrder = this.determineExecutionOrder()
      
      for (const blockId of executionOrder) {
        const block = this.workflow.blocks.find(b => b.id === blockId)
        if (!block) {
          throw new Error(`Block ${blockId} not found in workflow`)
        }
        
        const blockInputs = this.resolveInputs(block, context)
        const result = await this.executeBlock(block, blockInputs, context)
        context.blockStates.set(blockId, result)
      }

      const lastBlockId = executionOrder[executionOrder.length - 1]
      const finalOutput = context.blockStates.get(lastBlockId)

      const endTime = new Date()
      return {
        success: true,
        data: finalOutput || {},
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      }
    } catch (error) {
      return {
        success: false,
        data: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
