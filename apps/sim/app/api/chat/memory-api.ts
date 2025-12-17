import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('MemoryAPI')

const MEMORY_API_BASE_URL = 'https://dev-agent.thearena.ai/mem'

/**
 * Helper function to call the memory API to store memories
 */
export async function callMemoryAPI(
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  userId: string,
  chatId: string,
  conversationId: string | undefined,
  infer: boolean,
  memoryType: 'fact' | 'conversation',
  blockId?: string
): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const memoryConversationId = infer ? conversationId || 'conv_123' : chatId

    const metadata: Record<string, any> = {
      memory_type: memoryType,
      conversation_id: memoryConversationId,
      timestamp: timestamp,
    }

    // Add blockId to metadata if provided
    if (blockId) {
      metadata.block_id = blockId
    }

    if (infer === false) {
      metadata.executionId = uuidv4()
    }

    const payload = {
      messages: messages,
      user_id: userId,
      infer: infer,
      metadata: metadata,
    }

    logger.info(`[${requestId}] Calling memory API`, { payload })

    const response = await fetch(`${MEMORY_API_BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[${requestId}] Memory API request failed`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        infer,
        memoryType,
      })
      // Don't throw - we don't want to fail the main request if memory API fails
      return
    }

    logger.info(`[${requestId}] Memory API call successful`, {
      infer,
      memoryType,
      conversationId: memoryConversationId,
      userId,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error calling memory API:`, error)
    // Don't throw - we don't want to fail the main request if memory API fails
  }
}

/**
 * Search memories using the search API
 * @param requestId - Request ID for logging
 * @param query - Search query string
 * @param userId - User ID
 * @param filters - Optional filters object with key-value pairs
 * @returns Search results or null if the request fails
 */
export async function searchMemoryAPI(
  requestId: string,
  query: string,
  userId: string,
  filters?: Record<string, any>
): Promise<any | null> {
  try {
    const payload: {
      query: string
      user_id: string
      filters?: Record<string, any>
    } = {
      query: query,
      user_id: userId,
    }

    // Add filters if provided
    if (filters && Object.keys(filters).length > 0) {
      payload.filters = filters
    }

    logger.debug(`[${requestId}] Calling memory search API`, {
      query,
      userId,
      hasFilters: !!filters,
      filters,
    })

    const response = await fetch(`${MEMORY_API_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Host: '100.20.15.243:8000',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[${requestId}] Memory search API request failed`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      // Don't throw - return null instead
      return null
    }

    const result = await response.json()
    logger.info(`[${requestId}] Memory search API call successful`, {
      query,
      userId,
    })

    return result
  } catch (error: any) {
    logger.error(`[${requestId}] Error calling memory search API:`, error)
    // Don't throw - return null instead
    return null
  }
}
