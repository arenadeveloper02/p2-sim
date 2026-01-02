import { randomUUID } from 'node:crypto'
import { db } from '@sim/db'
import { memory } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, sql } from 'drizzle-orm'
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

    const workspaceId = this.requireWorkspaceId(ctx)
    this.validateConversationId(inputs.conversationId)

    const messages = await this.fetchMemory(workspaceId, inputs.conversationId!)

    switch (inputs.memoryType) {
      case 'conversation':
        return this.applyContextWindowLimit(messages, inputs.model)

      case 'sliding_window': {
        const limit = this.parsePositiveInt(
          inputs.slidingWindowSize,
          MEMORY.DEFAULT_SLIDING_WINDOW_SIZE
        )
        return this.applyWindow(messages, limit)
      }

      case 'sliding_window_tokens': {
        const maxTokens = this.parsePositiveInt(
          inputs.slidingWindowTokens,
          MEMORY.DEFAULT_SLIDING_WINDOW_TOKENS
        )
        return this.applyTokenWindow(messages, maxTokens, inputs.model)
      }

      default:
        return messages
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
    userPrompt?: string,
    isConversation?: boolean
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

      if (isConversation === true) {
        filters.memory_type = 'conversation'
      } else {
        filters.memory_type = 'fact'
      }

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

  async appendToMemory(
    ctx: ExecutionContext,
    inputs: AgentInputs,
    message: Message
  ): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    const workspaceId = this.requireWorkspaceId(ctx)
    this.validateConversationId(inputs.conversationId)
    this.validateContent(message.content)

    const key = inputs.conversationId!

    await this.appendMessage(workspaceId, key, message)

    logger.debug('Appended message to memory', {
      workspaceId,
      key,
      role: message.role,
    })
  }

  async seedMemory(ctx: ExecutionContext, inputs: AgentInputs, messages: Message[]): Promise<void> {
    if (!inputs.memoryType || inputs.memoryType === 'none') {
      return
    }

    const workspaceId = this.requireWorkspaceId(ctx)

    const conversationMessages = messages.filter((m) => m.role !== 'system')
    if (conversationMessages.length === 0) {
      return
    }

    this.validateConversationId(inputs.conversationId)

    const key = inputs.conversationId!

    let messagesToStore = conversationMessages
    if (inputs.memoryType === 'sliding_window') {
      const limit = this.parsePositiveInt(
        inputs.slidingWindowSize,
        MEMORY.DEFAULT_SLIDING_WINDOW_SIZE
      )
      messagesToStore = this.applyWindow(conversationMessages, limit)
    } else if (inputs.memoryType === 'sliding_window_tokens') {
      const maxTokens = this.parsePositiveInt(
        inputs.slidingWindowTokens,
        MEMORY.DEFAULT_SLIDING_WINDOW_TOKENS
      )
      messagesToStore = this.applyTokenWindow(conversationMessages, maxTokens, inputs.model)
    }

    await this.seedMemoryRecord(workspaceId, key, messagesToStore)

    logger.debug('Seeded memory', {
      workspaceId,
      key,
      count: messagesToStore.length,
    })
  }

  wrapStreamForPersistence(
    stream: ReadableStream<Uint8Array>,
    ctx: ExecutionContext,
    inputs: AgentInputs
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
          this.appendToMemory(ctx, inputs, {
            role: 'assistant',
            content: accumulatedContent,
          }).catch((error) => logger.error('Failed to persist streaming response:', error))
        }
      },
    })

    return stream.pipeThrough(transformStream)
  }

  private requireWorkspaceId(ctx: ExecutionContext): string {
    if (!ctx.workspaceId) {
      throw new Error('workspaceId is required for memory operations')
    }
    return ctx.workspaceId
  }

  private applyWindow(messages: Message[], limit: number): Message[] {
    return messages.slice(-limit)
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

  private async fetchMemory(workspaceId: string, key: string): Promise<Message[]> {
    const result = await db
      .select({ data: memory.data })
      .from(memory)
      .where(and(eq(memory.workspaceId, workspaceId), eq(memory.key, key)))
      .limit(1)

    if (result.length === 0) return []

    const data = result[0].data
    if (!Array.isArray(data)) return []

    return data.filter(
      (msg): msg is Message => msg && typeof msg === 'object' && 'role' in msg && 'content' in msg
    )
  }

  private async seedMemoryRecord(
    workspaceId: string,
    key: string,
    messages: Message[]
  ): Promise<void> {
    const now = new Date()

    await db
      .insert(memory)
      .values({
        id: randomUUID(),
        workspaceId,
        key,
        data: messages,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }

  private async appendMessage(workspaceId: string, key: string, message: Message): Promise<void> {
    const now = new Date()

    await db
      .insert(memory)
      .values({
        id: randomUUID(),
        workspaceId,
        key,
        data: [message],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [memory.workspaceId, memory.key],
        set: {
          data: sql`${memory.data} || ${JSON.stringify([message])}::jsonb`,
          updatedAt: now,
        },
      })
  }

  private parsePositiveInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed) || parsed <= 0) return defaultValue
    return parsed
  }

  private validateConversationId(conversationId?: string): void {
    if (!conversationId || conversationId.trim() === '') {
      throw new Error('Conversation ID is required')
    }
    if (conversationId.length > MEMORY.MAX_CONVERSATION_ID_LENGTH) {
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
