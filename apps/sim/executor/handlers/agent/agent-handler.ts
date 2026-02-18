import { db } from '@sim/db'
import { account, mcpServers } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createMcpToolId } from '@/lib/mcp/utils'
import { refreshTokenIfNeeded } from '@/app/api/auth/oauth/utils'
import { getAllBlocks } from '@/blocks'
import type { BlockOutput } from '@/blocks/types'
import { AGENT, BlockType, DEFAULTS, REFERENCE, stripCustomToolPrefix } from '@/executor/constants'
import { memoryService } from '@/executor/handlers/agent/memory'
import type {
  AgentInputs,
  Message,
  StreamingConfig,
  ToolInput,
} from '@/executor/handlers/agent/types'
import type { BlockHandler, ExecutionContext, StreamingExecution } from '@/executor/types'
import { collectBlockData } from '@/executor/utils/block-data'
import { buildAPIUrl, buildAuthHeaders } from '@/executor/utils/http'
import { analyzeIntent, combineAndSortSearchResults } from '@/executor/utils/intent-analyzer'
import { stringifyJSON } from '@/executor/utils/json'
import {
  validateBlockType,
  validateCustomToolsAllowed,
  validateMcpToolsAllowed,
  validateModelProvider,
} from '@/executor/utils/permission-check'
import { executeProviderRequest } from '@/providers'
import { getProviderFromModel, transformBlockTool } from '@/providers/utils'
import type { SerializedBlock } from '@/serializer/types'
import { executeTool } from '@/tools'
import { getTool, getToolAsync } from '@/tools/utils'

const logger = createLogger('AgentBlockHandler')

/**
 * Gets conversationId from the Start block output in the execution context.
 * Returns undefined if not found.
 */
function getConversationIdFromStartBlock(ctx: ExecutionContext): string | undefined {
  if (!ctx.workflow?.blocks) {
    return undefined
  }

  // Find the Start block (can be start_trigger or starter)
  const startBlock = ctx.workflow.blocks.find(
    (b) => b.metadata?.id === BlockType.START_TRIGGER || b.metadata?.id === BlockType.STARTER
  )

  if (!startBlock) {
    return undefined
  }

  // Get the Start block's output from blockStates
  const startBlockState = ctx.blockStates.get(startBlock.id)
  if (!startBlockState?.output) {
    return undefined
  }

  const conversationId = startBlockState.output.conversationId
  return typeof conversationId === 'string' ? conversationId : undefined
}

/**
 * Handler for Agent blocks that process LLM requests with optional tools.
 */
export class AgentBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.AGENT
  }

  async execute(
    ctx: ExecutionContext,
    block: SerializedBlock,
    inputs: AgentInputs
  ): Promise<BlockOutput | StreamingExecution> {
    const filteredTools = await this.filterUnavailableMcpTools(ctx, inputs.tools || [])

    // Default memoryType to 'conversation' if not provided or is 'none'
    const memoryType =
      inputs.memoryType && inputs.memoryType !== 'none' ? inputs.memoryType : 'conversation'

    // Automatically get conversationId from Start block if not provided
    const conversationId = inputs.conversationId || getConversationIdFromStartBlock(ctx)

    const filteredInputs = {
      ...inputs,
      tools: filteredTools,
      memoryType: memoryType as 'conversation',
      conversationId: conversationId,
    }

    await this.validateToolPermissions(ctx, filteredInputs.tools || [])

    const responseFormat = this.parseResponseFormat(filteredInputs.responseFormat)
    const model = filteredInputs.model || AGENT.DEFAULT_MODEL

    await validateModelProvider(ctx.userId, model, ctx)

    const providerId = getProviderFromModel(model)
    const formattedTools = await this.formatTools(ctx, filteredInputs.tools || [])
    const streamingConfig = this.getStreamingConfig(ctx, block)

    // Log initial systemPrompt and userPrompt
    logger.debug('Agent block execution started')

    // Extract user prompt once for reuse across memory, intent analysis, etc.
    let userPrompt: string | undefined
    if (inputs.userPrompt) {
      userPrompt =
        typeof inputs.userPrompt === 'string'
          ? inputs.userPrompt
          : JSON.stringify(inputs.userPrompt)
    } else if (inputs.messages && Array.isArray(inputs.messages)) {
      const userMsg = inputs.messages.find((m) => m.role === 'user')
      if (userMsg) {
        userPrompt = userMsg.content
      }
    }

    // Fetch fact memories early (used for both intent analysis and system prompt)
    let factMemories: Message[] = []
    if (filteredInputs.memoryType) {
      factMemories = await memoryService.searchMemories(
        ctx,
        inputs,
        block.id,
        userPrompt,
        false,
        false
      )
    }

    // Intent analysis: search Mem0 conversation memories and decide RUN/SKIP
    let preSearchedResults: Message[] | undefined
    if (filteredInputs.memoryType && filteredInputs.conversationId && userPrompt) {
      try {
        const intentResult = await analyzeIntent({
          ctx,
          inputs: filteredInputs,
          blockId: block.id,
          userPrompt,
          model: filteredInputs.model,
          factMemories,
        })

        if (intentResult.decision === 'SKIP' && intentResult.skipResponse) {
          logger.info('Intent analyzer decided SKIP — returning generated response', {
            workflowId: ctx.workflowId,
            blockId: block.id,
            conversationId: filteredInputs.conversationId,
          })

          // Persist the skip response to memory so future conversations include it
          // Build output matching processStandardResponse format
          const skipOutput: Record<string, any> = {
            content: intentResult.skipResponse,
            model: 'gpt-4o',
            tokens: { input: 0, output: 0, total: 0 },
            toolCalls: { list: [], count: 0 },
            skippedWorkflow: true,
          }

          if (filteredInputs.memoryType) {
            const lastUserMsg: Message = { role: 'user', content: userPrompt }
            await memoryService.appendToMemory(
              ctx,
              filteredInputs,
              { role: 'assistant', content: intentResult.skipResponse },
              block.id,
              lastUserMsg
            )
          }

          return skipOutput
        }

        // RUN path: carry over search results so buildMessages doesn't re-fetch
        preSearchedResults = intentResult.searchResults
      } catch (intentError) {
        logger.warn('Intent analysis failed, continuing with normal workflow execution', {
          error: intentError,
        })
      }
    }

    // Format fact memories and add to system prompt if memory is enabled
    if (filteredInputs.memoryType && factMemories.length > 0) {
      // Format fact memories and add to system prompt
      if (factMemories && factMemories.length > 0) {
        const factMemoriesText = factMemories.map((msg) => `- ${msg.content}`).join('\n')

        const factMemoriesPrompt = `Consider these user preferences when you are giving user response -\n${factMemoriesText}`

        // Append to existing system prompt or create new one
        if (inputs.systemPrompt) {
          inputs.systemPrompt = `${inputs.systemPrompt}\n\n${factMemoriesPrompt}`
        } else {
          inputs.systemPrompt = factMemoriesPrompt
        }

        logger.debug('Added fact memories to system prompt', {
          factMemoryCount: factMemories.length,
          blockId: block.id,
          updatedSystemPrompt: inputs.systemPrompt,
        })
      }
    }

    const messages = await this.buildMessages(ctx, filteredInputs, block.id, preSearchedResults)

    // Extract last user message for memory persistence
    const lastUserMessage = messages?.filter((m) => m.role === 'user').slice(-1)[0] || null

    const providerRequest = this.buildProviderRequest({
      ctx,
      providerId,
      model,
      messages,
      inputs: filteredInputs,
      formattedTools,
      responseFormat,
      streaming: streamingConfig.shouldUseStreaming ?? false,
    })

    const result = await this.executeProviderRequest(ctx, providerRequest, block, responseFormat)

    if (this.isStreamingExecution(result)) {
      if (filteredInputs.memoryType) {
        return this.wrapStreamForMemoryPersistence(
          ctx,
          filteredInputs,
          result as StreamingExecution,
          block.id,
          lastUserMessage
        )
      }
      return result
    }

    if (filteredInputs.memoryType) {
      await this.persistResponseToMemory(
        ctx,
        filteredInputs,
        result as BlockOutput,
        block.id,
        lastUserMessage
      )
    }

    return result
  }

  private parseResponseFormat(responseFormat?: string | object): any {
    if (!responseFormat || responseFormat === '') return undefined

    if (typeof responseFormat === 'object' && responseFormat !== null) {
      const formatObj = responseFormat as any
      if (!formatObj.schema && !formatObj.name) {
        return {
          name: 'response_schema',
          schema: responseFormat,
          strict: true,
        }
      }
      return responseFormat
    }

    if (typeof responseFormat === 'string') {
      const trimmedValue = responseFormat.trim()

      if (trimmedValue.startsWith(REFERENCE.START) && trimmedValue.includes(REFERENCE.END)) {
        return undefined
      }

      try {
        const parsed = JSON.parse(trimmedValue)

        if (parsed && typeof parsed === 'object' && !parsed.schema && !parsed.name) {
          return {
            name: 'response_schema',
            schema: parsed,
            strict: true,
          }
        }
        return parsed
      } catch (error: any) {
        logger.warn('Failed to parse response format as JSON, using default behavior:', {
          error: error.message,
          value: trimmedValue,
        })
        return undefined
      }
    }

    logger.warn('Unexpected response format type, using default behavior:', {
      type: typeof responseFormat,
      value: responseFormat,
    })
    return undefined
  }

  private async validateToolPermissions(ctx: ExecutionContext, tools: ToolInput[]): Promise<void> {
    if (!Array.isArray(tools) || tools.length === 0) return

    const hasMcpTools = tools.some((t) => t.type === 'mcp')
    const hasCustomTools = tools.some((t) => t.type === 'custom-tool')

    if (hasMcpTools) {
      await validateMcpToolsAllowed(ctx.userId, ctx)
    }

    if (hasCustomTools) {
      await validateCustomToolsAllowed(ctx.userId, ctx)
    }
  }

  private async filterUnavailableMcpTools(
    ctx: ExecutionContext,
    tools: ToolInput[]
  ): Promise<ToolInput[]> {
    if (!Array.isArray(tools) || tools.length === 0) return tools

    const mcpTools = tools.filter((t) => t.type === 'mcp')
    if (mcpTools.length === 0) return tools

    const serverIds = [...new Set(mcpTools.map((t) => t.params?.serverId).filter(Boolean))]
    if (serverIds.length === 0) return tools

    const availableServerIds = new Set<string>()
    if (ctx.workspaceId && serverIds.length > 0) {
      try {
        const servers = await db
          .select({ id: mcpServers.id, connectionStatus: mcpServers.connectionStatus })
          .from(mcpServers)
          .where(
            and(
              eq(mcpServers.workspaceId, ctx.workspaceId),
              inArray(mcpServers.id, serverIds),
              isNull(mcpServers.deletedAt)
            )
          )

        for (const server of servers) {
          if (server.connectionStatus === 'connected') {
            availableServerIds.add(server.id)
          }
        }
      } catch (error) {
        logger.warn('Failed to check MCP server availability, including all tools:', error)
        for (const serverId of serverIds) {
          availableServerIds.add(serverId)
        }
      }
    }

    return tools.filter((tool) => {
      if (tool.type !== 'mcp') return true
      const serverId = tool.params?.serverId
      if (!serverId) return false
      return availableServerIds.has(serverId)
    })
  }

  private async formatTools(ctx: ExecutionContext, inputTools: ToolInput[]): Promise<any[]> {
    if (!Array.isArray(inputTools)) return []

    const filtered = inputTools.filter((tool) => {
      const usageControl = tool.usageControl || 'auto'
      return usageControl !== 'none'
    })

    const mcpTools: ToolInput[] = []
    const otherTools: ToolInput[] = []

    for (const tool of filtered) {
      if (tool.type === 'mcp') {
        mcpTools.push(tool)
      } else {
        otherTools.push(tool)
      }
    }

    const otherResults = await Promise.all(
      otherTools.map(async (tool) => {
        try {
          if (tool.type && tool.type !== 'custom-tool' && tool.type !== 'mcp') {
            await validateBlockType(ctx.userId, tool.type, ctx)
          }
          if (tool.type === 'custom-tool' && (tool.schema || tool.customToolId)) {
            return await this.createCustomTool(ctx, tool)
          }
          return this.transformBlockTool(ctx, tool)
        } catch (error) {
          logger.error(`[AgentHandler] Error creating tool:`, { tool, error })
          return null
        }
      })
    )

    const mcpResults = await this.processMcpToolsBatched(ctx, mcpTools)

    const allTools = [...otherResults, ...mcpResults]
    return allTools.filter(
      (tool): tool is NonNullable<typeof tool> => tool !== null && tool !== undefined
    )
  }

  private async createCustomTool(ctx: ExecutionContext, tool: ToolInput): Promise<any> {
    const userProvidedParams = tool.params || {}

    let schema = tool.schema
    let code = tool.code
    let title = tool.title

    if (tool.customToolId && !schema) {
      const resolved = await this.fetchCustomToolById(ctx, tool.customToolId)
      if (!resolved) {
        logger.error(`Custom tool not found: ${tool.customToolId}`)
        return null
      }
      schema = resolved.schema
      code = resolved.code
      title = resolved.title
    }

    if (!schema?.function) {
      logger.error('Custom tool missing schema:', { customToolId: tool.customToolId, title })
      return null
    }

    const { filterSchemaForLLM, mergeToolParameters } = await import('@/tools/params')

    const filteredSchema = filterSchemaForLLM(schema.function.parameters, userProvidedParams)

    const toolId = `${AGENT.CUSTOM_TOOL_PREFIX}${title}`
    const base: any = {
      id: toolId,
      name: schema.function.name,
      description: schema.function.description || '',
      params: userProvidedParams,
      parameters: {
        ...filteredSchema,
        type: schema.function.parameters.type,
      },
      usageControl: tool.usageControl || 'auto',
    }

    if (code) {
      base.executeFunction = async (callParams: Record<string, any>) => {
        const mergedParams = mergeToolParameters(userProvidedParams, callParams)

        const { blockData, blockNameMapping, blockOutputSchemas } = collectBlockData(ctx)

        const result = await executeTool(
          'function_execute',
          {
            code,
            ...mergedParams,
            timeout: tool.timeout ?? AGENT.DEFAULT_FUNCTION_TIMEOUT,
            envVars: ctx.environmentVariables || {},
            workflowVariables: ctx.workflowVariables || {},
            blockData,
            blockNameMapping,
            blockOutputSchemas,
            isCustomTool: true,
            _context: {
              workflowId: ctx.workflowId,
              workspaceId: ctx.workspaceId,
              isDeployedContext: ctx.isDeployedContext,
            },
          },
          false,
          ctx
        )

        if (!result.success) {
          throw new Error(result.error || 'Function execution failed')
        }
        return result.output
      }
    }

    return base
  }

  /**
   * Fetches a custom tool definition from the database by ID
   */
  private async fetchCustomToolById(
    ctx: ExecutionContext,
    customToolId: string
  ): Promise<{ schema: any; code: string; title: string } | null> {
    if (typeof window !== 'undefined') {
      try {
        const { getCustomTool } = await import('@/hooks/queries/custom-tools')
        const tool = getCustomTool(customToolId, ctx.workspaceId)
        if (tool) {
          return {
            schema: tool.schema,
            code: tool.code || '',
            title: tool.title,
          }
        }
        logger.warn(`Custom tool not found in cache: ${customToolId}`)
      } catch (error) {
        logger.error('Error accessing custom tools cache:', { error })
      }
    }

    try {
      const headers = await buildAuthHeaders()
      const params: Record<string, string> = {}

      if (ctx.workspaceId) {
        params.workspaceId = ctx.workspaceId
      }
      if (ctx.workflowId) {
        params.workflowId = ctx.workflowId
      }

      const url = buildAPIUrl('/api/tools/custom', params)
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        logger.error(`Failed to fetch custom tools: ${response.status}`)
        return null
      }

      const data = await response.json()
      if (!data.data || !Array.isArray(data.data)) {
        logger.error('Invalid custom tools API response')
        return null
      }

      const tool = data.data.find((t: any) => t.id === customToolId)
      if (!tool) {
        logger.warn(`Custom tool not found by ID: ${customToolId}`)
        return null
      }

      return {
        schema: tool.schema,
        code: tool.code || '',
        title: tool.title,
      }
    } catch (error) {
      logger.error('Error fetching custom tool:', { customToolId, error })
      return null
    }
  }

  /**
   * Process MCP tools using cached schemas from build time.
   * Note: Unavailable tools are already filtered by filterUnavailableMcpTools.
   */
  private async processMcpToolsBatched(
    ctx: ExecutionContext,
    mcpTools: ToolInput[]
  ): Promise<any[]> {
    if (mcpTools.length === 0) return []

    const results: any[] = []
    const toolsWithSchema: ToolInput[] = []
    const toolsNeedingDiscovery: ToolInput[] = []

    for (const tool of mcpTools) {
      const serverId = tool.params?.serverId
      const toolName = tool.params?.toolName

      if (!serverId || !toolName) {
        logger.error('MCP tool missing serverId or toolName:', tool)
        continue
      }

      if (tool.schema) {
        toolsWithSchema.push(tool)
      } else {
        logger.warn(`MCP tool ${toolName} missing cached schema, will need discovery`)
        toolsNeedingDiscovery.push(tool)
      }
    }

    for (const tool of toolsWithSchema) {
      try {
        const created = await this.createMcpToolFromCachedSchema(ctx, tool)
        if (created) results.push(created)
      } catch (error) {
        logger.error(`Error creating MCP tool from cached schema:`, { tool, error })
      }
    }

    if (toolsNeedingDiscovery.length > 0) {
      const discoveredResults = await this.processMcpToolsWithDiscovery(ctx, toolsNeedingDiscovery)
      results.push(...discoveredResults)
    }

    return results
  }

  /**
   * Create MCP tool from cached schema. No MCP server connection required.
   */
  private async createMcpToolFromCachedSchema(
    ctx: ExecutionContext,
    tool: ToolInput
  ): Promise<any> {
    const { serverId, toolName, serverName, ...userProvidedParams } = tool.params || {}

    const { filterSchemaForLLM } = await import('@/tools/params')
    const filteredSchema = filterSchemaForLLM(
      tool.schema || { type: 'object', properties: {} },
      userProvidedParams
    )

    const toolId = createMcpToolId(serverId, toolName)

    return {
      id: toolId,
      name: toolName,
      description:
        tool.schema?.description || `MCP tool ${toolName} from ${serverName || serverId}`,
      parameters: filteredSchema,
      params: userProvidedParams,
      usageControl: tool.usageControl || 'auto',
      executeFunction: async (callParams: Record<string, any>) => {
        const headers = await buildAuthHeaders()
        const execUrl = buildAPIUrl('/api/mcp/tools/execute')

        const execResponse = await fetch(execUrl.toString(), {
          method: 'POST',
          headers,
          body: stringifyJSON({
            serverId,
            toolName,
            arguments: callParams,
            workspaceId: ctx.workspaceId,
            workflowId: ctx.workflowId,
            toolSchema: tool.schema,
          }),
        })

        if (!execResponse.ok) {
          throw new Error(
            `MCP tool execution failed: ${execResponse.status} ${execResponse.statusText}`
          )
        }

        const result = await execResponse.json()
        if (!result.success) {
          throw new Error(result.error || 'MCP tool execution failed')
        }

        return {
          success: true,
          output: result.data.output || {},
          metadata: {
            source: 'mcp',
            serverId,
            serverName: serverName || serverId,
            toolName,
          },
        }
      },
    }
  }

  /**
   * Fallback for legacy tools without cached schemas. Groups by server to minimize connections.
   */
  private async processMcpToolsWithDiscovery(
    ctx: ExecutionContext,
    mcpTools: ToolInput[]
  ): Promise<any[]> {
    const toolsByServer = new Map<string, ToolInput[]>()
    for (const tool of mcpTools) {
      const serverId = tool.params?.serverId
      if (!toolsByServer.has(serverId)) {
        toolsByServer.set(serverId, [])
      }
      toolsByServer.get(serverId)!.push(tool)
    }

    const serverDiscoveryResults = await Promise.all(
      Array.from(toolsByServer.entries()).map(async ([serverId, tools]) => {
        try {
          const discoveredTools = await this.discoverMcpToolsForServer(ctx, serverId)
          return { serverId, tools, discoveredTools, error: null as Error | null }
        } catch (error) {
          logger.error(`Failed to discover tools from server ${serverId}:`)
          return { serverId, tools, discoveredTools: [] as any[], error: error as Error }
        }
      })
    )

    const results: any[] = []
    for (const { serverId, tools, discoveredTools, error } of serverDiscoveryResults) {
      if (error) continue

      for (const tool of tools) {
        try {
          const toolName = tool.params?.toolName
          const mcpTool = discoveredTools.find((t: any) => t.name === toolName)

          if (!mcpTool) {
            logger.error(`MCP tool ${toolName} not found on server ${serverId}`)
            continue
          }

          const created = await this.createMcpToolFromDiscoveredData(ctx, tool, mcpTool, serverId)
          if (created) results.push(created)
        } catch (error) {
          logger.error(`Error creating MCP tool:`, { tool, error })
        }
      }
    }

    return results
  }

  /**
   * Discover tools from a single MCP server with retry logic.
   */
  private async discoverMcpToolsForServer(ctx: ExecutionContext, serverId: string): Promise<any[]> {
    if (!ctx.workspaceId) {
      throw new Error('workspaceId is required for MCP tool discovery')
    }
    if (!ctx.workflowId) {
      throw new Error('workflowId is required for internal JWT authentication')
    }

    const headers = await buildAuthHeaders()
    const url = buildAPIUrl('/api/mcp/tools/discover', {
      serverId,
      workspaceId: ctx.workspaceId,
      workflowId: ctx.workflowId,
    })

    const maxAttempts = 2
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), { method: 'GET', headers })

        if (!response.ok) {
          const errorText = await response.text()
          if (this.isRetryableError(errorText) && attempt < maxAttempts - 1) {
            logger.warn(
              `[AgentHandler] Session error discovering tools from ${serverId}, retrying (attempt ${attempt + 1})`
            )
            await new Promise((r) => setTimeout(r, 100))
            continue
          }
          throw new Error(`Failed to discover tools: ${response.status} ${errorText}`)
        }

        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || 'Failed to discover MCP tools')
        }

        return data.data.tools
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (this.isRetryableError(errorMsg) && attempt < maxAttempts - 1) {
          logger.warn(
            `[AgentHandler] Retryable error discovering tools from ${serverId} (attempt ${attempt + 1}):`,
            error
          )
          await new Promise((r) => setTimeout(r, 100))
          continue
        }
        throw error
      }
    }

    throw new Error(
      `Failed to discover tools from server ${serverId} after ${maxAttempts} attempts`
    )
  }

  private isRetryableError(errorMsg: string): boolean {
    const lowerMsg = errorMsg.toLowerCase()
    return lowerMsg.includes('session') || lowerMsg.includes('400') || lowerMsg.includes('404')
  }

  private async createMcpToolFromDiscoveredData(
    ctx: ExecutionContext,
    tool: ToolInput,
    mcpTool: any,
    serverId: string
  ): Promise<any> {
    const { toolName, ...userProvidedParams } = tool.params || {}

    const { filterSchemaForLLM } = await import('@/tools/params')
    const filteredSchema = filterSchemaForLLM(
      mcpTool.inputSchema || { type: 'object', properties: {} },
      userProvidedParams
    )

    const toolId = createMcpToolId(serverId, toolName)

    return {
      id: toolId,
      name: toolName,
      description: mcpTool.description || `MCP tool ${toolName} from ${mcpTool.serverName}`,
      parameters: filteredSchema,
      params: userProvidedParams,
      usageControl: tool.usageControl || 'auto',
      executeFunction: async (callParams: Record<string, any>) => {
        const headers = await buildAuthHeaders()
        const execUrl = buildAPIUrl('/api/mcp/tools/execute')

        const execResponse = await fetch(execUrl.toString(), {
          method: 'POST',
          headers,
          body: stringifyJSON({
            serverId,
            toolName,
            arguments: callParams,
            workspaceId: ctx.workspaceId,
            workflowId: ctx.workflowId,
            toolSchema: mcpTool.inputSchema,
          }),
        })

        if (!execResponse.ok) {
          throw new Error(
            `MCP tool execution failed: ${execResponse.status} ${execResponse.statusText}`
          )
        }

        const result = await execResponse.json()
        if (!result.success) {
          throw new Error(result.error || 'MCP tool execution failed')
        }

        return {
          success: true,
          output: result.data.output || {},
          metadata: {
            source: 'mcp',
            serverId,
            serverName: mcpTool.serverName,
            toolName,
          },
        }
      },
    }
  }

  private async transformBlockTool(ctx: ExecutionContext, tool: ToolInput) {
    const transformedTool = await transformBlockTool(tool, {
      selectedOperation: tool.operation,
      getAllBlocks,
      getToolAsync: (toolId: string) => getToolAsync(toolId, ctx.workflowId),
      getTool,
    })

    if (transformedTool) {
      transformedTool.usageControl = tool.usageControl || 'auto'
    }
    return transformedTool
  }

  private getStreamingConfig(ctx: ExecutionContext, block: SerializedBlock): StreamingConfig {
    const isBlockSelectedForOutput =
      ctx.selectedOutputs?.some((outputId) => {
        if (outputId === block.id) return true
        const firstUnderscoreIndex = outputId.indexOf('_')
        return (
          firstUnderscoreIndex !== -1 && outputId.substring(0, firstUnderscoreIndex) === block.id
        )
      }) ?? false

    const hasOutgoingConnections = ctx.edges?.some((edge) => edge.source === block.id) ?? false
    const shouldUseStreaming = Boolean(ctx.stream) && isBlockSelectedForOutput

    return { shouldUseStreaming, isBlockSelectedForOutput, hasOutgoingConnections }
  }

  private async buildMessages(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    blockId: string,
    preSearchedResults?: Message[]
  ): Promise<Message[] | undefined> {
    const messages: Message[] = []
    const memoryEnabled = !!inputs.memoryType

    // 1. Extract and validate messages from messages-input subblock
    const inputMessages = this.extractValidMessages(inputs.messages)
    const systemMessages = inputMessages.filter((m) => m.role === 'system')
    const conversationMessages = inputMessages.filter((m) => m.role !== 'system')

    // 2. Fetch conversation memory history (using semantic search or pre-fetched results)
    if (memoryEnabled) {
      // Extract user prompt for search query
      let userPrompt: string | undefined
      if (inputs.userPrompt) {
        userPrompt =
          typeof inputs.userPrompt === 'string'
            ? inputs.userPrompt
            : JSON.stringify(inputs.userPrompt)
      } else if (inputs.messages && Array.isArray(inputs.messages)) {
        const userMsg = inputs.messages.find((m) => m.role === 'user')
        if (userMsg) {
          userPrompt = userMsg.content
        }
      }

      // Use pre-fetched results from intent analyzer or fetch new ones with combined, deduplicated, and sorted logic
      const searchResults: Message[] = preSearchedResults
        ? preSearchedResults
        : await combineAndSortSearchResults(ctx, inputs, blockId, userPrompt, inputs.model)

      // Add search results to user prompt incrementally with token checking
      if (searchResults && searchResults.length > 0 && userPrompt) {
        const { getMemoryTokenLimit } = await import('@/executor/handlers/agent/memory-utils')
        const { getAccurateTokenCount } = await import('@/lib/tokenization/estimators')

        const tokenLimit = getMemoryTokenLimit(inputs.model)
        const baseUserPromptTokens = getAccurateTokenCount(userPrompt, inputs.model)
        let currentTokenCount = baseUserPromptTokens
        let memoryContext = ''

        for (const memory of searchResults) {
          const memoryText = `\nPrevious conversation:\n${memory.role === 'user' ? 'User' : 'Assistant'}: ${memory.content}`
          const memoryTokens = getAccurateTokenCount(memoryText, inputs.model)

          if (currentTokenCount + memoryTokens <= tokenLimit) {
            memoryContext += memoryText
            currentTokenCount += memoryTokens
          } else {
            logger.debug('Stopped adding memories due to token limit', {
              blockId,
              tokenLimit,
              currentTokens: currentTokenCount,
              memoryTokens,
              memoriesAdded: memoryContext.split('Previous conversation:').length - 1,
              totalMemories: searchResults.length,
            })
            break
          }
        }

        // Append memory context to user prompt
        if (memoryContext) {
          if (inputs.userPrompt) {
            inputs.userPrompt =
              typeof inputs.userPrompt === 'string'
                ? `${inputs.userPrompt}${memoryContext}`
                : `${JSON.stringify(inputs.userPrompt)}${memoryContext}`
          } else if (conversationMessages.length > 0) {
            const userMsg = conversationMessages.find((m) => m.role === 'user')
            if (userMsg) {
              userMsg.content += memoryContext
            }
          } else if (inputs.messages && Array.isArray(inputs.messages)) {
            const userMsgIndex = inputs.messages.findIndex((m) => m.role === 'user')
            if (userMsgIndex !== -1) {
              inputs.messages[userMsgIndex].content += memoryContext
            }
          }

          logger.debug('Added search memories to user prompt with token checking', {
            blockId,
            tokenLimit,
            finalTokenCount: currentTokenCount,
            memoriesAdded: memoryContext.split('Previous conversation:').length - 1,
            totalMemories: searchResults.length,
          })
        }
      } else if (searchResults && searchResults.length > 0) {
        // If no user prompt exists, add to messages array as fallback
        messages.push(...searchResults)
      }
    }

    // 3. Process legacy memories (backward compatibility - from Memory block)
    // These may include system messages which are preserved in their position
    if (inputs.memories) {
      messages.push(...this.processMemories(inputs.memories))
    }

    // 4. Add conversation messages from inputs.messages
    // When memory is enabled, these may have been modified with memory context above
    // We need to add them to the messages array so they're sent to the LLM
    if (conversationMessages.length > 0) {
      messages.push(...conversationMessages)
      logger.debug('Added conversation messages to messages array', {
        blockId,
        conversationMessageCount: conversationMessages.length,
        totalMessages: messages.length,
        memoryEnabled,
      })
    }

    // 5. Handle legacy systemPrompt (backward compatibility)
    // Only add if no system message exists from any source
    if (inputs.systemPrompt) {
      const hasSystem = systemMessages.length > 0 || messages.some((m) => m.role === 'system')
      if (!hasSystem) {
        this.addSystemPrompt(messages, inputs.systemPrompt)
      }
    }

    // 6. Handle legacy userPrompt - this is NEW input each run
    if (inputs.userPrompt) {
      this.addUserPrompt(messages, inputs.userPrompt)

      if (memoryEnabled) {
        const userMessages = messages.filter((m) => m.role === 'user')
        const lastUserMessage = userMessages[userMessages.length - 1]
        if (lastUserMessage) {
          await memoryService.appendToMemory(ctx, inputs, lastUserMessage, blockId, null)
        }
      }
    }

    // 6b. Store user messages from inputs.messages to memory when memory is enabled
    // This ensures user input is stored even when using messages array instead of userPrompt
    if (memoryEnabled && conversationMessages.length > 0 && !inputs.userPrompt) {
      const userMessages = conversationMessages.filter((m) => m.role === 'user')
      const lastUserMessage = userMessages[userMessages.length - 1]
      if (lastUserMessage) {
        await memoryService.appendToMemory(ctx, inputs, lastUserMessage, blockId, null)
      }
    }

    // 7. Prefix system messages from inputs.messages at the start (runtime only)
    // These are the agent's configured system prompts
    if (systemMessages.length > 0) {
      messages.unshift(...systemMessages)
    }

    // Final validation: ensure we have at least one message
    if (messages.length === 0) {
      logger.error('No messages built for agent execution', {
        blockId,
        hasUserPrompt: !!inputs.userPrompt,
        hasMessages: !!inputs.messages,
        messagesLength: inputs.messages?.length || 0,
        memoryEnabled,
        conversationMessagesLength: conversationMessages.length,
      })
      throw new Error(
        'No messages to send to LLM. Please provide either userPrompt or messages with at least one user message.'
      )
    }

    logger.debug('Final messages array built', {
      blockId,
      totalMessages: messages.length,
      systemMessages: messages.filter((m) => m.role === 'system').length,
      userMessages: messages.filter((m) => m.role === 'user').length,
      assistantMessages: messages.filter((m) => m.role === 'assistant').length,
    })

    return messages.length > 0 ? messages : undefined
  }

  private extractValidMessages(messages?: Message[]): Message[] {
    if (!messages || !Array.isArray(messages)) return []

    return messages.filter(
      (msg): msg is Message =>
        msg &&
        typeof msg === 'object' &&
        'role' in msg &&
        'content' in msg &&
        ['system', 'user', 'assistant'].includes(msg.role)
    )
  }

  private processMemories(memories: any): Message[] {
    if (!memories) return []

    let memoryArray: any[] = []
    if (memories?.memories && Array.isArray(memories.memories)) {
      memoryArray = memories.memories
    } else if (Array.isArray(memories)) {
      memoryArray = memories
    }

    const messages: Message[] = []
    memoryArray.forEach((memory: any) => {
      if (memory.data && Array.isArray(memory.data)) {
        memory.data.forEach((msg: any) => {
          if (msg.role && msg.content && ['system', 'user', 'assistant'].includes(msg.role)) {
            messages.push({
              role: msg.role as 'system' | 'user' | 'assistant',
              content: msg.content,
            })
          }
        })
      } else if (
        memory.role &&
        memory.content &&
        ['system', 'user', 'assistant'].includes(memory.role)
      ) {
        messages.push({
          role: memory.role as 'system' | 'user' | 'assistant',
          content: memory.content,
        })
      }
    })

    return messages
  }

  /**
   * Ensures system message is at position 0 (industry standard)
   * Preserves existing system message if already at position 0, otherwise adds/moves it
   */
  private addSystemPrompt(messages: Message[], systemPrompt: any) {
    let content: string

    if (typeof systemPrompt === 'string') {
      content = systemPrompt
    } else {
      try {
        content = JSON.stringify(systemPrompt, null, 2)
      } catch (error) {
        content = String(systemPrompt)
      }
    }

    // Find first system message
    const firstSystemIndex = messages.findIndex((msg) => msg.role === 'system')

    if (firstSystemIndex === -1) {
      // No system message exists - add at position 0
      messages.unshift({ role: 'system', content })
    } else if (firstSystemIndex === 0) {
      // System message already at position 0 - replace it
      // Explicit systemPrompt parameter takes precedence over memory/messages
      messages[0] = { role: 'system', content }
    } else {
      // System message exists but not at position 0 - move it to position 0
      // and update with new content
      messages.splice(firstSystemIndex, 1)
      messages.unshift({ role: 'system', content })
    }

    // Remove any additional system messages (keep only the first one)
    for (let i = messages.length - 1; i >= 1; i--) {
      if (messages[i].role === 'system') {
        messages.splice(i, 1)
        logger.warn('Removed duplicate system message from conversation history', {
          position: i,
        })
      }
    }
  }

  private addUserPrompt(messages: Message[], userPrompt: any) {
    let content: string
    if (typeof userPrompt === 'object' && userPrompt.input) {
      content = String(userPrompt.input)
    } else if (typeof userPrompt === 'object') {
      content = JSON.stringify(userPrompt)
    } else {
      content = String(userPrompt)
    }

    messages.push({ role: 'user', content })
  }

  private buildProviderRequest(config: {
    ctx: ExecutionContext
    providerId: string
    model: string
    messages: Message[] | undefined
    inputs: AgentInputs
    formattedTools: any[]
    responseFormat: any
    streaming: boolean
  }) {
    const { ctx, providerId, model, messages, inputs, formattedTools, responseFormat, streaming } =
      config

    const validMessages = this.validateMessages(messages)

    // Normalize maxTokens: treat empty string/null as "not set" so providers
    // can apply their own defaults instead of sending max_tokens: '' or 0.
    const rawMaxTokens = inputs.maxTokens as unknown
    const normalizedMaxTokens =
      rawMaxTokens === undefined || rawMaxTokens === null || rawMaxTokens === ''
        ? undefined
        : rawMaxTokens

    const { blockData, blockNameMapping } = collectBlockData(ctx)

    return {
      provider: providerId,
      model,
      systemPrompt: validMessages ? undefined : inputs.systemPrompt,
      context: validMessages ? undefined : stringifyJSON(messages),
      tools: formattedTools,
      temperature: inputs.temperature,
      maxTokens: normalizedMaxTokens,
      apiKey: inputs.apiKey,
      azureEndpoint: inputs.azureEndpoint,
      azureApiVersion: inputs.azureApiVersion,
      vertexProject: inputs.vertexProject,
      vertexLocation: inputs.vertexLocation,
      vertexCredential: inputs.vertexCredential,
      bedrockAccessKeyId: inputs.bedrockAccessKeyId,
      bedrockSecretKey: inputs.bedrockSecretKey,
      bedrockRegion: inputs.bedrockRegion,
      responseFormat,
      workflowId: ctx.workflowId,
      workspaceId: ctx.workspaceId,
      stream: streaming,
      messages,
      environmentVariables: ctx.environmentVariables || {},
      workflowVariables: ctx.workflowVariables || {},
      blockData,
      blockNameMapping,
      // Normalize advanced model controls so we never send empty strings
      // Some providers (e.g. OpenAI GPT-5.x) 400 on reasoning_effort: ''
      reasoningEffort: inputs.reasoningEffort || undefined,
      verbosity: inputs.verbosity || undefined,
    }
  }

  private validateMessages(messages: Message[] | undefined): boolean {
    return (
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every(
        (msg: any) =>
          typeof msg === 'object' &&
          msg !== null &&
          'role' in msg &&
          typeof msg.role === 'string' &&
          ('content' in msg ||
            (msg.role === 'assistant' && ('function_call' in msg || 'tool_calls' in msg)))
      )
    )
  }

  private async executeProviderRequest(
    ctx: ExecutionContext,
    providerRequest: any,
    block: SerializedBlock,
    responseFormat: any
  ): Promise<BlockOutput | StreamingExecution> {
    const providerId = providerRequest.provider
    const model = providerRequest.model
    const providerStartTime = Date.now()

    try {
      let finalApiKey: string | undefined = providerRequest.apiKey

      if (providerId === 'vertex' && providerRequest.vertexCredential) {
        finalApiKey = await this.resolveVertexCredential(
          providerRequest.vertexCredential,
          ctx.workflowId
        )
      }

      const { blockData, blockNameMapping } = collectBlockData(ctx)

      const response = await executeProviderRequest(providerId, {
        model,
        systemPrompt: 'systemPrompt' in providerRequest ? providerRequest.systemPrompt : undefined,
        context: 'context' in providerRequest ? providerRequest.context : undefined,
        tools: providerRequest.tools,
        temperature: providerRequest.temperature,
        maxTokens: providerRequest.maxTokens,
        apiKey: finalApiKey,
        azureEndpoint: providerRequest.azureEndpoint,
        azureApiVersion: providerRequest.azureApiVersion,
        vertexProject: providerRequest.vertexProject,
        vertexLocation: providerRequest.vertexLocation,
        bedrockAccessKeyId: providerRequest.bedrockAccessKeyId,
        bedrockSecretKey: providerRequest.bedrockSecretKey,
        bedrockRegion: providerRequest.bedrockRegion,
        responseFormat: providerRequest.responseFormat,
        workflowId: providerRequest.workflowId,
        workspaceId: ctx.workspaceId,
        stream: providerRequest.stream,
        messages: 'messages' in providerRequest ? providerRequest.messages : undefined,
        environmentVariables: ctx.environmentVariables || {},
        workflowVariables: ctx.workflowVariables || {},
        blockData,
        blockNameMapping,
        isDeployedContext: ctx.isDeployedContext,
        reasoningEffort: providerRequest.reasoningEffort,
        verbosity: providerRequest.verbosity,
      })

      return this.processProviderResponse(response, block, responseFormat)
    } catch (error) {
      this.handleExecutionError(error, providerStartTime, providerId, model, ctx, block)
      throw error
    }
  }

  /**
   * Resolves a Vertex AI OAuth credential to an access token
   */
  private async resolveVertexCredential(credentialId: string, workflowId: string): Promise<string> {
    const requestId = `vertex-${Date.now()}`

    logger.info(`[${requestId}] Resolving Vertex AI credential: ${credentialId}`)

    // Get the credential - we need to find the owner
    // Since we're in a workflow context, we can query the credential directly
    const credential = await db.query.account.findFirst({
      where: eq(account.id, credentialId),
    })

    if (!credential) {
      throw new Error(`Vertex AI credential not found: ${credentialId}`)
    }

    // Refresh the token if needed
    const { accessToken } = await refreshTokenIfNeeded(requestId, credential, credentialId)

    if (!accessToken) {
      throw new Error('Failed to get Vertex AI access token')
    }

    logger.info(`[${requestId}] Successfully resolved Vertex AI credential`)
    return accessToken
  }

  private handleExecutionError(
    error: any,
    startTime: number,
    provider: string,
    model: string,
    ctx: ExecutionContext,
    block: SerializedBlock
  ) {
    const executionTime = Date.now() - startTime

    logger.error('Error executing provider request:', {
      error,
      executionTime,
      provider,
      model,
      workflowId: ctx.workflowId,
      blockId: block.id,
    })

    if (!(error instanceof Error)) return

    logger.error('Provider request error details', {
      workflowId: ctx.workflowId,
      blockId: block.id,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
    })

    if (error.name === 'AbortError') {
      throw new Error('Provider request timed out - the API took too long to respond')
    }
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(
        'Network error - unable to connect to provider API. Please check your internet connection.'
      )
    }
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      throw new Error('Unable to connect to server - DNS or connection issue')
    }
  }

  private wrapStreamForMemoryPersistence(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    streamingExec: StreamingExecution,
    blockId: string,
    lastUserMessage: Message | null
  ): StreamingExecution {
    return {
      stream: memoryService.wrapStreamForPersistence(
        streamingExec.stream,
        ctx,
        inputs,
        blockId,
        lastUserMessage
      ),
      execution: streamingExec.execution,
    }
  }

  private async persistResponseToMemory(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    result: BlockOutput,
    blockId: string,
    lastUserMessage: Message | null
  ): Promise<void> {
    const content = (result as any)?.content
    if (!content || typeof content !== 'string') {
      return
    }

    try {
      await memoryService.appendToMemory(
        ctx,
        inputs,
        { role: 'assistant', content },
        blockId,
        lastUserMessage
      )
      logger.debug('Persisted assistant response to memory', {
        workflowId: ctx.workflowId,
        conversationId: inputs.conversationId,
        blockId,
      })
    } catch (error) {
      logger.error('Failed to persist response to memory:', error)
    }
  }

  private processProviderResponse(
    response: any,
    block: SerializedBlock,
    responseFormat: any
  ): BlockOutput | StreamingExecution {
    if (this.isStreamingExecution(response)) {
      return this.processStreamingExecution(response, block)
    }

    if (response instanceof ReadableStream) {
      return this.createMinimalStreamingExecution(response)
    }

    return this.processRegularResponse(response, responseFormat)
  }

  private isStreamingExecution(response: any): boolean {
    return (
      response && typeof response === 'object' && 'stream' in response && 'execution' in response
    )
  }

  private processStreamingExecution(
    response: StreamingExecution,
    block: SerializedBlock
  ): StreamingExecution {
    const streamingExec = response as StreamingExecution

    if (streamingExec.execution.output) {
      const execution = streamingExec.execution as any
      if (block.metadata?.name) execution.blockName = block.metadata.name
      if (block.metadata?.id) execution.blockType = block.metadata.id
      execution.blockId = block.id
      execution.isStreaming = true
    }

    return streamingExec
  }

  private createMinimalStreamingExecution(stream: ReadableStream): StreamingExecution {
    return {
      stream,
      execution: {
        success: true,
        output: {},
        logs: [],
        metadata: {
          duration: DEFAULTS.EXECUTION_TIME,
          startTime: new Date().toISOString(),
        },
      },
    }
  }

  private processRegularResponse(result: any, responseFormat: any): BlockOutput {
    if (responseFormat) {
      return this.processStructuredResponse(result, responseFormat)
    }

    return this.processStandardResponse(result)
  }

  private processStructuredResponse(result: any, responseFormat: any): BlockOutput {
    const content = result.content

    try {
      const extractedJson = JSON.parse(content.trim())

      // Get the schema from responseFormat
      const schema = responseFormat?.schema || responseFormat
      const isStrict = responseFormat?.strict !== false

      // Validate and filter the response according to the schema
      const validatedJson = this.validateAndFilterStructuredResponse(
        extractedJson,
        schema,
        isStrict
      )

      return {
        ...validatedJson,
        ...validatedJson,
        ...this.createResponseMetadata(result),
      }
    } catch (error) {
      logger.error('LLM did not adhere to structured response format:', {
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        responseFormat: responseFormat,
        error: error instanceof Error ? error.message : String(error),
      })

      const standardResponse = this.processStandardResponse(result)
      return Object.assign(standardResponse, {
        _responseFormatWarning:
          'LLM did not adhere to the specified structured response format. Expected valid JSON but received malformed content. Falling back to standard format.',
      })
    }
  }

  /**
   * Validates and filters a structured response according to the schema.
   * When strict mode is enabled (additionalProperties: false), removes any properties
   * that are not defined in the schema.
   */
  private validateAndFilterStructuredResponse(data: any, schema: any, isStrict: boolean): any {
    if (!schema || typeof schema !== 'object' || schema === null) {
      return data
    }

    // If schema has additionalProperties: false, we need to filter strictly
    const additionalProperties = schema.additionalProperties
    const shouldFilterStrictly = isStrict && additionalProperties === false

    // If it's an object schema with properties
    if (
      schema.type === 'object' &&
      schema.properties &&
      typeof data === 'object' &&
      data !== null &&
      !Array.isArray(data)
    ) {
      const filtered: Record<string, any> = {}
      const allowedProperties = new Set(Object.keys(schema.properties))

      // Only include properties that are defined in the schema
      for (const [key, value] of Object.entries(data)) {
        if (allowedProperties.has(key)) {
          const propertySchema = schema.properties[key]
          // Recursively validate nested objects
          if (propertySchema && typeof propertySchema === 'object' && propertySchema !== null) {
            filtered[key] = this.validateAndFilterStructuredResponse(
              value,
              propertySchema,
              isStrict
            )
          } else {
            filtered[key] = value
          }
        } else if (shouldFilterStrictly) {
          // Log warning when filtering out properties in strict mode
          logger.warn('Filtering out property not in schema', {
            property: key,
            value: typeof value === 'string' ? value.substring(0, 50) : value,
          })
        }
      }

      // Validate required properties
      if (schema.required && Array.isArray(schema.required)) {
        for (const requiredProp of schema.required) {
          if (!(requiredProp in filtered)) {
            logger.warn('Missing required property in structured response', {
              property: requiredProp,
              availableProperties: Object.keys(filtered),
            })
          }
        }
      }

      return filtered
    }

    // If it's an array schema
    if (schema.type === 'array' && schema.items && Array.isArray(data)) {
      return data.map((item) =>
        this.validateAndFilterStructuredResponse(item, schema.items, isStrict)
      )
    }

    // For other types or if filtering is not needed, return as-is
    return data
  }

  private processStandardResponse(result: any): BlockOutput {
    return {
      content: result.content,
      model: result.model,
      ...this.createResponseMetadata(result),
    }
  }

  private createResponseMetadata(result: {
    tokens?: { input?: number; output?: number; total?: number }
    toolCalls?: Array<any>
    timing?: any
    cost?: any
  }) {
    return {
      tokens: result.tokens || {
        input: DEFAULTS.TOKENS.PROMPT,
        output: DEFAULTS.TOKENS.COMPLETION,
        total: DEFAULTS.TOKENS.TOTAL,
      },
      toolCalls: {
        list: result.toolCalls?.map(this.formatToolCall.bind(this)) || [],
        count: result.toolCalls?.length || DEFAULTS.EXECUTION_TIME,
      },
      providerTiming: result.timing,
      cost: result.cost,
    }
  }

  private formatToolCall(tc: any) {
    const toolName = stripCustomToolPrefix(tc.name)

    return {
      ...tc,
      name: toolName,
      startTime: tc.startTime,
      endTime: tc.endTime,
      duration: tc.duration,
      arguments: tc.arguments || tc.input || {},
      result: tc.result || tc.output,
    }
  }
}
