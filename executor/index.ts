import { SerializedWorkflow, SerializedBlock } from '@/serializer/types'
import { ExecutionContext, ExecutionResult, Tool } from './types'
import { tools } from '@/tools'
import { BlockOutput } from '@/blocks/types'

export class Executor {
  constructor(
    private workflow: SerializedWorkflow,
    private initialBlockStates: Record<string, BlockOutput> = {}
  ) {}

  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<BlockOutput> {
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

      const result = await tool.transformResponse(response)
      
      if (!result.success) {
        throw new Error(tool.transformError(result))
      }
      
      return {
        response: result.output
      }
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

    // Create maps for both ID and name lookups
    const blockById = new Map(
      this.workflow.blocks.map(b => [b.id, b])
    )
    const blockByName = new Map(
      this.workflow.blocks.map(b => [
        b.metadata?.title?.toLowerCase().replace(/\s+/g, '') || '',
        b
      ])
    )

    const resolvedInputs = Object.entries(inputs).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const matches = value.match(/<([^>]+)>/g)
        
        if (matches) {
          let resolvedValue = value
          
          matches.forEach(match => {
            const path = match.slice(1, -1) // Remove < and >
            const [blockRef, ...pathParts] = path.split('.')
            
            // Try to find block by ID first, then by normalized name
            let sourceBlock = blockById.get(blockRef)
            if (!sourceBlock) {
              const normalizedName = blockRef.toLowerCase().replace(/\s+/g, '')
              sourceBlock = blockByName.get(normalizedName)
            }

            if (!sourceBlock) {
              console.warn(`Block ${blockRef} not found by ID or name`)
              return
            }

            const sourceState = context.blockStates.get(sourceBlock.id)
            if (!sourceState) {
              console.warn(`No state found for block ${sourceBlock.id}`)
              return
            }

            // Start with the block's state
            let replacementValue: any = sourceState
            
            // Traverse the path parts to get the final value
            for (const part of pathParts) {
              if (!replacementValue || typeof replacementValue !== 'object') {
                console.warn(`Invalid path part ${part} in ${path}`)
                return
              }
              replacementValue = replacementValue[part]
            }

            if (replacementValue !== undefined) {
              // Replace the entire template expression with the resolved value
              resolvedValue = resolvedValue.replace(match, 
                typeof replacementValue === 'object' 
                  ? JSON.stringify(replacementValue)
                  : String(replacementValue)
              )
            } else {
              console.warn(`No value found at path ${path}`)
            }
          })
          
          // Try to parse the value if it looks like JSON
          try {
            if (resolvedValue.startsWith('{') || resolvedValue.startsWith('[')) {
              acc[key] = JSON.parse(resolvedValue)
            } else {
              acc[key] = resolvedValue
            }
          } catch {
            acc[key] = resolvedValue
          }
        } else {
          acc[key] = value
        }
      } else {
        acc[key] = value
      }

      return acc
    }, {} as Record<string, any>)

    return resolvedInputs
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
        
        const output = await this.executeBlock(block, this.resolveInputs(block, context), context)
        context.blockStates.set(blockId, output)
      }

      const endTime = new Date()
      const lastOutput = context.blockStates.get(executionOrder[executionOrder.length - 1])
      
      if (!lastOutput) {
        throw new Error('No output from workflow execution')
      }

      return {
        success: true,
        output: lastOutput,
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      }
    } catch (error) {
      return {
        success: false,
        output: { response: {} },
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
