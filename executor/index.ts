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
import { getAllBlocks } from '@/blocks'
import { generateRouterPrompt } from '@/blocks/blocks/router'
import { BlockOutput } from '@/blocks/types'
import { BlockConfig } from '@/blocks/types'
import { executeProviderRequest } from '@/providers/service'
import { getProviderFromModel } from '@/providers/utils'
import { SerializedBlock, SerializedWorkflow } from '@/serializer/types'
import { executeTool, getTool, tools } from '@/tools'
import { BlockLog, ExecutionContext, ExecutionResult, Tool } from './types'

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
        startTime: startTime.toISOString(),
      },
      environmentVariables: this.environmentVariables,
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

    let lastOutput: BlockOutput = { response: {} }
    let routerDecision: { routerId: string; chosenPath: string } | null = null

    // Start with all blocks that have inDegree = 0
    let layer = blocks.filter((b) => (inDegree.get(b.id) || 0) === 0).map((b) => b.id)

    while (layer.length > 0) {
      // Execute current layer in parallel, but only if blocks are in the chosen path
      const results = await Promise.all(
        layer
          .filter((blockId) => {
            // If we have a router decision, only execute blocks in the chosen path
            if (routerDecision) {
              return this.isInChosenPath(
                blockId,
                routerDecision.chosenPath,
                routerDecision.routerId
              )
            }
            return true
          })
          .map(async (blockId) => {
            const block = blocks.find((b) => b.id === blockId)
            if (!block) {
              throw new Error(`Missing block ${blockId}`)
            }

            // Skip disabled blocks
            if (block.enabled === false) {
              return { response: {} }
            }

            try {
              const resolvedInputs = this.resolveInputs(block, context)
              const output = await this.executeBlock(block, resolvedInputs, context)

              // If this is a router block, store its decision
              if (
                block.metadata?.type === 'router' &&
                output &&
                typeof output === 'object' &&
                'response' in output &&
                output.response &&
                typeof output.response === 'object' &&
                'selectedPath' in output.response
              ) {
                const routerResponse = output.response as { selectedPath: { blockId: string } }
                routerDecision = {
                  routerId: block.id,
                  chosenPath: routerResponse.selectedPath.blockId,
                }
              }

              context.blockStates.set(block.id, output)
              return output
            } catch (error) {
              throw error
            }
          })
      )

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
  ): Promise<BlockOutput> {
    // console.log(`Executing block ${block.metadata?.title} (${block.id})`, {
    //   type: block.metadata?.type,
    //   inputs
    // });

    // Start timing
    const startTime = new Date()
    const blockLog: BlockLog = {
      blockId: block.id,
      blockTitle: block.metadata?.title,
      blockType: block.metadata?.type,
      startedAt: startTime.toISOString(),
      endedAt: '',
      durationMs: 0,
      success: false,
    }

    try {
      // Handle router blocks differently
      if (block.metadata?.type === 'router') {
        const routerOutput = await this.executeRouterBlock(block, context)
        // console.log('Router output:', routerOutput);

        // Filter workflow to only include blocks in the chosen path
        this.workflow.blocks = this.workflow.blocks.filter((b) =>
          this.isInChosenPath(b.id, routerOutput.selectedPath.blockId, block.id)
        )

        const output = {
          response: {
            content: routerOutput.content,
            model: routerOutput.model,
            tokens: routerOutput.tokens,
            selectedPath: routerOutput.selectedPath,
          },
        }

        blockLog.success = true
        blockLog.output = output

        // Compute timing
        const endTime = new Date()
        blockLog.endedAt = endTime.toISOString()
        blockLog.durationMs = endTime.getTime() - startTime.getTime()

        // Add log entry
        context.blockLogs.push(blockLog)

        return output
      }

      // Special handling for agent blocks that use providers
      if (block.metadata?.type === 'agent') {
        // console.log('Agent inputs:', {
        //   systemPrompt: inputs.systemPrompt,
        //   context: inputs.context,
        //   tools: inputs.tools
        // });

        const model = inputs.model || 'gpt-4o'
        const providerId = getProviderFromModel(model)

        // Format tools if they exist
        const tools = Array.isArray(inputs.tools)
          ? inputs.tools
              .map((tool: any) => {
                // console.log('Processing tool:', tool);
                // Get the tool ID from the block type
                const block = getAllBlocks().find((b: BlockConfig) => b.type === tool.type)
                const toolId = block?.tools.access[0]
                if (!toolId) {
                  // console.log('No tool ID found for type:', tool.type);
                  return null
                }

                // Get the tool configuration
                const toolConfig = getTool(toolId)
                if (!toolConfig) {
                  // console.log('No tool config found for ID:', toolId);
                  return null
                }

                // Return the tool configuration with resolved parameters
                const toolSetup = {
                  id: toolConfig.id,
                  name: toolConfig.name,
                  description: toolConfig.description,
                  params: tool.params || {},
                  parameters: {
                    type: 'object',
                    properties: Object.entries(toolConfig.params).reduce(
                      (acc, [key, config]) => ({
                        ...acc,
                        [key]: {
                          type: config.type === 'json' ? 'object' : config.type,
                          description: config.description || '',
                          ...(key in tool.params && { default: tool.params[key] }),
                        },
                      }),
                      {}
                    ),
                    required: Object.entries(toolConfig.params)
                      .filter(([_, config]) => config.required)
                      .map(([key]) => key),
                  },
                }
                // console.log('Tool setup:', toolSetup);
                return toolSetup
              })
              .filter((t): t is NonNullable<typeof t> => t !== null)
          : []

        // console.log('Formatted tools:', tools);

        const response = await executeProviderRequest(providerId, {
          model,
          systemPrompt: inputs.systemPrompt,
          context: inputs.context,
          tools: tools.length > 0 ? tools : undefined,
          temperature: inputs.temperature,
          maxTokens: inputs.maxTokens,
          apiKey: inputs.apiKey,
        })

        // console.log('Provider response:', {
        //   content: response.content,
        //   toolCalls: response.toolCalls
        // });

        const output = {
          response: {
            content: response.content,
            model: response.model,
            tokens: response.tokens || {
              prompt: 0,
              completion: 0,
              total: 0,
            },
            toolCalls: {
              list: response.toolCalls || [],
              count: response.toolCalls?.length || 0,
            },
          },
        }

        blockLog.success = true
        blockLog.output = output

        // Compute timing
        const endTime = new Date()
        blockLog.endedAt = endTime.toISOString()
        blockLog.durationMs = endTime.getTime() - startTime.getTime()

        // Add log entry
        context.blockLogs.push(blockLog)

        return output
      }

      // Regular tool execution
      const tool = getTool(block.config.tool)
      if (!tool) {
        throw new Error(`Tool ${block.config.tool} not found`)
      }

      // console.log('Executing tool:', {
      //   tool: block.config.tool,
      //   inputs
      // });

      const result = await executeTool(block.config.tool, inputs)

      if (!result.success) {
        console.error('Tool execution failed:', result.error)
        throw new Error(result.error || `Tool ${block.config.tool} failed with no error message`)
      }

      const output = { response: result.output }

      blockLog.success = true
      blockLog.output = output

      // Compute timing
      const endTime = new Date()
      blockLog.endedAt = endTime.toISOString()
      blockLog.durationMs = endTime.getTime() - startTime.getTime()

      // Add log entry
      context.blockLogs.push(blockLog)

      return output
    } catch (error: any) {
      console.error('Block execution failed:', {
        blockId: block.id,
        blockTitle: block.metadata?.title,
        error: error.message,
      })

      // Update block log with error
      blockLog.success = false
      blockLog.error = error.message || `Block execution failed`

      // Compute timing
      const endTime = new Date()
      blockLog.endedAt = endTime.toISOString()
      blockLog.durationMs = endTime.getTime() - startTime.getTime()

      // Add log entry
      context.blockLogs.push(blockLog)

      throw error
    }
  }

  /**
   * Validates required parameters for a Tool, or uses defaults if present.
   */
  private validateToolParams(tool: Tool, params: Record<string, any>): Record<string, any> {
    return Object.entries(tool.params).reduce(
      (acc, [name, config]) => {
        if (name in params) {
          acc[name] = params[name]
        } else if ('default' in config) {
          acc[name] = config.default
        } else if (config.required) {
          throw new Error(`Missing required parameter '${name}'`)
        }
        return acc
      },
      {} as Record<string, any>
    )
  }

  /**
   * Resolves any template references in a block's config params (e.g., "<someBlockId.response>"),
   * pulling from context.blockStates. This is how outputs from one block get wired as inputs to another.
   */
  private resolveInputs(block: SerializedBlock, context: ExecutionContext): Record<string, any> {
    const inputs = { ...block.config.params }

    // Create quick-lookup for blocks by ID and by normalized name
    const blockById = new Map(this.workflow.blocks.map((b) => [b.id, b]))
    const blockByName = new Map(
      this.workflow.blocks.map((b) => [
        b.metadata?.title?.toLowerCase().replace(/\s+/g, '') || '',
        b,
      ])
    )

    // Helper function to resolve environment variables in a value
    const resolveEnvVars = (value: any): any => {
      if (typeof value === 'string') {
        const envMatches = value.match(/\{\{([^}]+)\}\}/g)
        if (envMatches) {
          let resolvedValue = value
          for (const match of envMatches) {
            const envKey = match.slice(2, -2)
            const envValue = this.environmentVariables?.[envKey]

            if (envValue === undefined) {
              throw new Error(`Environment variable "${envKey}" was not found.`)
            }

            resolvedValue = resolvedValue.replace(match, envValue)
          }
          return resolvedValue
        }
      } else if (Array.isArray(value)) {
        return value.map((item) => resolveEnvVars(item))
      } else if (value && typeof value === 'object') {
        return Object.entries(value).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: resolveEnvVars(v),
          }),
          {}
        )
      }
      return value
    }

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
                throw new Error(
                  `Block "${sourceBlock.metadata?.title}" is disabled, and block "${block.metadata?.title}" depends on it.`
                )
              }

              const sourceState = context.blockStates.get(sourceBlock.id)
              if (!sourceState) {
                throw new Error(
                  `No state found for block "${sourceBlock.metadata?.title}" (ID: ${sourceBlock.id}).`
                )
              }

              // Drill into the path
              let replacementValue: any = sourceState
              for (const part of pathParts) {
                if (!replacementValue || typeof replacementValue !== 'object') {
                  throw new Error(
                    `Invalid path part "${part}" in "${path}" for block "${block.metadata?.title}".`
                  )
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
                throw new Error(
                  `No value found at path "${path}" in block "${sourceBlock.metadata?.title}".`
                )
              }
            }
          }

          // After all block references are resolved, resolve any environment variables
          resolvedValue = resolveEnvVars(resolvedValue)

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
          // For non-string values, still try to resolve any nested environment variables
          acc[key] = resolveEnvVars(value)
        }
        return acc
      },
      {} as Record<string, any>
    )

    return resolvedInputs
  }

  private async executeRouterBlock(
    block: SerializedBlock,
    context: ExecutionContext
  ): Promise<{
    content: string
    model: string
    tokens: {
      prompt: number
      completion: number
      total: number
    }
    selectedPath: {
      blockId: string
      blockType: string
      blockTitle: string
    }
  }> {
    // First resolve all inputs including environment variables
    const resolvedInputs = this.resolveInputs(block, context)

    const outgoingConnections = this.workflow.connections.filter((conn) => conn.source === block.id)

    const targetBlocks = outgoingConnections.map((conn) => {
      const targetBlock = this.workflow.blocks.find((b) => b.id === conn.target)
      if (!targetBlock) {
        throw new Error(`Target block ${conn.target} not found`)
      }

      return {
        id: targetBlock.id,
        type: targetBlock.metadata?.type,
        title: targetBlock.metadata?.title,
        description: targetBlock.metadata?.description,
        category: targetBlock.metadata?.category,
        subBlocks: targetBlock.config.params,
        currentState: context.blockStates.get(targetBlock.id),
      }
    })

    const routerConfig = {
      prompt: resolvedInputs.prompt,
      model: resolvedInputs.model,
      apiKey: resolvedInputs.apiKey,
      temperature: resolvedInputs.temperature || 0,
    }

    const model = routerConfig.model || 'gpt-4o'
    const providerId = getProviderFromModel(model)

    const response = await executeProviderRequest(providerId, {
      model: routerConfig.model,
      systemPrompt: generateRouterPrompt(routerConfig.prompt, targetBlocks),
      messages: [
        {
          role: 'user',
          content: routerConfig.prompt,
        },
      ],
      temperature: routerConfig.temperature,
      apiKey: routerConfig.apiKey,
    })

    const chosenBlockId = response.content.trim().toLowerCase()
    const chosenBlock = targetBlocks.find((b) => b.id === chosenBlockId)

    if (!chosenBlock) {
      throw new Error(`Invalid routing decision: ${chosenBlockId}`)
    }

    // Pass through the actual resolved content from the source block
    const sourceContent = resolvedInputs.prompt

    // Ensure tokens are properly typed
    const tokens = response.tokens || { prompt: 0, completion: 0, total: 0 }

    return {
      content: sourceContent, // This now contains the actual resolved content from Agent 4
      model: response.model,
      tokens: {
        prompt: tokens.prompt || 0,
        completion: tokens.completion || 0,
        total: tokens.total || 0,
      },
      selectedPath: {
        blockId: chosenBlock.id,
        blockType: chosenBlock.type || 'unknown',
        blockTitle: chosenBlock.title || 'Untitled Block',
      },
    }
  }

  private isInChosenPath(blockId: string, chosenBlockId: string, routerId: string): boolean {
    const visited = new Set<string>()
    const queue = [chosenBlockId]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const connections = this.workflow.connections.filter((conn) => conn.source === currentId)
      for (const conn of connections) {
        queue.push(conn.target)
      }
    }

    return blockId === routerId || visited.has(blockId)
  }
}
