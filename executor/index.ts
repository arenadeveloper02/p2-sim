/**
 * Executor for running agentic workflows in parallel.
 *
 * High-Level Overview:
 * - This class is responsible for running workflows using a layered topological sort.
 * - Blocks that have no unresolved dependencies are executed in parallel.
 * - Depending on the block type (router, condition, agent, or regular tool), different execution
 *   logic is applied. For example, condition blocks evaluate multiple branches and record the
 *   chosen branch via its condition ID so that only that path is executed.
 * - Each block's output is stored in the ExecutionContext so that subsequent blocks can reference them.
 * - Detailed logs are collected for each block to assist with debugging.
 *
 * Error Handling:
 * - If a block fails, an error is thrown, halting the workflow.
 * - Meaningful error messages are provided.
 */
import { getAllBlocks } from '@/blocks'
import { generateRouterPrompt } from '@/blocks/blocks/router'
import { BlockOutput } from '@/blocks/types'
import { BlockConfig } from '@/blocks/types'
import { executeProviderRequest } from '@/providers/service'
import { getProviderFromModel } from '@/providers/utils'
import { SerializedBlock, SerializedWorkflow } from '@/serializer/types'
import { executeTool, getTool } from '@/tools'
import { BlockLog, ExecutionContext, ExecutionResult, Tool } from './types'

export class Executor {
  constructor(
    private workflow: SerializedWorkflow,
    // Initial block states can be passed in (e.g., for resuming workflows or pre-populating data)
    private initialBlockStates: Record<string, BlockOutput> = {},
    private environmentVariables: Record<string, string> = {}
  ) {}

  /**
   * Main entry point that executes the entire workflow in layered parallel fashion.
   */
  async execute(workflowId: string): Promise<ExecutionResult> {
    const startTime = new Date()

    // Build the execution context: holds outputs, logs, metadata, and environment variables.
    const context: ExecutionContext = {
      workflowId,
      blockStates: new Map<string, BlockOutput>(),
      blockLogs: [],
      metadata: {
        startTime: startTime.toISOString(),
      },
      environmentVariables: this.environmentVariables,
    }

    // Pre-populate context with any initial block states.
    Object.entries(this.initialBlockStates).forEach(([blockId, output]) => {
      context.blockStates.set(blockId, output)
    })

    try {
      // Execute all blocks in parallel layers (using topological sorting).
      const lastOutput = await this.executeInParallel(context)

      const endTime = new Date()
      context.metadata.endTime = endTime.toISOString()

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
      return {
        success: false,
        output: { response: {} },
        error: error.message || 'Workflow execution failed',
        logs: context.blockLogs,
      }
    }
  }

  /**
   * Executes workflow blocks layer-by-layer. Blocks with no dependencies are processed together.
   *
   * Notes:
   * - Maintains in-degrees and adjacency lists for blocks (i.e. dependencies).
   * - Blocks with condition or router types update routing/conditional decisions.
   * - Only the branch corresponding to the evaluated condition is executed.
   */
  private async executeInParallel(context: ExecutionContext): Promise<BlockOutput> {
    const { blocks, connections } = this.workflow

    // Build dependency graphs: inDegree (number of incoming edges) and adjacency (outgoing connections)
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const block of blocks) {
      inDegree.set(block.id, 0)
      adjacency.set(block.id, [])
    }

    // Populate inDegree and adjacency. For conditional connections, inDegree is handled dynamically.
    for (const conn of connections) {
      // Increase inDegree only for regular (non-conditional) connections.
      if (!conn.condition) {
        inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1)
      }
      adjacency.get(conn.source)?.push(conn.target)
    }

    // Maps for router and conditional decisions.
    // routerDecisions: router block id -> chosen target block id.
    // activeConditionalPaths: conditional block id -> selected condition id.
    const routerDecisions = new Map<string, string>()
    const activeConditionalPaths = new Map<string, string>()

    // Queue initially contains all blocks without dependencies.
    const queue: string[] = []
    for (const [blockId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(blockId)
      }
    }

    // This variable will store the output of the latest executed block.
    let lastOutput: BlockOutput = { response: {} }

    // Process blocks layer by layer.
    while (queue.length > 0) {
      const currentLayer = [...queue]
      queue.length = 0

      // Filtering: only execute blocks that match router and conditional decisions.
      const executableBlocks = currentLayer.filter((blockId) => {
        // First check if block is enabled
        const block = blocks.find((b) => b.id === blockId)
        if (!block || block.enabled === false) {
          return false
        }

        // Verify if block lies on the router's chosen path
        for (const [routerId, chosenPath] of routerDecisions) {
          if (!this.isInChosenPath(blockId, chosenPath, routerId)) {
            return false
          }
        }

        // Verify if block lies on the selected conditional path
        for (const [conditionBlockId, selectedConditionId] of activeConditionalPaths) {
          const connection = connections.find(
            (conn) =>
              conn.source === conditionBlockId &&
              conn.target === blockId &&
              conn.sourceHandle?.startsWith('condition-')
          )
          if (connection) {
            // Extract condition id from sourceHandle (format: "condition-<conditionId>")
            const connConditionId = connection.sourceHandle?.replace('condition-', '')
            if (connConditionId !== selectedConditionId) {
              return false
            }
          }
        }
        return true
      })

      // Execute blocks in the current layer in parallel.
      const layerResults = await Promise.all(
        executableBlocks.map(async (blockId) => {
          const block = blocks.find((b) => b.id === blockId)
          if (!block) {
            throw new Error(`Block ${blockId} not found`)
          }

          // Resolve inputs (including template variables and env vars) for the block.
          const inputs = this.resolveInputs(block, context)
          const result = await this.executeBlock(block, inputs, context)
          // Store the block output in context for later reference.
          context.blockStates.set(block.id, result)
          // Update lastOutput to reflect the latest executed block.
          lastOutput = result

          // For router or condition blocks, update decision maps accordingly.
          if (block.metadata?.type === 'router') {
            const routerResult = result as {
              response: {
                content: string
                model: string
                tokens: {
                  prompt: number
                  completion: number
                  total: number
                }
                selectedPath: { blockId: string }
              }
            }
            routerDecisions.set(block.id, routerResult.response.selectedPath.blockId)
          } else if (block.metadata?.type === 'condition') {
            const conditionResult = result as {
              response: {
                condition: {
                  selectedConditionId: string
                  result: boolean
                }
              }
            }
            activeConditionalPaths.set(
              block.id,
              conditionResult.response.condition.selectedConditionId
            )
          }
          return blockId
        })
      )

      // After executing a layer, update in-degrees for all adjacent blocks.
      for (const finishedBlockId of layerResults) {
        const neighbors = adjacency.get(finishedBlockId) || []
        for (const neighbor of neighbors) {
          // Find the relevant connection from finishedBlockId to neighbor.
          const connection = connections.find(
            (conn) => conn.source === finishedBlockId && conn.target === neighbor
          )
          if (!connection) continue

          // Regular (non-conditional) connection: always decrement.
          if (!connection.sourceHandle || !connection.sourceHandle.startsWith('condition-')) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) {
              queue.push(neighbor)
            }
          } else {
            // For a conditional connection, only decrement if the active condition matches.
            const conditionId = connection.sourceHandle.replace('condition-', '')
            if (activeConditionalPaths.get(finishedBlockId) === conditionId) {
              const newDegree = (inDegree.get(neighbor) || 0) - 1
              inDegree.set(neighbor, newDegree)
              if (newDegree === 0) {
                queue.push(neighbor)
              }
            }
          }
        }
      }
    }

    return lastOutput
  }

  /**
   * Executes a single block. Deduces the tool to call, validates parameters,
   * makes the request, and transforms the response.
   *
   * The result is logged and returned.
   */
  private async executeBlock(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<BlockOutput> {
    // Check if block is disabled
    if (block.enabled === false) {
      throw new Error(`Cannot execute disabled block: ${block.metadata?.title || block.id}`)
    }

    const startTime = new Date()
    const blockLog: BlockLog = {
      blockId: block.id,
      blockTitle: block.metadata?.title || '',
      blockType: block.metadata?.type || '',
      startedAt: startTime.toISOString(),
      endedAt: '',
      durationMs: 0,
      success: false,
    }

    try {
      let output: BlockOutput

      // Execute block based on its type.
      if (block.metadata?.type === 'router') {
        const routerOutput = await this.executeRouterBlock(block, context)
        output = {
          response: {
            content: routerOutput.content,
            model: routerOutput.model,
            tokens: routerOutput.tokens,
            selectedPath: routerOutput.selectedPath,
          },
        }
      } else if (block.metadata?.type === 'condition') {
        const conditionResult = await this.executeConditionalBlock(block, context)
        output = {
          response: {
            result: conditionResult.sourceOutput,
            content: conditionResult.content,
            condition: {
              result: conditionResult.condition,
              selectedPath: conditionResult.selectedPath,
              selectedConditionId: conditionResult.selectedConditionId,
            },
          },
        }
      } else if (block.metadata?.type === 'agent') {
        // Agent block: use a provider request.
        let responseFormat: any = undefined
        if (inputs.responseFormat) {
          try {
            responseFormat =
              typeof inputs.responseFormat === 'string'
                ? JSON.parse(inputs.responseFormat)
                : inputs.responseFormat
          } catch (error: any) {
            console.error('Error parsing responseFormat:', error)
            throw new Error('Invalid response format: ' + error.message)
          }
        }

        const model = inputs.model || 'gpt-4o'
        const providerId = getProviderFromModel(model)

        // Format tools if provided. (Rename local variable to avoid conflict with imported "tools".)
        const formattedTools = Array.isArray(inputs.tools)
          ? inputs.tools
              .map((tool: any) => {
                const blockFound = getAllBlocks().find((b: BlockConfig) => b.type === tool.type)
                const toolId = blockFound?.tools.access[0]
                if (!toolId) return null

                const toolConfig = getTool(toolId)
                if (!toolConfig) return null

                return {
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
              })
              .filter((t): t is NonNullable<typeof t> => t !== null)
          : []

        const response = await executeProviderRequest(providerId, {
          model,
          systemPrompt: inputs.systemPrompt,
          context:
            Array.isArray(inputs.context) === true
              ? JSON.stringify(inputs.context, null, 2)
              : inputs.context,
          tools: formattedTools.length > 0 ? formattedTools : undefined,
          temperature: inputs.temperature,
          maxTokens: inputs.maxTokens,
          apiKey: inputs.apiKey,
          responseFormat,
        })

        output = responseFormat
          ? {
              ...JSON.parse(response.content),
              tokens: response.tokens || {
                prompt: 0,
                completion: 0,
                total: 0,
              },
              toolCalls: response.toolCalls
                ? {
                    list: response.toolCalls,
                    count: response.toolCalls.length,
                  }
                : undefined,
            }
          : {
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
      } else {
        // Regular tool block execution.
        const tool = getTool(block.config.tool)
        if (!tool) {
          throw new Error(`Tool not found: ${block.config.tool}`)
        }

        const result = await executeTool(block.config.tool, inputs)
        if (!result.success) {
          console.error('Tool execution failed:', result.error)
          throw new Error(result.error || `Tool ${block.config.tool} failed with no error message`)
        }
        output = { response: result.output }
      }

      // Mark block execution as successful and record timing.
      blockLog.success = true
      blockLog.output = output
      const endTime = new Date()
      blockLog.endedAt = endTime.toISOString()
      blockLog.durationMs = endTime.getTime() - startTime.getTime()
      context.blockLogs.push(blockLog)

      // Ensure block output is available in the context for downstream blocks.
      context.blockStates.set(block.id, output)
      return output
    } catch (error: any) {
      // On error: log the error, update blockLog, and rethrow.
      blockLog.success = false
      blockLog.error = error.message || 'Block execution failed'
      const endTime = new Date()
      blockLog.endedAt = endTime.toISOString()
      blockLog.durationMs = endTime.getTime() - startTime.getTime()
      context.blockLogs.push(blockLog)
      throw error
    }
  }

  /**
   * Resolves template references in a block's configuration (e.g., "<blockId.property>"),
   * as well as environment variables (format: "{{ENV_VAR}}").
   * The values are pulled from the context's blockStates and environmentVariables.
   */
  private resolveInputs(block: SerializedBlock, context: ExecutionContext): Record<string, any> {
    const inputs = { ...block.config.params }

    // Create quick lookups for blocks by ID and by normalized title.
    const blockById = new Map(this.workflow.blocks.map((b) => [b.id, b]))
    const blockByName = new Map(
      this.workflow.blocks.map((b) => [
        b.metadata?.title?.toLowerCase().replace(/\s+/g, '') || '',
        b,
      ])
    )

    // Helper to resolve environment variables in a given value.
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

          // Resolve block reference templates in the format "<blockId.property>"
          const blockMatches = value.match(/<([^>]+)>/g)
          if (blockMatches) {
            for (const match of blockMatches) {
              // e.g. "<someBlockId.response>"
              const path = match.slice(1, -1)
              const [blockRef, ...pathParts] = path.split('.')
              let sourceBlock = blockById.get(blockRef)
              if (!sourceBlock) {
                const normalized = blockRef.toLowerCase().replace(/\s+/g, '')
                sourceBlock = blockByName.get(normalized)
              }
              if (!sourceBlock) {
                throw new Error(`Block reference "${blockRef}" was not found.`)
              }
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
              // Drill into the property path.
              let replacementValue: any = sourceState
              for (const part of pathParts) {
                if (!replacementValue || typeof replacementValue !== 'object') {
                  throw new Error(
                    `Invalid path "${part}" in "${path}" for block "${block.metadata?.title}".`
                  )
                }
                // Optional: special-case formatting for response formats.
                replacementValue = replacementValue[part]
              }
              if (replacementValue !== undefined) {
                if (block.metadata?.type === 'function' && key === 'code') {
                  // For function blocks, format the code nicely.
                  resolvedValue = resolvedValue.replace(
                    match,
                    typeof replacementValue === 'object'
                      ? JSON.stringify(replacementValue, null, 2)
                      : JSON.stringify(String(replacementValue))
                  )
                } else if (key === 'context') {
                  resolvedValue =
                    typeof replacementValue === 'string'
                      ? replacementValue
                      : JSON.stringify(replacementValue, null, 2)
                } else {
                  resolvedValue = resolvedValue.replace(
                    match,
                    typeof replacementValue === 'object'
                      ? JSON.stringify(replacementValue)
                      : String(replacementValue)
                  )
                }
              } else {
                throw new Error(
                  `No value found at path "${path}" in block "${sourceBlock.metadata?.title}".`
                )
              }
            }
          }
          // Resolve environment variables.
          resolvedValue = resolveEnvVars(resolvedValue)
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
          acc[key] = resolveEnvVars(value)
        }
        return acc
      },
      {} as Record<string, any>
    )

    return resolvedInputs
  }

  /**
   * Executes a router block which calculates branching decisions based on a prompt.
   */
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
    // Resolve inputs for the router block.
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

    // Generate and send the router prompt.
    const response = await executeProviderRequest(providerId, {
      model: routerConfig.model,
      systemPrompt: generateRouterPrompt(routerConfig.prompt, targetBlocks),
      messages: [{ role: 'user', content: routerConfig.prompt }],
      temperature: routerConfig.temperature,
      apiKey: routerConfig.apiKey,
    })

    const chosenBlockId = response.content.trim().toLowerCase()
    const chosenBlock = targetBlocks.find((b) => b.id === chosenBlockId)
    if (!chosenBlock) {
      throw new Error(`Invalid routing decision: ${chosenBlockId}`)
    }

    const tokens = response.tokens || { prompt: 0, completion: 0, total: 0 }
    return {
      content: resolvedInputs.prompt,
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

  /**
   * Determines whether a block is reachable along the chosen router path.
   *
   * This uses a breadth-first search starting from the chosen block id.
   */
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

  /**
   * Executes a condition block that evaluates a set of conditions (if/else-if/else).
   *
   * The block:
   * - Parses its conditions.
   * - Uses the source block's output to evaluate each condition.
   * - Selects the branch matching the evaluation (via sourceHandle in the connection).
   * - Returns an output that includes the boolean result and the selected condition's ID.
   */
  private async executeConditionalBlock(
    block: SerializedBlock,
    context: ExecutionContext
  ): Promise<{
    content: string
    condition: boolean
    selectedConditionId: string
    sourceOutput: BlockOutput
    selectedPath: {
      blockId: string
      blockType: string
      blockTitle: string
    }
  }> {
    const conditions = JSON.parse(block.config.params.conditions)
    console.log('Parsed conditions:', conditions)

    // Identify the source block that feeds into this condition block.
    const sourceBlockId = this.workflow.connections.find((conn) => conn.target === block.id)?.source

    if (!sourceBlockId) {
      throw new Error(`No source block found for condition block ${block.id}`)
    }

    const sourceOutput = context.blockStates.get(sourceBlockId)
    if (!sourceOutput) {
      throw new Error(`No output found for source block ${sourceBlockId}`)
    }
    console.log('Source block output:', sourceOutput)

    const outgoingConnections = this.workflow.connections.filter((conn) => conn.source === block.id)
    console.log('Outgoing connections:', outgoingConnections)

    let conditionMet = false
    let selectedConnection: { target: string; sourceHandle?: string } | null = null
    let selectedCondition: { id: string; title: string; value: string } | null = null

    // Evaluate conditions one by one.
    for (const condition of conditions) {
      try {
        // Resolve the condition expression using the current context.
        const resolvedCondition = this.resolveInputs(
          {
            id: block.id,
            config: { params: { condition: condition.value }, tool: block.config.tool },
            metadata: block.metadata,
            position: block.position,
            inputs: block.inputs,
            outputs: block.outputs,
            enabled: block.enabled,
          },
          context
        )
        const evalContext = {
          ...(typeof sourceOutput === 'object' && sourceOutput !== null ? sourceOutput : {}),
          agent1: sourceOutput,
        }
        conditionMet = new Function(
          'context',
          `with(context) { return ${resolvedCondition.condition} }`
        )(evalContext)

        // Cast the connection so that TypeScript knows it has a target property.
        const connection = outgoingConnections.find(
          (conn) => conn.sourceHandle === `condition-${condition.id}`
        ) as { target: string; sourceHandle?: string } | undefined

        if (connection) {
          // For if/else-if, require conditionMet to be true.
          // For else, unconditionally select it.
          if ((condition.title === 'if' || condition.title === 'else if') && conditionMet) {
            selectedConnection = connection
            selectedCondition = condition
            break
          } else if (condition.title === 'else') {
            selectedConnection = connection
            selectedCondition = condition
            break
          }
        }
      } catch (error: any) {
        console.error(`Failed to evaluate condition: ${error.message}`, {
          condition,
          error,
        })
        throw new Error(`Failed to evaluate condition: ${error.message}`)
      }
    }

    if (!selectedConnection || !selectedCondition) {
      throw new Error(`No matching path found for condition block ${block.id}`)
    }

    // Identify the target block based on the selected connection.
    const targetBlock = this.workflow.blocks.find((b) => b.id === selectedConnection!.target)
    if (!targetBlock) {
      throw new Error(`Target block ${selectedConnection!.target} not found`)
    }

    // Get the raw output from the source block's state
    const sourceBlockState = context.blockStates.get(sourceBlockId)
    if (!sourceBlockState) {
      throw new Error(`No state found for source block ${sourceBlockId}`)
    }

    // Create the block output with the source output when condition is met
    const blockOutput = {
      response: {
        result: conditionMet ? sourceBlockState : false,
        content: `Condition '${selectedCondition.title}' evaluated to ${conditionMet}`,
        condition: {
          result: conditionMet,
          selectedPath: {
            blockId: targetBlock.id,
            blockType: targetBlock.metadata?.type || '',
            blockTitle: targetBlock.metadata?.title || '',
          },
          selectedConditionId: selectedCondition.id,
        },
      },
    }

    // Store the block output in the context
    context.blockStates.set(block.id, blockOutput)

    return {
      content: `Condition '${selectedCondition.title}' chosen`,
      condition: conditionMet,
      selectedConditionId: selectedCondition.id,
      sourceOutput: sourceBlockState,
      selectedPath: {
        blockId: targetBlock.id,
        blockType: targetBlock.metadata?.type || '',
        blockTitle: targetBlock.metadata?.title || '',
      },
    }
  }
}
