import { generateRequestId } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'
import { getAccurateTokenCount } from '@/lib/tokenization/estimators'
import type { AgentInputs, Message } from '@/executor/handlers/agent/types'
import type { ExecutionContext } from '@/executor/types'
import { buildAPIUrl, buildAuthHeaders } from '@/executor/utils/http'
import { stringifyJSON } from '@/executor/utils/json'
import { PROVIDER_DEFINITIONS } from '@/providers/models'

const logger = createLogger('Memory')

/**
 * Class for managing agent conversation memory
 * Handles fetching and persisting messages to the memory table
 */
export class Memory {
  /**
   * Fetch messages from memory based on memoryType configuration
   */
  async fetchMemoryMessages(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    blockId: string
  ): Promise<Message[]> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return []
    }

    if (!ctx.workflowId) {
      logger.warn('Cannot fetch memory without workflowId')
      return []
    }

    try {
      this.validateInputs(inputs.conversationId)

      const memoryKey = this.buildMemoryKey(ctx, inputs, blockId)
      let messages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)

      switch (inputs.memoryType) {
        case 'conversation':
          messages = this.applyContextWindowLimit(messages, inputs.model)
          break

        case 'sliding_window': {
          // Default to 10 messages if not specified (matches agent block default)
          const windowSize = inputs.slidingWindowSize || '10'
          messages = this.applySlidingWindow(messages, windowSize)
          break
        }

        case 'sliding_window_tokens': {
          // Default to 4000 tokens if not specified (matches agent block default)
          const maxTokens = inputs.slidingWindowTokens || '4000'
          messages = this.applySlidingWindowByTokens(messages, maxTokens, inputs.model)
          break
        }
      }

      return messages
    } catch (error) {
      logger.error('Failed to fetch memory messages:', error)
      return []
    }
  }

  /**
   * Persist assistant response to memory
   * Uses atomic append operations to prevent race conditions
   */
  async persistMemoryMessage(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    assistantMessage: Message,
    blockId: string
  ): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    if (!ctx.workflowId) {
      logger.warn('Cannot persist memory without workflowId')
      return
    }

    try {
      this.validateInputs(inputs.conversationId, assistantMessage.content)

      const memoryKey = this.buildMemoryKey(ctx, inputs, blockId)

      if (inputs.memoryType === 'sliding_window') {
        // Default to 10 messages if not specified (matches agent block default)
        const windowSize = inputs.slidingWindowSize || '10'

        const existingMessages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)
        const updatedMessages = [...existingMessages, assistantMessage]
        const messagesToPersist = this.applySlidingWindow(updatedMessages, windowSize)

        await this.persistToMemoryAPI(ctx.workflowId, memoryKey, messagesToPersist)
      } else if (inputs.memoryType === 'sliding_window_tokens') {
        // Default to 4000 tokens if not specified (matches agent block default)
        const maxTokens = inputs.slidingWindowTokens || '4000'

        const existingMessages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)
        const updatedMessages = [...existingMessages, assistantMessage]
        const messagesToPersist = this.applySlidingWindowByTokens(
          updatedMessages,
          maxTokens,
          inputs.model
        )

        await this.persistToMemoryAPI(ctx.workflowId, memoryKey, messagesToPersist)
      } else {
        // Conversation mode: use atomic append for better concurrency
        await this.atomicAppendToMemory(ctx.workflowId, memoryKey, assistantMessage)
      }

      logger.debug('Successfully persisted memory message', {
        workflowId: ctx.workflowId,
        key: memoryKey,
      })

      // Call Mem0 API as add-on (non-blocking) - only send current turn (last user + assistant)
      await this.callMem0API(ctx, inputs, assistantMessage, blockId, memoryKey)
    } catch (error) {
      logger.error('Failed to persist memory message:', error)
    }
  }

  /**
   * Persist user message to memory before agent execution
   */
  async persistUserMessage(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    userMessage: Message,
    blockId: string
  ): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    if (!ctx.workflowId) {
      logger.warn('Cannot persist user message without workflowId')
      return
    }

    try {
      const memoryKey = this.buildMemoryKey(ctx, inputs, blockId)

      if (inputs.slidingWindowSize && inputs.memoryType === 'sliding_window') {
        const existingMessages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)
        const updatedMessages = [...existingMessages, userMessage]
        const messagesToPersist = this.applySlidingWindow(updatedMessages, inputs.slidingWindowSize)
        await this.persistToMemoryAPI(ctx.workflowId, memoryKey, messagesToPersist)
      } else if (inputs.slidingWindowTokens && inputs.memoryType === 'sliding_window_tokens') {
        const existingMessages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)
        const updatedMessages = [...existingMessages, userMessage]
        const messagesToPersist = this.applySlidingWindowByTokens(
          updatedMessages,
          inputs.slidingWindowTokens,
          inputs.model
        )
        await this.persistToMemoryAPI(ctx.workflowId, memoryKey, messagesToPersist)
      } else {
        await this.atomicAppendToMemory(ctx.workflowId, memoryKey, userMessage)
      }
    } catch (error) {
      logger.error('Failed to persist user message:', error)
    }
  }

  /**
   * Search memories using semantic search API
   * Replaces chronological memory fetch with semantic search
   */
  async searchMemories(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    blockId: string,
    userPrompt?: string
  ): Promise<Message[]> {
    // Skip if userId is not available (required for search API)
    if (!ctx.userId) {
      logger.warn('Cannot search memories without userId in execution context')
      return []
    }

    try {
      // Extract query from user prompt
      const query = userPrompt || ''

      if (!query || query.trim() === '') {
        logger.debug('No user prompt provided for semantic search, returning empty results')
        return []
      }

      // Build filters object with conversationId and blockId
      const filters: Record<string, any> = {}

      if (inputs.conversationId) {
        filters.conversation_id = inputs.conversationId
      }

      if (blockId) {
        filters.block_id = blockId
      }

      filters.memory_type = 'conversation'

      const requestId = generateRequestId()

      // Dynamically import searchMemoryAPI to avoid circular dependencies
      const { searchMemoryAPI } = await import('@/app/api/chat/memory-api')

      // Call search API
      // run_id and agent_id are not provided (optional and not needed)
      const searchResults = await searchMemoryAPI(
        requestId,
        query,
        ctx.userId,
        Object.keys(filters).length > 0 ? filters : undefined
      )

      if (!searchResults) {
        logger.debug('No search results returned from memory API')
        return []
      }

      // Convert search results to Message[] format
      const messages = this.convertSearchResultsToMessages(searchResults)

      logger.debug('Successfully retrieved memories from semantic search', {
        workflowId: ctx.workflowId,
        userId: ctx.userId,
        query,
        results: messages,
        blockId,
      })

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
   * Build memory key based on conversationId and blockId
   * BlockId provides block-level memory isolation
   */
  private buildMemoryKey(_ctx: ExecutionContext, inputs: AgentInputs, blockId: string): string {
    const { conversationId } = inputs

    if (!conversationId || conversationId.trim() === '') {
      throw new Error(
        'Conversation ID is required for all memory types. ' +
          'Please provide a unique identifier (e.g., user-123, session-abc, customer-456).'
      )
    }

    return `${conversationId}:${blockId}`
  }

  /**
   * Apply sliding window to limit number of conversation messages
   *
   * System message handling:
   * - System messages are excluded from the sliding window count
   * - Only the first system message is preserved and placed at the start
   * - This ensures system prompts remain available while limiting conversation history
   */
  private applySlidingWindow(messages: Message[], windowSize: string): Message[] {
    const limit = Number.parseInt(windowSize, 10)

    if (Number.isNaN(limit) || limit <= 0) {
      logger.warn('Invalid sliding window size, returning all messages', { windowSize })
      return messages
    }

    const systemMessages = messages.filter((msg) => msg.role === 'system')
    const conversationMessages = messages.filter((msg) => msg.role !== 'system')

    const recentMessages = conversationMessages.slice(-limit)

    const firstSystemMessage = systemMessages.length > 0 ? [systemMessages[0]] : []

    return [...firstSystemMessage, ...recentMessages]
  }

  /**
   * Apply token-based sliding window to limit conversation by token count
   *
   * System message handling:
   * - For consistency with message-based sliding window, the first system message is preserved
   * - System messages are excluded from the token count
   * - This ensures system prompts are always available while limiting conversation history
   */
  private applySlidingWindowByTokens(
    messages: Message[],
    maxTokens: string,
    model?: string
  ): Message[] {
    const tokenLimit = Number.parseInt(maxTokens, 10)

    if (Number.isNaN(tokenLimit) || tokenLimit <= 0) {
      logger.warn('Invalid token limit, returning all messages', { maxTokens })
      return messages
    }

    // Separate system messages from conversation messages for consistent handling
    const systemMessages = messages.filter((msg) => msg.role === 'system')
    const conversationMessages = messages.filter((msg) => msg.role !== 'system')

    const result: Message[] = []
    let currentTokenCount = 0

    // Add conversation messages from most recent backwards
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i]
      const messageTokens = getAccurateTokenCount(message.content, model)

      if (currentTokenCount + messageTokens <= tokenLimit) {
        result.unshift(message)
        currentTokenCount += messageTokens
      } else if (result.length === 0) {
        logger.warn('Single message exceeds token limit, including anyway', {
          messageTokens,
          tokenLimit,
          messageRole: message.role,
        })
        result.unshift(message)
        currentTokenCount += messageTokens
        break
      } else {
        // Token limit reached, stop processing
        break
      }
    }

    logger.debug('Applied token-based sliding window', {
      totalMessages: messages.length,
      conversationMessages: conversationMessages.length,
      includedMessages: result.length,
      totalTokens: currentTokenCount,
      tokenLimit,
    })

    // Preserve first system message and prepend to results (consistent with message-based window)
    const firstSystemMessage = systemMessages.length > 0 ? [systemMessages[0]] : []
    return [...firstSystemMessage, ...result]
  }

  /**
   * Apply context window limit based on model's maximum context window
   * Auto-trims oldest conversation messages when approaching the model's context limit
   * Uses 90% of context window (10% buffer for response)
   * Only applies if model has contextWindow defined and contextInformationAvailable !== false
   */
  private applyContextWindowLimit(messages: Message[], model?: string): Message[] {
    if (!model) {
      return messages
    }

    let contextWindow: number | undefined

    for (const provider of Object.values(PROVIDER_DEFINITIONS)) {
      if (provider.contextInformationAvailable === false) {
        continue
      }

      const matchesPattern = provider.modelPatterns?.some((pattern) => pattern.test(model))
      const matchesModel = provider.models.some((m) => m.id === model)

      if (matchesPattern || matchesModel) {
        const modelDef = provider.models.find((m) => m.id === model)
        if (modelDef?.contextWindow) {
          contextWindow = modelDef.contextWindow
          break
        }
      }
    }

    if (!contextWindow) {
      logger.debug('No context window information available for model, skipping auto-trim', {
        model,
      })
      return messages
    }

    const maxTokens = Math.floor(contextWindow * 0.9)

    logger.debug('Applying context window limit', {
      model,
      contextWindow,
      maxTokens,
      totalMessages: messages.length,
    })

    const systemMessages = messages.filter((msg) => msg.role === 'system')
    const conversationMessages = messages.filter((msg) => msg.role !== 'system')

    // Count tokens used by system messages first
    let systemTokenCount = 0
    for (const msg of systemMessages) {
      systemTokenCount += getAccurateTokenCount(msg.content, model)
    }

    // Calculate remaining tokens available for conversation messages
    const remainingTokens = Math.max(0, maxTokens - systemTokenCount)

    if (systemTokenCount >= maxTokens) {
      logger.warn('System messages exceed context window limit, including anyway', {
        systemTokenCount,
        maxTokens,
        systemMessageCount: systemMessages.length,
      })
      return systemMessages
    }

    const result: Message[] = []
    let currentTokenCount = 0

    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i]
      const messageTokens = getAccurateTokenCount(message.content, model)

      if (currentTokenCount + messageTokens <= remainingTokens) {
        result.unshift(message)
        currentTokenCount += messageTokens
      } else if (result.length === 0) {
        logger.warn('Single message exceeds remaining context window, including anyway', {
          messageTokens,
          remainingTokens,
          systemTokenCount,
          messageRole: message.role,
        })
        result.unshift(message)
        currentTokenCount += messageTokens
        break
      } else {
        logger.info('Auto-trimmed conversation history to fit context window', {
          originalMessages: conversationMessages.length,
          trimmedMessages: result.length,
          conversationTokens: currentTokenCount,
          systemTokens: systemTokenCount,
          totalTokens: currentTokenCount + systemTokenCount,
          maxTokens,
        })
        break
      }
    }

    return [...systemMessages, ...result]
  }

  /**
   * Fetch messages from memory API
   */
  private async fetchFromMemoryAPI(workflowId: string, key: string): Promise<Message[]> {
    try {
      const isBrowser = typeof window !== 'undefined'

      if (!isBrowser) {
        return await this.fetchFromMemoryDirect(workflowId, key)
      }

      const headers = await buildAuthHeaders()
      const url = buildAPIUrl(`/api/memory/${encodeURIComponent(key)}`, { workflowId })

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        if (response.status === 404) {
          return []
        }
        throw new Error(`Failed to fetch memory: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch memory')
      }

      const memoryData = result.data?.data || result.data
      if (Array.isArray(memoryData)) {
        return memoryData.filter(
          (msg) => msg && typeof msg === 'object' && 'role' in msg && 'content' in msg
        )
      }

      return []
    } catch (error) {
      logger.error('Error fetching from memory API:', error)
      return []
    }
  }

  /**
   * Direct database access
   */
  private async fetchFromMemoryDirect(workflowId: string, key: string): Promise<Message[]> {
    try {
      const { db } = await import('@sim/db')
      const { memory } = await import('@sim/db/schema')
      const { and, eq } = await import('drizzle-orm')

      const result = await db
        .select({
          data: memory.data,
        })
        .from(memory)
        .where(and(eq(memory.workflowId, workflowId), eq(memory.key, key)))
        .limit(1)

      if (result.length === 0) {
        return []
      }

      const memoryData = result[0].data as any
      if (Array.isArray(memoryData)) {
        return memoryData.filter(
          (msg) => msg && typeof msg === 'object' && 'role' in msg && 'content' in msg
        )
      }

      return []
    } catch (error) {
      logger.error('Error fetching from memory database:', error)
      return []
    }
  }

  /**
   * Persist messages to memory API
   */
  private async persistToMemoryAPI(
    workflowId: string,
    key: string,
    messages: Message[]
  ): Promise<void> {
    try {
      const isBrowser = typeof window !== 'undefined'

      if (!isBrowser) {
        await this.persistToMemoryDirect(workflowId, key, messages)
        return
      }

      const headers = await buildAuthHeaders()
      const url = buildAPIUrl('/api/memory')

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: stringifyJSON({
          workflowId,
          key,
          data: messages,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to persist memory: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to persist memory')
      }
    } catch (error) {
      logger.error('Error persisting to memory API:', error)
      throw error
    }
  }

  /**
   * Atomically append a message to memory
   */
  private async atomicAppendToMemory(
    workflowId: string,
    key: string,
    message: Message
  ): Promise<void> {
    try {
      const isBrowser = typeof window !== 'undefined'

      if (!isBrowser) {
        await this.atomicAppendToMemoryDirect(workflowId, key, message)
      } else {
        const headers = await buildAuthHeaders()
        const url = buildAPIUrl('/api/memory')

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: stringifyJSON({
            workflowId,
            key,
            data: message,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to append memory: ${response.status} ${response.statusText}`)
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to append memory')
        }
      }
    } catch (error) {
      logger.error('Error appending to memory:', error)
      throw error
    }
  }

  /**
   * Direct database atomic append for server-side
   * Uses PostgreSQL JSONB concatenation operator for atomic operations
   */
  private async atomicAppendToMemoryDirect(
    workflowId: string,
    key: string,
    message: Message
  ): Promise<void> {
    try {
      const { db } = await import('@sim/db')
      const { memory } = await import('@sim/db/schema')
      const { sql } = await import('drizzle-orm')
      const { randomUUID } = await import('node:crypto')

      const now = new Date()
      const id = randomUUID()

      await db
        .insert(memory)
        .values({
          id,
          workflowId,
          key,
          data: [message],
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [memory.workflowId, memory.key],
          set: {
            data: sql`${memory.data} || ${JSON.stringify([message])}::jsonb`,
            updatedAt: now,
          },
        })

      logger.debug('Atomically appended message to memory', {
        workflowId,
        key,
      })
    } catch (error) {
      logger.error('Error in atomic append to memory database:', error)
      throw error
    }
  }

  /**
   * Direct database access for server-side persistence
   * Uses UPSERT to handle race conditions atomically
   */
  private async persistToMemoryDirect(
    workflowId: string,
    key: string,
    messages: Message[]
  ): Promise<void> {
    try {
      const { db } = await import('@sim/db')
      const { memory } = await import('@sim/db/schema')
      const { randomUUID } = await import('node:crypto')

      const now = new Date()
      const id = randomUUID()

      await db
        .insert(memory)
        .values({
          id,
          workflowId,
          key,
          data: messages,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [memory.workflowId, memory.key],
          set: {
            data: messages,
            updatedAt: now,
          },
        })
    } catch (error) {
      logger.error('Error persisting to memory database:', error)
      throw error
    }
  }

  /**
   * Call Mem0 API to store memories in external service
   * This is an add-on feature that doesn't block main memory operations
   * Calls the API twice: once for conversation memory, once for fact memory
   * Only sends the current turn (last user message + assistant message), not the full history
   * @param assistantMessage - The assistant message that was just persisted
   * @param memoryKey - Memory key to fetch the last user message
   */
  private async callMem0API(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    assistantMessage: Message,
    blockId: string,
    memoryKey: string
  ): Promise<void> {
    // Skip if userId is not available (required for Mem0 API)
    if (!ctx.userId) {
      logger.debug('Skipping Mem0 API call: userId not available in execution context')
      return
    }

    // Skip if conversationId is not available
    if (!inputs.conversationId) {
      logger.debug('Skipping Mem0 API call: conversationId not available')
      return
    }

    try {
      // Fetch existing messages to get the last user message
      const existingMessages = await this.fetchFromMemoryAPI(ctx.workflowId, memoryKey)

      // Find the last user message (the one that corresponds to this assistant response)
      // We look for the most recent user message before this assistant message
      let lastUserMessage: Message | null = null

      // Since we just appended the assistant message, it might not be in existingMessages yet
      // So we look for the last user message in the existing messages
      for (let i = existingMessages.length - 1; i >= 0; i--) {
        if (existingMessages[i].role === 'user') {
          lastUserMessage = existingMessages[i]
          break
        }
      }

      // If no user message found, skip (shouldn't happen, but handle gracefully)
      if (!lastUserMessage) {
        logger.debug('Skipping Mem0 API call: no user message found in conversation')
        return
      }

      // Only send the current turn: last user message + assistant message
      const currentTurnMessages: Message[] = [lastUserMessage, assistantMessage]

      // Convert Message[] to the format expected by callMemoryAPI
      const messagesForAPI = currentTurnMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      // Use executionId as chatId, fallback to workflowId
      const chatId = ctx.executionId || ctx.workflowId

      const requestId = generateRequestId()

      // Dynamically import callMemoryAPI to avoid circular dependencies
      const { callMemoryAPI } = await import('@/app/api/chat/memory-api')

      // Call 1: Store as fact memory (infer: true)
      try {
        await callMemoryAPI(
          requestId,
          messagesForAPI,
          ctx.userId,
          chatId,
          inputs.conversationId,
          true, // infer: false
          'fact', // memoryType: 'conversation'
          blockId
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

      // Call 2: Store as conversation memory (infer: false)
      try {
        await callMemoryAPI(
          requestId,
          messagesForAPI,
          ctx.userId,
          chatId,
          inputs.conversationId,
          false, // infer: true
          'conversation', // memoryType: 'fact'
          blockId
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
    } catch (error) {
      // Log but don't throw - this is an add-on feature
      logger.warn('Error in Mem0 API integration (non-blocking)', {
        error,
        workflowId: ctx.workflowId,
        blockId,
      })
    }
  }

  /**
   * Validate inputs to prevent malicious data or performance issues
   */
  private validateInputs(conversationId?: string, content?: string): void {
    if (conversationId) {
      if (conversationId.length > 255) {
        throw new Error('Conversation ID too long (max 255 characters)')
      }

      if (!/^[a-zA-Z0-9_\-:.@]+$/.test(conversationId)) {
        logger.warn('Conversation ID contains special characters', { conversationId })
      }
    }

    if (content) {
      const contentSize = Buffer.byteLength(content, 'utf8')
      const MAX_CONTENT_SIZE = 100 * 1024 // 100KB

      if (contentSize > MAX_CONTENT_SIZE) {
        throw new Error(`Message content too large (${contentSize} bytes, max ${MAX_CONTENT_SIZE})`)
      }
    }
  }
}

export const memoryService = new Memory()
