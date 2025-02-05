/**
 * "Executor" for running agentic workflows in parallel.
 * 
 * Notes & Features:
 * • Uses a layered topological sort to allow parallel block execution for blocks with no remaining dependencies.
 * • Each block's inputs are resolved through a template mechanism (e.g., <blockId.property>).
 * • Stores block outputs in context.blockStates so subsequent blocks can reference them by ID or name.
 * • Maintains robust error handling (if a block fails, throws an error for the entire workflow).
 * • Returns per-block logs that can be displayed in the UI for better trace/debug.
 */

import { SerializedWorkflow, SerializedBlock } from '@/serializer/types'
import { BlockOutput } from '@/blocks/types'
import {
  Tool,
  ExecutionContext,
  ExecutionResult,
  BlockLog
} from './types'
import { tools, executeTool, getTool } from '@/tools'
import { executeProviderRequest } from '@/providers/service'
import { getAllBlocks } from '@/blocks'
import { BlockConfig } from '@/blocks/types'

export class Executor {
  constructor(
    private workflow: SerializedWorkflow,
    // Initial block states can be passed in if you need to resume workflows or pre-populate data.
    private initialBlockStates: Record<string, BlockOutput> = {},
    private environmentVariables: Record<string, string> = {}
  ) {}

  /**
   * Main entry point that executes the entire workflow in parallel layers.
   */
  async execute(workflowId: string): Promise<ExecutionResult> {
    const startTime = new Date()

    // Build the ExecutionContext with new blockLogs array
    const context: ExecutionContext = {
      workflowId,
      blockStates: new Map<string, BlockOutput>(),
      blockLogs: [],
      metadata: {
        startTime: startTime.toISOString()
      },
      environmentVariables: this.environmentVariables
    }

    // Pre-populate block states if initialBlockStates exist
    Object.entries(this.initialBlockStates).forEach(([blockId, output]) => {
      context.blockStates.set(blockId, output)
    })

    try {
      // Perform layered parallel execution
      const lastOutput = await this.executeInParallel(context)

      const endTime = new Date()
      context.metadata.endTime = endTime.toISOString()

      // Return full logs for the UI to consume
      return {
        success: true,
        output: lastOutput,
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          startTime: context.metadata.startTime!,
          endTime: context.metadata.endTime!,
        },
        logs: context.blockLogs,
      }
    } catch (error: any) {
      // Ensure we return a meaningful error message
      return {
        success: false,
        output: { response: {} },
        error: error.message || 'Workflow execution failed',
        logs: context.blockLogs,
      }
    }
  }

  /**
   * Executes all blocks in a layered topological fashion, running each layer in parallel via Promise.all.
   * If a cycle is detected, throws an error.
   */
  private async executeInParallel(context: ExecutionContext): Promise<BlockOutput> {
    const { blocks, connections } = this.workflow

    // Build in-degree and adjacency list for each block
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    // Initialize inDegree and adjacency
    for (const block of blocks) {
      inDegree.set(block.id, 0)
      adjacency.set(block.id, [])
    }

    // Populate edges
    for (const conn of connections) {
      inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1)
      adjacency.get(conn.source)?.push(conn.target)
    }

    // Start with all blocks that have inDegree = 0
    let layer = blocks
      .filter((b) => (inDegree.get(b.id) || 0) === 0)
      .map((b) => b.id)

    // Track the final output from the "last" block or set of blocks
    let lastOutput: BlockOutput = { response: {} }

    while (layer.length > 0) {
      // Execute current layer in parallel
      const results = await Promise.all(
        layer.map(async (blockId) => {
          // Find the block object
          const block = blocks.find((b) => b.id === blockId)
          if (!block) {
            throw new Error(`Missing block ${blockId}`)
          }

          // Skip disabled blocks
          if (block.enabled === false) {
            return { response: {} }
          }

          // Prepare a new blockLog entry
          const blockLog: Partial<BlockLog> = {
            blockId: block.id,
            blockTitle: block.metadata?.title,
            blockType: block.metadata?.type,
            startedAt: new Date().toISOString(),
          }

          try {
            // Resolve template references in block config params
            const resolvedInputs = this.resolveInputs(block, context)

            // Execute the block, store the result
            const output = await this.executeBlock(block, resolvedInputs, context)
            context.blockStates.set(block.id, output)

            // Update block log with success
            blockLog.success = true
            blockLog.output = output
            return output
          } catch (error) {
            // Update block log with error
            blockLog.success = false
            blockLog.error = error instanceof Error ? error.message : 'Unknown error'
            throw error
          } finally {
            // Compute the end time and duration
            const end = new Date()
            blockLog.endedAt = end.toISOString()
            
            if (blockLog.startedAt) {
              const started = new Date(blockLog.startedAt).getTime()
              blockLog.durationMs = end.getTime() - started
            } else {
              blockLog.durationMs = 0
            }

            // Push the log entry
            context.blockLogs.push(blockLog as BlockLog)
          }
        })
      )

      // Keep track of the "most recent" result as lastOutput
      if (results.length > 0) {
        lastOutput = results[results.length - 1]
      }

      // Build the next layer by reducing in-degree of neighbors
      const nextLayer: string[] = []
      for (const blockId of layer) {
        const neighbors = adjacency.get(blockId) || []
        for (const targetId of neighbors) {
          const deg = inDegree.get(targetId) ?? 0
          const newDeg = deg - 1
          inDegree.set(targetId, newDeg)
          if (newDeg === 0) {
            nextLayer.push(targetId)
          }
        }
      }

      layer = nextLayer
    }

    // Validate that all blocks were executed. If not, the workflow has a cycle.
    const executedCount = [...inDegree.values()].filter((x) => x === 0).length
    if (executedCount !== blocks.length) {
      throw new Error('Workflow contains cycles or invalid connections')
    }

    return lastOutput
  }

  /**
   * Executes a single block by:
   *  1) Determining which tool to call
   *  2) Validating parameters
   *  3) Making the request (for http blocks or LLM blocks, etc.)
   *  4) Transforming the response via the tool's transformResponse
   */
  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<{ response: Record<string, any> }> {
    // Special handling for agent blocks that use providers
    if (block.metadata?.type === 'agent') {
      const model = inputs.model || 'gpt-4o'
      const providerId = model.startsWith('gpt') || model.startsWith('o1') 
        ? 'openai'
        : model.startsWith('claude') 
          ? 'anthropic'
          : model.startsWith('gemini')
            ? 'google'
            : model.startsWith('grok')
              ? 'xai'
              : 'deepseek'

      // Format tools if they exist
      const tools = Array.isArray(inputs.tools) ? inputs.tools.map((tool: any) => {
        // Get the tool ID from the block type
        const block = getAllBlocks().find((b: BlockConfig) => b.type === tool.type)
        const toolId = block?.tools.access[0]
        if (!toolId) return null

        // Get the tool configuration
        const toolConfig = getTool(toolId)
        if (!toolConfig) return null

        // Resolve environment variables in tool parameters
        const resolvedParams = Object.entries(tool.params || {}).reduce((acc, [key, value]) => {
          if (typeof value === 'string') {
            // Handle environment variables with {{}} syntax
            const envMatches = value.match(/\{\{([^}]+)\}\}/g)
            if (envMatches) {
              let resolvedValue = value
              for (const match of envMatches) {
                const envKey = match.slice(2, -2) // remove {{ and }}
                const envValue = context.environmentVariables?.[envKey]
                
                if (envValue === undefined) {
                  throw new Error(`Environment variable "${envKey}" was not found.`)
                }

                resolvedValue = resolvedValue.replace(match, envValue)
              }
              acc[key] = resolvedValue
            } else {
              acc[key] = value
            }
          } else {
            acc[key] = value
          }
          return acc
        }, {} as Record<string, any>)

        // Return the tool configuration with resolved parameters
        return {
          id: toolConfig.id,
          name: toolConfig.name,
          description: toolConfig.description,
          params: resolvedParams,
          parameters: {
            type: 'object',
            properties: Object.entries(toolConfig.params).reduce((acc, [key, config]) => ({
              ...acc,
              [key]: {
                type: config.type === 'json' ? 'object' : config.type,
                description: config.description || '',
                ...(key in resolvedParams && { default: resolvedParams[key] })
              }
            }), {}),
            required: Object.entries(toolConfig.params)
              .filter(([_, config]) => config.required)
              .map(([key]) => key)
          }
        }
      }).filter((t): t is NonNullable<typeof t> => t !== null) : []

      const requestPayload = {
        model,
        systemPrompt: inputs.systemPrompt,
        context: inputs.context,
        tools: tools.length > 0 ? tools : undefined,
        temperature: inputs.temperature,
        maxTokens: inputs.maxTokens,
        apiKey: inputs.apiKey
      }

      // Log the request payload for debugging
      console.log('Provider Request:', {
        providerId,
        model,
        tools: requestPayload.tools,
      })

      const response = await executeProviderRequest(providerId, requestPayload)

      // Return the actual response values
      return {
        response: {
          content: response.content,
          model: response.model,
          tokens: response.tokens || {
            prompt: 0,
            completion: 0,
            total: 0
          },
          toolCalls: {
            list: response.toolCalls || [],
            count: response.toolCalls?.length || 0
          }
        }
      }
    }

    // Regular tool execution for non-agent blocks
    const toolId = block.config.tool
    if (!toolId) {
      throw new Error(`Block "${block.id}" does not specify a tool`)
    }

    const tool: Tool | undefined = tools[toolId]
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    const validatedParams = this.validateToolParams(tool, {
      ...block.config.params,
      ...inputs,
    })

    try {
      const result = await executeTool(toolId, validatedParams)
      
      if (!result.success) {
        // Ensure we have a meaningful error message
        const errorMessage = result.error || `Tool ${toolId} failed with no error message`
        throw new Error(errorMessage)
      }

      return { response: result.output }
    } catch (error: any) {
      // Update block log with error
      const blockLog: Partial<BlockLog> = {
        blockId: block.id,
        blockTitle: block.metadata?.title,
        blockType: block.metadata?.type,
        success: false,
        error: error.message || `Tool ${toolId} failed`,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0
      }
      
      // Add the log entry
      context.blockLogs.push(blockLog as BlockLog)

      // Re-throw the error
      throw error
    }
  }

  /**
   * Validates required parameters for a Tool, or uses defaults if present.
   */
  private validateToolParams(tool: Tool, params: Record<string, any>): Record<string, any> {
    return Object.entries(tool.params).reduce((acc, [name, config]) => {
      if (name in params) {
        acc[name] = params[name]
      } else if ('default' in config) {
        acc[name] = config.default
      } else if (config.required) {
        throw new Error(`Missing required parameter '${name}'`)
      }
      return acc
    }, {} as Record<string, any>)
  }

  /**
   * Resolves any template references in a block's config params (e.g., "<someBlockId.response>"),
   * pulling from context.blockStates. This is how outputs from one block get wired as inputs to another.
   */
  private resolveInputs(
    block: SerializedBlock,
    context: ExecutionContext
  ): Record<string, any> {
    const inputs = { ...block.config.params }

    // Create quick-lookup for blocks by ID and by normalized name
    const blockById = new Map(this.workflow.blocks.map((b) => [b.id, b]))
    const blockByName = new Map(
      this.workflow.blocks.map((b) => [
        b.metadata?.title?.toLowerCase().replace(/\s+/g, '') || '',
        b
      ])
    )

    const resolvedInputs = Object.entries(inputs).reduce(
      (acc, [key, value]) => {
        if (typeof value === 'string') {
          let resolvedValue = value

          // Handle block references with <> syntax
          const blockMatches = value.match(/<([^>]+)>/g)
          if (blockMatches) {
            for (const match of blockMatches) {
              // e.g. "<someBlockId.response>"
              const path = match.slice(1, -1) // remove < and >
              const [blockRef, ...pathParts] = path.split('.')

              // Try referencing as an ID, then as a normalized name.
              let sourceBlock = blockById.get(blockRef)
              if (!sourceBlock) {
                const normalized = blockRef.toLowerCase().replace(/\s+/g, '')
                sourceBlock = blockByName.get(normalized)
              }

              if (!sourceBlock) {
                throw new Error(`Block reference "${blockRef}" was not found.`)
              }

              // Check if the referenced block is disabled.
              if (sourceBlock.enabled === false) {
                throw new Error(`Block "${sourceBlock.metadata?.title}" is disabled, and block "${block.metadata?.title}" depends on it.`)
              }

              const sourceState = context.blockStates.get(sourceBlock.id)
              if (!sourceState) {
                throw new Error(`No state found for block "${sourceBlock.metadata?.title}" (ID: ${sourceBlock.id}).`)
              }

              // Drill into the path
              let replacementValue: any = sourceState
              for (const part of pathParts) {
                if (!replacementValue || typeof replacementValue !== 'object') {
                  throw new Error(`Invalid path part "${part}" in "${path}" for block "${block.metadata?.title}".`)
                }
                replacementValue = replacementValue[part]
              }

              // If a valid leaf is found
              if (replacementValue !== undefined) {
                // Replace the placeholder in the string
                resolvedValue = resolvedValue.replace(
                  match,
                  typeof replacementValue === 'object'
                    ? JSON.stringify(replacementValue)
                    : String(replacementValue)
                )
              } else {
                throw new Error(`No value found at path "${path}" in block "${sourceBlock.metadata?.title}".`)
              }
            }
          }

          // Handle environment variables with {{}} syntax
          const envMatches = resolvedValue.match(/\{\{([^}]+)\}\}/g)
          if (envMatches) {
            for (const match of envMatches) {
              const envKey = match.slice(2, -2) // remove {{ and }}
              const envValue = this.environmentVariables?.[envKey]
              
              if (envValue === undefined) {
                throw new Error(`Environment variable "${envKey}" was not found.`)
              }

              resolvedValue = resolvedValue.replace(match, envValue)
            }
          }

          // After all replacements are done, attempt JSON parse if it looks like JSON
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
          // Not a string param
          acc[key] = value
        }
        return acc
      },
      {} as Record<string, any>
    )

    return resolvedInputs
  }
}
