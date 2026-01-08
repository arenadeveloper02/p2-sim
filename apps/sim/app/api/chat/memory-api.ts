import { createLogger } from '@sim/logger'
import { v4 as uuidv4 } from 'uuid'

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
    // Always use conversationId if provided, otherwise fallback based on infer flag
    const memoryConversationId = conversationId || (infer ? 'conv_123' : chatId)

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
      response: await response.json(),
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
  filters?: Record<string, any>,
  runId?: string,
  agentId?: string
): Promise<any | null> {
  try {
    const payload: {
      query: string
      user_id: string
      run_id?: string
      agent_id?: string
      filters?: Record<string, any>
      limit?: number
    } = {
      query: query,
      user_id: userId,
    }

    // Add optional run_id if provided
    if (runId) {
      payload.run_id = runId
    }

    // Add optional agent_id if provided
    if (agentId) {
      payload.agent_id = agentId
    }

    // Add filters if provided
    if (filters && Object.keys(filters).length > 0) {
      payload.filters = filters
    }

    payload.limit = 5

    logger.debug(`[${requestId}] Calling memory search API`, {
      query,
      user_id: userId,
      hasFilters: !!filters,
      filters,
    })

    const response = await fetch(`${MEMORY_API_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
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
      response: result,
    })

    return result
  } catch (error: any) {
    logger.error(`[${requestId}] Error calling memory search API:`, error)
    // Don't throw - return null instead
    return null
  }
}

/**
 * Get memories using the memories API
 * @param requestId - Request ID for logging
 * @param userId - Optional user ID
 * @param runId - Optional run ID
 * @param agentId - Optional agent ID
 * @returns Memory results or null if the request fails
 * @throws Error if none of the required parameters are provided
 */
export async function getMemoriesAPI(
  requestId: string,
  userId?: string,
  runId?: string,
  agentId?: string
): Promise<any | null> {
  try {
    // Validate that at least one parameter is provided
    if (!userId && !runId && !agentId) {
      logger.error(`[${requestId}] At least one of userId, runId, or agentId must be provided`)
      throw new Error('At least one of userId, runId, or agentId must be provided')
    }

    // Build query parameters
    const queryParams = new URLSearchParams()
    if (userId) {
      queryParams.append('user_id', userId)
    }
    if (runId) {
      queryParams.append('run_id', runId)
    }
    if (agentId) {
      queryParams.append('agent_id', agentId)
    }

    const url = `${MEMORY_API_BASE_URL}/memories?${queryParams.toString()}`

    logger.debug(`[${requestId}] Calling get memories API`, {
      userId,
      runId,
      agentId,
      url,
    })

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[${requestId}] Get memories API request failed`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId,
        runId,
        agentId,
      })
      // Don't throw - return null instead
      return null
    }

    const result = await response.json()
    logger.info(`[${requestId}] Get memories API call successful`, {
      userId,
      runId,
      agentId,
      hasResult: !!result,
    })

    return result
  } catch (error: any) {
    // Re-throw validation errors
    if (error.message?.includes('must be provided')) {
      throw error
    }
    logger.error(`[${requestId}] Error calling get memories API:`, error)
    // Don't throw - return null instead
    return null
  }
}
