import { createLogger } from '@sim/logger'
import { generateRequestId } from '@/lib/core/utils/request'
import { getAccurateTokenCount } from '@/lib/tokenization/estimators'
import { MEMORY } from '@/executor/constants'
import type { AgentInputs, Message } from '@/executor/handlers/agent/types'
import type { ExecutionContext } from '@/executor/types'
import { PROVIDER_DEFINITIONS } from '@/providers/models'

const logger = createLogger('Memory')

export class Memory {
  async fetchMemoryMessages(ctx: ExecutionContext, inputs: AgentInputs): Promise<Message[]> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return []
    }

    // This method is no longer used since we use semantic search instead
    // Keeping for backward compatibility but returning empty array
    // Conversation history is now retrieved via searchMemories in buildMessages
    return []
  }

  /**
   * Search memories using semantic search API
   * Replaces chronological memory fetch with semantic search
   */
  async searchMemories(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    blockId: string,
    userPrompt?: string,
    isConversation?: boolean,
    includeConversationId?: boolean
  ): Promise<Message[]> {
    // Only call Mem0 API for chat trigger type
    const triggerType = ctx.metadata?.triggerType
    if (triggerType !== 'chat') {
      logger.debug('Skipping memory search: triggerType is not "chat"', { triggerType })
      return []
    }

    // Skip if userId is not available (required for search API)
    if (!ctx.userId) {
      logger.warn('Cannot search memories without userId in execution context')
      return []
    }

    try {
      // Extract query from user prompt
      // Allow empty query to fetch recent messages when needed
      const query = userPrompt || ''

      // Build filters object with conversationId if present, otherwise filter by userId only
      const filters: Record<string, any> = {}

      // If conversationId is present, filter by it; otherwise filter by userId only
      if (includeConversationId && inputs.conversationId) {
        filters.conversation_id = inputs.conversationId
      }
      // Note: userId is automatically included in the searchMemoryAPI call

      if (isConversation === true) {
        filters.memory_type = 'conversation'
      } else {
        filters.memory_type = 'fact'
      }

      const isDeployed = ctx.isDeployedContext ?? false

      const requestId = generateRequestId()

      // Dynamically import searchMemoryAPI to avoid circular dependencies
      const { searchMemoryAPI } = await import('@/app/api/chat/memory-api')

      // Call search API
      // run_id and agent_id are not provided (optional and not needed)
      const searchResults = await searchMemoryAPI(
        requestId,
        query,
        ctx.userId,
        Object.keys(filters).length > 0 ? filters : undefined,
        undefined, // runId
        undefined, // agentId
        isDeployed
      )

      if (!searchResults) {
        logger.debug('No search results returned from memory API')
        return []
      }

      // Convert search results to Message[] format
      const messages = this.convertSearchResultsToMessages(searchResults)

      return messages
    } catch (error) {
      logger.error('Failed to search memories:', error)
      return []
    }
  }

  /**
   * Convert search API results to Message[] format
   * Handles different response structures from the search API
   */
  private convertSearchResultsToMessages(searchResults: any): Message[] {
    const messages: Message[] = []

    try {
      // Handle different possible response structures
      let results: any[] = []

      if (Array.isArray(searchResults)) {
        results = searchResults
      } else if (searchResults.results && Array.isArray(searchResults.results)) {
        results = searchResults.results
      } else if (searchResults.memories && Array.isArray(searchResults.memories)) {
        results = searchResults.memories
      } else if (searchResults.data && Array.isArray(searchResults.data)) {
        results = searchResults.data
      }

      for (const result of results) {
        // The search API returns results with structure:
        // { id, memory (content string), role, metadata, score, ... }
        if (result && typeof result === 'object') {
          // Check if result has memory (content) and role fields directly
          if (result.memory && typeof result.memory === 'string' && result.role) {
            // Direct structure: { memory: "content", role: "user|assistant" }
            messages.push({
              role: result.role as 'system' | 'user' | 'assistant',
              content: result.memory,
            })
          } else if (result.content && result.role) {
            // Alternative structure: { content: "text", role: "user|assistant" }
            messages.push({
              role: result.role as 'system' | 'user' | 'assistant',
              content: result.content,
            })
          } else if (result.messages && Array.isArray(result.messages)) {
            // If result contains messages array
            for (const msg of result.messages) {
              if (msg && typeof msg === 'object' && msg.role && msg.content) {
                messages.push({
                  role: msg.role as 'system' | 'user' | 'assistant',
                  content: msg.content,
                })
              }
            }
          } else if (result.memory && typeof result.memory === 'object') {
            // If memory is an object, check for nested structure
            const memory = result.memory
            if (memory.messages && Array.isArray(memory.messages)) {
              for (const msg of memory.messages) {
                if (msg && typeof msg === 'object' && msg.role && msg.content) {
                  messages.push({
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: msg.content,
                  })
                }
              }
            } else if (memory.role && memory.content) {
              messages.push({
                role: memory.role as 'system' | 'user' | 'assistant',
                content: memory.content,
              })
            }
          }
        }
      }

      logger.debug('Converted search results to messages', {
        inputResults: results.length,
        outputMessages: messages.length,
      })
    } catch (error) {
      logger.error('Error converting search results to messages:', error)
    }

    return messages
  }

  /**
   * Call Mem0 API to store memories in external service
   * This is an add-on feature that doesn't block main memory operations
   * Calls the API twice: once for conversation memory, once for fact memory
   * Only sends the current turn (last user message + assistant message), not the full history
   * @param ctx - Execution context
   * @param inputs - Agent inputs containing conversationId
   * @param assistantMessage - The assistant message that was just persisted
   * @param blockId - Block ID for metadata
   * @param memoryKey - Memory key to fetch the last user message (typically conversationId)
   */
  async callMem0API(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    assistantMessage: Message,
    blockId: string,
    lastUserMessage: Message | null
  ): Promise<void> {
    // Only call Mem0 API for chat trigger type
    const triggerType = ctx.metadata?.triggerType
    if (triggerType !== 'chat') {
      logger.debug('Skipping Mem0 API call: triggerType is not "chat"', { triggerType })
      return
    }

    // Skip if userId is not available (required for Mem0 API)
    if (!ctx.userId) {
      logger.debug('Skipping Mem0 API call: userId not available in execution context')
      return
    }

    // If no user message provided, try to search for it in Mem0
    const userMessage: Message | null = lastUserMessage

    if (!userMessage) {
      // If no user message provided and we have conversationId, try to get it from recent messages
      // Note: This is a fallback - ideally the user message should be passed when storing assistant message
      logger.debug(
        'No user message provided to callMem0API, will attempt to find it from Mem0 if conversationId exists'
      )
    }

    // If still no user message, we can't store the turn properly
    if (!userMessage) {
      logger.debug('Skipping Mem0 API call: no user message found')
      return
    }

    try {
      // Only send the current turn: last user message + assistant message
      const currentTurnMessages: Message[] = [userMessage, assistantMessage]

      // Convert Message[] to the format expected by callMemoryAPI
      const messagesForAPI = currentTurnMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      // Use executionId as chatId, fallback to workflowId
      const chatId = ctx.executionId || ctx.workflowId

      const requestId = generateRequestId()
      const isDeployed = ctx.isDeployedContext ?? false

      // Dynamically import callMemoryAPI to avoid circular dependencies
      const { callMemoryAPI } = await import('@/app/api/chat/memory-api')

      // Call 1: Store as fact memory (infer: true)
      try {
        await callMemoryAPI(
          requestId,
          messagesForAPI,
          ctx.userId,
          chatId,
          inputs.conversationId, // Can be undefined, Mem0 will handle it
          true, // infer: true
          'fact', // memoryType: 'fact'
          blockId,
          isDeployed,
          ctx.workflowId,
          ctx.workspaceId
        )
        logger.debug('Successfully called Mem0 API for fact memory', {
          workflowId: ctx.workflowId,
          conversationId: inputs.conversationId,
          blockId,
          messageCount: messagesForAPI.length,
        })
      } catch (error) {
        logger.warn('Failed to call Mem0 API for fact memory (non-blocking)', {
          error,
          workflowId: ctx.workflowId,
        })
      }

      // Call 2: Store as conversation memory (infer: false)
      try {
        await callMemoryAPI(
          requestId,
          messagesForAPI,
          ctx.userId,
          chatId,
          inputs.conversationId, // Can be undefined, Mem0 will handle it
          false, // infer: false
          'conversation', // memoryType: 'conversation'
          blockId,
          isDeployed,
          ctx.workflowId,
          ctx.workspaceId
        )
        logger.debug('Successfully called Mem0 API for conversation memory', {
          workflowId: ctx.workflowId,
          conversationId: inputs.conversationId,
          blockId,
          messageCount: messagesForAPI.length,
        })
      } catch (error) {
        logger.warn('Failed to call Mem0 API for conversation memory (non-blocking)', {
          error,
          workflowId: ctx.workflowId,
        })
      }
    } catch (error) {
      // Log but don't throw - this is an add-on feature
      logger.warn('Error in Mem0 API integration (non-blocking)', {
        error,
        workflowId: ctx.workflowId,
        blockId,
      })
    }
  }

  async appendToMemory(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    message: Message,
    blockId?: string,
    lastUserMessage?: Message | null
  ): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    // Skip if userId is not available (required for Mem0 API)
    if (!ctx.userId) {
      logger.debug('Skipping memory storage: userId not available in execution context')
      return
    }

    this.validateContent(message.content)

    // Only call Mem0 API for chat trigger type
    const triggerType = ctx.metadata?.triggerType
    if (triggerType !== 'chat') {
      logger.debug('Skipping memory storage: triggerType is not "chat"', { triggerType })
      return
    }

    // Store user messages immediately to Mem0
    if (message.role === 'user') {
      const chatId = ctx.executionId || ctx.workflowId
      const requestId = generateRequestId()
      const isDeployed = ctx.isDeployedContext ?? false

      try {
        const { callMemoryAPI } = await import('@/app/api/chat/memory-api')

        // Store user message as conversation memory
        await callMemoryAPI(
          requestId,
          [{ role: message.role, content: message.content }],
          ctx.userId,
          chatId,
          inputs.conversationId, // Can be undefined
          false, // infer: false
          'conversation', // memoryType: 'conversation'
          blockId,
          isDeployed,
          ctx.workflowId,
          ctx.workspaceId
        )

        logger.debug('Stored user message to Mem0', {
          workflowId: ctx.workflowId,
          conversationId: inputs.conversationId,
          blockId,
        })
      } catch (error) {
        logger.warn('Failed to store user message to Mem0 (non-blocking)', {
          error,
          workflowId: ctx.workflowId,
        })
      }
    }

    // Call Mem0 API to store in external service when assistant message is persisted
    // This stores both the user prompt and assistant response
    if (message.role === 'assistant') {
      // Use blockId if provided, otherwise use conversationId as fallback
      const blockIdForMem0 = blockId || inputs.conversationId || 'unknown'
      // Call asynchronously without blocking - this is an add-on feature
      this.callMem0API(ctx, inputs, message, blockIdForMem0, lastUserMessage || null).catch(
        (error) => {
          logger.warn('Failed to call Mem0 API after appending assistant message (non-blocking)', {
            error,
            workflowId: ctx.workflowId,
          })
        }
      )
    }
  }

  async seedMemory(ctx: ExecutionContext, inputs: AgentInputs, messages: Message[]): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    // Only call Mem0 API for chat trigger type
    const triggerType = ctx.metadata?.triggerType
    if (triggerType !== 'chat') {
      logger.debug('Skipping memory seeding: triggerType is not "chat"', { triggerType })
      return
    }

    // Skip if userId is not available (required for Mem0 API)
    if (!ctx.userId) {
      logger.debug('Skipping memory seeding: userId not available in execution context')
      return
    }

    const conversationMessages = messages.filter((m) => m.role !== 'system')
    if (conversationMessages.length === 0) {
      return
    }

    // Store all conversation messages to Mem0
    const chatId = ctx.executionId || ctx.workflowId
    const requestId = generateRequestId()
    const isDeployed = ctx.isDeployedContext ?? false

    try {
      const { callMemoryAPI } = await import('@/app/api/chat/memory-api')

      const messagesForAPI = conversationMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      // Store as conversation memory
      await callMemoryAPI(
        requestId,
        messagesForAPI,
        ctx.userId,
        chatId,
        inputs.conversationId, // Can be undefined
        false, // infer: false
        'conversation', // memoryType: 'conversation'
        undefined, // blockId not needed for seeding
        isDeployed,
        ctx.workflowId,
        ctx.workspaceId
      )

      logger.debug('Seeded memory to Mem0', {
        workflowId: ctx.workflowId,
        conversationId: inputs.conversationId,
        count: conversationMessages.length,
      })
    } catch (error) {
      logger.warn('Failed to seed memory to Mem0 (non-blocking)', {
        error,
        workflowId: ctx.workflowId,
      })
    }
  }

  wrapStreamForPersistence(
    stream: ReadableStream<Uint8Array>,
    ctx: ExecutionContext,
    inputs: AgentInputs,
    blockId?: string,
    lastUserMessage?: Message | null
  ): ReadableStream<Uint8Array> {
    let accumulatedContent = ''
    const decoder = new TextDecoder()

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        const decoded = decoder.decode(chunk, { stream: true })
        accumulatedContent += decoded
      },

      flush: () => {
        if (accumulatedContent.trim()) {
          this.appendToMemory(
            ctx,
            inputs,
            {
              role: 'assistant',
              content: accumulatedContent,
            },
            blockId,
            lastUserMessage || null
          ).catch((error) => logger.error('Failed to persist streaming response:', error))
        }
      },
    })

    return stream.pipeThrough(transformStream)
  }

  private applyTokenWindow(messages: Message[], maxTokens: number, model?: string): Message[] {
    const result: Message[] = []
    let tokenCount = 0

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const msgTokens = getAccurateTokenCount(msg.content, model)

      if (tokenCount + msgTokens <= maxTokens) {
        result.unshift(msg)
        tokenCount += msgTokens
      } else if (result.length === 0) {
        result.unshift(msg)
        break
      } else {
        break
      }
    }

    return result
  }

  private applyContextWindowLimit(messages: Message[], model?: string): Message[] {
    if (!model) return messages

    for (const provider of Object.values(PROVIDER_DEFINITIONS)) {
      if (provider.contextInformationAvailable === false) continue

      const matchesPattern = provider.modelPatterns?.some((p) => p.test(model))
      const matchesModel = provider.models.some((m) => m.id === model)

      if (matchesPattern || matchesModel) {
        const modelDef = provider.models.find((m) => m.id === model)
        if (modelDef?.contextWindow) {
          const maxTokens = Math.floor(modelDef.contextWindow * MEMORY.CONTEXT_WINDOW_UTILIZATION)
          return this.applyTokenWindow(messages, maxTokens, model)
        }
      }
    }

    return messages
  }

  private validateConversationId(conversationId?: string): void {
    // Only validate length if conversationId is provided, but don't require it
    if (conversationId && conversationId.length > MEMORY.MAX_CONVERSATION_ID_LENGTH) {
      throw new Error(
        `Conversation ID too long (max ${MEMORY.MAX_CONVERSATION_ID_LENGTH} characters)`
      )
    }
  }

  private validateContent(content: string): void {
    const size = Buffer.byteLength(content, 'utf8')
    if (size > MEMORY.MAX_MESSAGE_CONTENT_BYTES) {
      throw new Error(
        `Message content too large (${size} bytes, max ${MEMORY.MAX_MESSAGE_CONTENT_BYTES})`
      )
    }
  }
}

export const memoryService = new Memory()
