import { db } from '@sim/db'
import { mcpServers } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createMcpToolId } from '@/lib/mcp/utils'
import { getCustomToolById } from '@/lib/workflows/custom-tools/operations'
import { getAllBlocks } from '@/blocks'
import type { BlockOutput } from '@/blocks/types'
import {
  validateBlockType,
  validateCustomToolsAllowed,
  validateMcpToolsAllowed,
  validateModelProvider,
  validateSkillsAllowed,
} from '@/ee/access-control/utils/permission-check'
import { AGENT, BlockType, DEFAULTS, stripCustomToolPrefix } from '@/executor/constants'
import { memoryService } from '@/executor/handlers/agent/memory'
import {
  buildLoadSkillTool,
  buildSkillsSystemPromptSection,
  resolveSkillMetadata,
} from '@/executor/handlers/agent/skills-resolver'
import type {
  AgentInputs,
  Message,
  StreamingConfig,
  ToolInput,
} from '@/executor/handlers/agent/types'
import { parseResponseFormat } from '@/executor/handlers/shared/response-format'
import type { BlockHandler, ExecutionContext, StreamingExecution } from '@/executor/types'
import { collectBlockData } from '@/executor/utils/block-data'
import { buildAPIUrl, buildAuthHeaders } from '@/executor/utils/http'
import { stringifyJSON } from '@/executor/utils/json'
import { resolveVertexCredential } from '@/executor/utils/vertex-credential'
import { executeProviderRequest } from '@/providers'
import { getProviderFromModel, transformBlockTool } from '@/providers/utils'
import type { SerializedBlock } from '@/serializer/types'
import { filterSchemaForLLM } from '@/tools/params'
import { getTool } from '@/tools/utils'
import { getToolAsync } from '@/tools/utils.server'

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

  /**
   * Fetches the agent system prompt from the prompt_config table.
   * Returns null if unavailable (caller should handle fallback).
   */
  private async fetchAgentSystemPrompt(): Promise<string | null> {
    try {
      const { promptConfig } = await import('@sim/db/schema')
      const { PROMPT_CONFIG_KEYS } = await import('@sim/db/constants')

      const rows = await db
        .select({ prompt: promptConfig.prompt })
        .from(promptConfig)
        .where(eq(promptConfig.key, PROMPT_CONFIG_KEYS.AGENT_SYSTEM_PROMPT))
        .limit(1)

      if (rows.length > 0 && rows[0].prompt) {
        return rows[0].prompt
      }
    } catch (error) {
      logger.warn('Failed to fetch agent system prompt from prompt_config table', { error })
    }

    return null
  }

  async execute(
    ctx: ExecutionContext,
    block: SerializedBlock,
    inputs: AgentInputs
  ): Promise<BlockOutput | StreamingExecution> {
    const filteredTools = await this.filterUnavailableMcpTools(ctx, inputs.tools || [])

    const memoryType = inputs.memoryType

    // Automatically get conversationId from Start block if not provided
    const conversationId = inputs.conversationId || getConversationIdFromStartBlock(ctx)

    const filteredInputs = {
      ...inputs,
      tools: filteredTools,
      memoryType,
      conversationId: conversationId,
    }

    await this.validateToolPermissions(ctx, filteredInputs.tools || [])

    const responseFormat = parseResponseFormat(filteredInputs.responseFormat)
    const model = filteredInputs.model || AGENT.DEFAULT_MODEL

    await validateModelProvider(ctx.userId, ctx.workspaceId, model, ctx)

    const providerId = getProviderFromModel(model)
    const formattedTools = await this.formatTools(
      ctx,
      filteredInputs.tools || [],
      block.canonicalModes
    )

    const skillInputs = filteredInputs.skills ?? []
    let skillMetadata: Array<{ name: string; description: string }> = []
    if (skillInputs.length > 0 && ctx.workspaceId) {
      await validateSkillsAllowed(ctx.userId, ctx.workspaceId, ctx)
      skillMetadata = await resolveSkillMetadata(skillInputs, ctx.workspaceId)
      if (skillMetadata.length > 0) {
        const skillNames = skillMetadata.map((s) => s.name)
        formattedTools.push(buildLoadSkillTool(skillNames))
      }
    }

    const streamingConfig = this.getStreamingConfig(ctx, block)

    // Log initial systemPrompt and userPrompt
    logger.debug('Agent block execution started')

    // Extract user prompt once for reuse across memory, intent analysis, etc.
    // Store original userPrompt for memory API (without conversation history)
    let userPrompt: string | undefined
    let originalUserPrompt: string | undefined
    if (inputs.userPrompt) {
      userPrompt =
        typeof inputs.userPrompt === 'string'
          ? inputs.userPrompt
          : JSON.stringify(inputs.userPrompt)
      originalUserPrompt = userPrompt
    } else if (inputs.messages && Array.isArray(inputs.messages)) {
      const userMsg = inputs.messages.find((m) => m.role === 'user')
      if (userMsg) {
        userPrompt = userMsg.content
        originalUserPrompt = userMsg.content
      }
    }

    const messages = await this.buildMessages(ctx, filteredInputs, block.id, skillMetadata)

    // Extract last user message for memory persistence - use original userPrompt (without conversation history)
    // The messages array may contain conversation history, so we use the original userPrompt instead
    const lastUserMessage: Message | null = originalUserPrompt
      ? { role: 'user', content: originalUserPrompt }
      : messages?.filter((m) => m.role === 'user').slice(-1)[0] || null

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

    const memoryEnabled = Boolean(filteredInputs.memoryType && filteredInputs.memoryType !== 'none')

    if (this.isStreamingExecution(result)) {
      if (memoryEnabled) {
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

    if (memoryEnabled) {
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

  /**
   * Updates the system message in inputs.messages array to match inputs.systemPrompt
   * This ensures both are kept in sync when we modify the system prompt.
   */
  private updateSystemMessageInInputs(inputs: AgentInputs): void {
    if (!inputs.systemPrompt) return

    if (inputs.messages && Array.isArray(inputs.messages)) {
      const systemMsgIndex = inputs.messages.findIndex((m) => m.role === 'system')
      if (systemMsgIndex !== -1) {
        // Update existing system message
        inputs.messages[systemMsgIndex].content = inputs.systemPrompt
      } else {
        // Add system message at the beginning if it doesn't exist
        inputs.messages.unshift({ role: 'system', content: inputs.systemPrompt })
      }
    }
  }

  /**
   * Extracts complete input from messages array for logging purposes.
   * This includes conversation history that was added to the prompt.
   */
  private extractCompleteInputFromMessages(
    messages: Message[] | undefined,
    inputs: AgentInputs
  ): any {
    if (!messages || messages.length === 0) {
      return inputs
    }

    // Reconstruct the input with the complete user prompt (including conversation history)
    const userMessages = messages.filter((m) => m.role === 'user')
    const lastUserMessage = userMessages[userMessages.length - 1]

    if (lastUserMessage) {
      if (inputs.userPrompt) {
        return {
          ...inputs,
          userPrompt: lastUserMessage.content,
        }
      }
      if (inputs.messages && Array.isArray(inputs.messages)) {
        const updatedMessages = [...inputs.messages]
        const userMsgIndex = updatedMessages.findIndex((m) => m.role === 'user')
        if (userMsgIndex !== -1) {
          updatedMessages[userMsgIndex] = {
            ...updatedMessages[userMsgIndex],
            content: lastUserMessage.content,
          }
        }
        return {
          ...inputs,
          messages: updatedMessages,
        }
      }
    }

    return inputs
  }

  private async validateToolPermissions(ctx: ExecutionContext, tools: ToolInput[]): Promise<void> {
    if (!Array.isArray(tools) || tools.length === 0) return

    const hasMcpTools = tools.some((t) => t.type === 'mcp')
    const hasCustomTools = tools.some((t) => t.type === 'custom-tool')

    if (hasMcpTools) {
      await validateMcpToolsAllowed(ctx.userId, ctx.workspaceId, ctx)
    }

    if (hasCustomTools) {
      await validateCustomToolsAllowed(ctx.userId, ctx.workspaceId, ctx)
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

    if (!ctx.workspaceId) {
      logger.warn('Skipping MCP availability filtering without workspace scope')
      return tools
    }

    const availableServerIds = new Set<string>()
    if (serverIds.length > 0) {
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

  private async formatTools(
    ctx: ExecutionContext,
    inputTools: ToolInput[],
    canonicalModes?: Record<string, 'basic' | 'advanced'>
  ): Promise<any[]> {
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
          if (tool.type && tool.type !== 'custom-tool') {
            await validateBlockType(ctx.userId, ctx.workspaceId, tool.type, ctx)
          }
          if (tool.type === 'custom-tool' && (tool.schema || tool.customToolId)) {
            return await this.createCustomTool(ctx, tool)
          }
          return this.transformBlockTool(ctx, tool, canonicalModes)
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
    let title = tool.title

    if (tool.customToolId) {
      const resolved = await this.fetchCustomToolById(ctx, tool.customToolId)
      if (resolved) {
        schema = resolved.schema
        title = resolved.title
      } else if (!schema) {
        logger.error(`Custom tool not found: ${tool.customToolId}`)
        return null
      }
    }

    if (!schema?.function) {
      logger.error('Custom tool missing schema:', { customToolId: tool.customToolId, title })
      return null
    }

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

    return base
  }

  /**
   * Fetches a custom tool definition from the database by ID
   */
  private async fetchCustomToolById(
    ctx: ExecutionContext,
    customToolId: string
  ): Promise<{ schema: any; title: string } | null> {
    if (!ctx.userId) {
      logger.error('Cannot fetch custom tool without userId:', { customToolId })
      return null
    }

    try {
      const tool = await getCustomToolById({
        toolId: customToolId,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      })

      if (!tool) {
        logger.warn(`Custom tool not found by ID: ${customToolId}`)
        return null
      }

      return {
        schema: tool.schema,
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
    return this.buildMcpTool({
      serverId,
      toolName,
      description:
        tool.schema?.description || `MCP tool ${toolName} from ${serverName || serverId}`,
      schema: tool.schema || { type: 'object', properties: {} },
      userProvidedParams,
      usageControl: tool.usageControl,
    })
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

    const headers = await buildAuthHeaders(ctx.userId)
    const url = buildAPIUrl('/api/mcp/tools/discover', {
      serverId,
      workspaceId: ctx.workspaceId,
      workflowId: ctx.workflowId,
      ...(ctx.userId ? { userId: ctx.userId } : {}),
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
            await sleep(100)
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
        const errorMsg = toError(error).message
        if (this.isRetryableError(errorMsg) && attempt < maxAttempts - 1) {
          logger.warn(
            `[AgentHandler] Retryable error discovering tools from ${serverId} (attempt ${attempt + 1}):`,
            error
          )
          await sleep(100)
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
    return this.buildMcpTool({
      serverId,
      toolName,
      description: mcpTool.description || `MCP tool ${toolName} from ${mcpTool.serverName}`,
      schema: mcpTool.inputSchema || { type: 'object', properties: {} },
      userProvidedParams,
      usageControl: tool.usageControl,
    })
  }

  private async buildMcpTool(config: {
    serverId: string
    toolName: string
    description: string
    schema: Record<string, unknown>
    userProvidedParams: Record<string, unknown>
    usageControl?: 'auto' | 'force' | 'none'
  }) {
    const { filterSchemaForLLM } = await import('@/tools/params')
    const filteredSchema = filterSchemaForLLM(
      config.schema as unknown as Parameters<typeof filterSchemaForLLM>[0],
      config.userProvidedParams as Record<string, unknown>
    )
    const toolId = createMcpToolId(config.serverId, config.toolName)

    return {
      id: toolId,
      name: config.toolName,
      description: config.description,
      parameters: filteredSchema,
      params: config.userProvidedParams,
      usageControl: config.usageControl || 'auto',
    }
  }

  private async transformBlockTool(
    ctx: ExecutionContext,
    tool: ToolInput,
    canonicalModes?: Record<string, 'basic' | 'advanced'>
  ) {
    const transformedTool = await transformBlockTool(tool, {
      selectedOperation: tool.operation,
      getAllBlocks,
      getToolAsync: (toolId: string) =>
        getToolAsync(toolId, {
          workflowId: ctx.workflowId,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        }),
      getTool,
      canonicalModes,
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
    skillMetadata: Array<{ name: string; description: string }> = []
  ): Promise<Message[] | undefined> {
    const messages: Message[] = []
    const memoryEnabled = Boolean(inputs.memoryType && inputs.memoryType !== 'none')

    // 1. Extract and validate messages from messages-input subblock
    const inputMessages = this.extractValidMessages(inputs.messages)
    const systemMessages = inputMessages.filter((m) => m.role === 'system')
    const conversationMessages = inputMessages.filter((m) => m.role !== 'system')

    // Store original user prompt BEFORE memory enhancement for Mem0 storage
    let originalUserPromptForMemory: string | undefined
    if (inputs.userPrompt) {
      originalUserPromptForMemory =
        typeof inputs.userPrompt === 'string'
          ? inputs.userPrompt
          : JSON.stringify(inputs.userPrompt)
    } else if (inputs.messages && Array.isArray(inputs.messages)) {
      const userMsg = inputs.messages.find((m) => m.role === 'user')
      if (userMsg) {
        originalUserPromptForMemory = userMsg.content
      }
    }

    // 2. Fetch conversation memory history (using semantic search or pre-fetched results)
    if (memoryEnabled) {
      const memoryMessages = await memoryService.getMemoryContextMessages(ctx, inputs)
      if (memoryMessages.length > 0) {
        messages.push(...memoryMessages)
        logger.debug('Added memory context messages to messages array', {
          blockId,
          memoryType: inputs.memoryType,
          memoryMessageCount: memoryMessages.length,
        })
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

    // 5. Handle systemPrompt - update existing system message or add new one
    // inputs.systemPrompt may have been enhanced with additional execution rules and fact memories
    if (inputs.systemPrompt) {
      // Always use the enhanced systemPrompt from inputs, which includes additional rules and fact memories
      this.addSystemPrompt(messages, inputs.systemPrompt)
    } else if (systemMessages.length > 0) {
      // If no systemPrompt but system messages exist in inputs.messages, use those
      messages.unshift(...systemMessages)
    }

    // 6. Handle legacy userPrompt - this is NEW input each run
    if (inputs.userPrompt) {
      this.addUserPrompt(messages, inputs.userPrompt)
      // Note: User messages are NOT stored separately here to avoid duplicates.
      // They will be stored together with the assistant response in persistResponseToMemory
      // via callMem0API, which stores the complete turn (user + assistant) together.
    }

    // 6b. Note: User messages from inputs.messages are also not stored separately.
    // They will be stored together with the assistant response to avoid duplicates.

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

    // 8. Inject skill metadata into the system message (progressive disclosure)
    if (skillMetadata.length > 0) {
      const skillSection = buildSkillsSystemPromptSection(skillMetadata)
      const systemIdx = messages.findIndex((m) => m.role === 'system')
      if (systemIdx >= 0) {
        messages[systemIdx] = {
          ...messages[systemIdx],
          content: messages[systemIdx].content + skillSection,
        }
      } else {
        messages.unshift({ role: 'system', content: skillSection.trim() })
      }
    }

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

    const firstSystemIndex = messages.findIndex((msg) => msg.role === 'system')

    if (firstSystemIndex === -1) {
      messages.unshift({ role: 'system', content })
    } else if (firstSystemIndex === 0) {
      messages[0] = { role: 'system', content }
    } else {
      messages.splice(firstSystemIndex, 1)
      messages.unshift({ role: 'system', content })
    }

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
      temperature:
        inputs.temperature != null && inputs.temperature !== ''
          ? Number(inputs.temperature)
          : undefined,
      maxTokens:
        inputs.maxTokens != null && inputs.maxTokens !== '' ? Number(inputs.maxTokens) : undefined,
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
      userId: ctx.userId,
      stream: streaming,
      messages: messages?.map(({ executionId, ...msg }) => msg),
      environmentVariables: ctx.environmentVariables || {},
      workflowVariables: ctx.workflowVariables || {},
      blockData,
      blockNameMapping,
      reasoningEffort: inputs.reasoningEffort,
      verbosity: inputs.verbosity,
      thinkingLevel: inputs.thinkingLevel,
      previousInteractionId: inputs.previousInteractionId,
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
        finalApiKey = await resolveVertexCredential(
          providerRequest.vertexCredential,
          'vertex-agent'
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
        userId: ctx.userId,
        stream: providerRequest.stream,
        messages: 'messages' in providerRequest ? providerRequest.messages : undefined,
        environmentVariables: ctx.environmentVariables || {},
        workflowVariables: ctx.workflowVariables || {},
        blockData,
        blockNameMapping,
        isDeployedContext: ctx.isDeployedContext,
        callChain: ctx.callChain,
        reasoningEffort: providerRequest.reasoningEffort,
        verbosity: providerRequest.verbosity,
        thinkingLevel: providerRequest.thinkingLevel,
        previousInteractionId: providerRequest.previousInteractionId,
        abortSignal: ctx.abortSignal,
      })

      return this.processProviderResponse(response, block, responseFormat)
    } catch (error) {
      this.handleExecutionError(error, providerStartTime, providerId, model, ctx, block)
      throw error
    }
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
      ...this.createResponseMetadata(result),
      ...(result.interactionId && { interactionId: result.interactionId }),
    }
  }

  private createResponseMetadata(result: {
    model?: string
    tokens?: { input?: number; output?: number; total?: number }
    toolCalls?: Array<any>
    timing?: any
    cost?: any
  }) {
    return {
      model: result.model,
      tokens: result.tokens || {
        input: DEFAULTS.TOKENS.PROMPT,
        output: DEFAULTS.TOKENS.COMPLETION,
        total: DEFAULTS.TOKENS.TOTAL,
      },
      toolCalls: {
        list: result.toolCalls?.map(this.formatToolCall.bind(this)) || [],
        count: result.toolCalls?.length ?? 0,
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
