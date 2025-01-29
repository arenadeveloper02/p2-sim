import { SerializedWorkflow, SerializedBlock } from '@/serializer/types'
import { ExecutionContext, ExecutionResult, Tool } from './types'
import { tools } from '@/tools'

export class Executor {
  constructor(
    private workflow: SerializedWorkflow,
    private initialBlockStates: Record<string, any> = {}
  ) {}

  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const toolId = block.config.tool
    if (!toolId) throw new Error(`Block ${block.id} does not specify a tool`)

    const tool = tools[toolId]
    if (!tool) throw new Error(`Tool not found: ${toolId}`)

    const validatedParams = this.validateToolParams(tool, { ...block.config.params, ...inputs })

    try {
      const url = typeof tool.request.url === 'function' ? tool.request.url(validatedParams) : tool.request.url
      const headers = tool.request.headers(validatedParams)
      const method = typeof validatedParams.method === 'object' 
        ? validatedParams.method.method 
        : (validatedParams.method || tool.request.method)

      const body = (method !== 'GET' && method !== 'HEAD' && tool.request.body) 
        ? JSON.stringify(tool.request.body(validatedParams)) 
        : undefined

      const response = await fetch(url, { method, headers, body })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(tool.transformError(error))
      }
      return await tool.transformResponse(response)
    } catch (error) {
      throw new Error(`Tool ${toolId} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private validateToolParams(tool: Tool, params: Record<string, any>): Record<string, any> {
    return Object.entries(tool.params).reduce((validated, [name, config]) => {
      if (name in params) validated[name] = params[name]
      else if ('default' in config) validated[name] = config.default
      else if (config.required) throw new Error(`Missing required parameter '${name}'`)
      return validated
    }, {} as Record<string, any>)
  }

  private determineExecutionOrder(): string[] {
    const { blocks, connections } = this.workflow
    const order: string[] = []
    const visited = new Set<string>()
    const inDegree = new Map(blocks.map(block => [block.id, 0]))
    
    connections.forEach(conn => {
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1)
    })
    
    const queue = blocks
      .filter(block => inDegree.get(block.id) === 0)
      .map(block => block.id)
    
    while (queue.length > 0) {
      const blockId = queue.shift()!
      if (!visited.has(blockId)) {
        visited.add(blockId)
        order.push(blockId)
        
        connections
          .filter(conn => conn.source === blockId)
          .forEach(conn => {
            const newDegree = (inDegree.get(conn.target) || 0) - 1
            inDegree.set(conn.target, newDegree)
            if (newDegree === 0) queue.push(conn.target)
          })
      }
    }
    
    if (order.length !== blocks.length) throw new Error('Workflow contains cycles')
    return order
  }

  private resolveInputs(block: SerializedBlock, context: ExecutionContext): Record<string, any> {
    const inputs = { ...block.config.params }
    const blockNameMap = new Map(
      this.workflow.blocks
        .map(b => {
          const name = b.metadata?.title?.toLowerCase().replace(' ', '') || ''
          return name ? [name, b.id] as [string, string] : null
        })
        .filter((entry): entry is [string, string] => entry !== null)
    )

    const blockStateMap = new Map(
      Object.entries(this.initialBlockStates)
        .filter(([_, state]) => state !== undefined)
    )

    const connectionPattern = /<([a-z0-9]+)\.(string|number|boolean|res|any)>/g
    
    return Object.entries(block.config.params || {}).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        let resolvedValue = value
        Array.from(value.matchAll(connectionPattern)).forEach(match => {
          const [fullMatch, blockName, type] = match
          const blockId = blockNameMap.get(blockName) || blockName
          const sourceOutput = context.blockStates.get(blockId) || blockStateMap.get(blockId)
          
          if (sourceOutput) {
            const replacementValue = type === 'res' 
              ? (sourceOutput.response?.method || sourceOutput.response || sourceOutput)
              : (sourceOutput.output || sourceOutput.response)
            
            if (replacementValue !== undefined) {
              resolvedValue = resolvedValue.replace(fullMatch, replacementValue.toString())
            }
          }
        })
        acc[key] = resolvedValue
      } else {
        acc[key] = value
      }
      return acc
    }, inputs)
  }

  async execute(workflowId: string): Promise<ExecutionResult> {
    const startTime = new Date()
    const context: ExecutionContext = {
      workflowId,
      blockStates: new Map(),
      metadata: { startTime: startTime.toISOString() }
    }

    try {
      const executionOrder = this.determineExecutionOrder()
      
      for (const blockId of executionOrder) {
        const block = this.workflow.blocks.find(b => b.id === blockId)
        if (!block) throw new Error(`Block ${blockId} not found in workflow`)
        
        const result = await this.executeBlock(block, this.resolveInputs(block, context), context)
        context.blockStates.set(blockId, result)
      }

      const endTime = new Date()
      return {
        success: true,
        data: context.blockStates.get(executionOrder[executionOrder.length - 1]) || {},
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
