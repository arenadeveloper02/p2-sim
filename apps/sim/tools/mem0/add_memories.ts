import { v4 as uuidv4 } from 'uuid'
import type { ToolConfig } from '@/tools/types'

// Add Memories Tool
export const mem0AddMemoriesTool: ToolConfig = {
  id: 'mem0_add_memories',
  name: 'Add Memories',
  description: 'Add memories to Mem0 for persistent storage and retrieval',
  version: '1.0.0',

  params: {
    userId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'User ID associated with the memory',
    },
    messages: {
      type: 'json',
      required: true,
      visibility: 'user-or-llm',
      description: 'Array of message objects with role and content',
    },
  },

  request: {
    url: 'https://dev-agent.thearena.ai/mem/memories',
    method: 'POST',
    headers: () => ({
      accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      // First, ensure messages is an array
      let messagesArray = params.messages
      if (typeof messagesArray === 'string') {
        try {
          messagesArray = JSON.parse(messagesArray)
        } catch (_e) {
          throw new Error('Messages must be a valid JSON array of objects with role and content')
        }
      }

      // Validate message format
      if (!Array.isArray(messagesArray) || messagesArray.length === 0) {
        throw new Error('Messages must be a non-empty array')
      }

      for (const msg of messagesArray) {
        if (!msg.role || !msg.content) {
          throw new Error('Each message must have role and content properties')
        }
      }

      // Get context parameters
      const chatId = params._context?.chatId || 'default'
      const conversationId = params.conversationId || params._context?.conversationId
      const infer = params.infer !== undefined ? params.infer : false
      const memoryType = (params.memoryType || 'conversation') as 'conversation' | 'fact'
      const blockId = params.blockId || params._context?.blockId

      // Build metadata
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

      // Prepare request body matching memory-api.ts format
      const body: Record<string, any> = {
        messages: messagesArray,
        user_id: params.userId,
        infer: infer,
        metadata: metadata,
      }

      return body
    },
  },

  transformResponse: async (response) => {
    const data = await response.json()

    // If the API returns an empty array, this might be normal behavior on success
    if (Array.isArray(data) && data.length === 0) {
      return {
        success: true,
        output: {
          memories: [],
        },
      }
    }

    // Handle array response with memory objects
    if (Array.isArray(data) && data.length > 0) {
      // Extract IDs for easy access
      const memoryIds = data.map((memory) => memory.id)

      return {
        success: true,
        output: {
          ids: memoryIds,
          memories: data,
        },
      }
    }

    // Handle non-array responses (single memory object)
    if (data && !Array.isArray(data) && data.id) {
      return {
        success: true,
        output: {
          ids: [data.id],
          memories: [data],
        },
      }
    }

    // Default response format if none of the above match
    return {
      success: true,
      output: {
        memories: Array.isArray(data) ? data : [data],
      },
    }
  },

  outputs: {
    ids: {
      type: 'array',
      description: 'Array of memory IDs that were created',
    },
    memories: {
      type: 'array',
      description: 'Array of memory objects that were created',
    },
  },
}
