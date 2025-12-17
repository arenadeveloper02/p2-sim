import type { Mem0Response } from '@/tools/mem0/types'
import type { ToolConfig } from '@/tools/types'

// Search Memories Tool
export const mem0SearchMemoriesTool: ToolConfig<any, Mem0Response> = {
  id: 'mem0_search_memories',
  name: 'Search Memories',
  description: 'Search for memories in Mem0 using semantic search',
  version: '1.0.0',

  params: {
    userId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'User ID to search memories for',
    },
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Search query to find relevant memories',
    },
    conversationId: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Conversation ID to filter search results',
    },
    limit: {
      type: 'number',
      required: false,
      default: 10,
      visibility: 'user-only',
      description: 'Maximum number of results to return',
    },
  },

  request: {
    url: 'https://dev-agent.thearena.ai/mem/search',
    method: 'POST',
    headers: () => ({
      accept: 'application/json',
      'Content-Type': 'application/json',
      Host: '100.20.15.243:8000',
    }),
    body: (params) => {
      // Build filters object - include conversationId if provided
      const filters: Record<string, any> = {}

      if (params.conversationId) {
        filters.conversation_id = params.conversationId
      }

      // Create the request body matching searchMemoryAPI format
      const body: Record<string, any> = {
        query: params.query,
        user_id: params.userId,
      }

      // Add filters if we have any
      if (Object.keys(filters).length > 0) {
        body.filters = filters
      }

      return body
    },
  },

  transformResponse: async (response) => {
    const data = await response.json()

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        success: true,
        output: {
          searchResults: [],
          ids: [],
        },
      }
    }

    if (Array.isArray(data)) {
      const searchResults = data.map((item) => ({
        id: item.id,
        data: { memory: item.memory || '' },
        score: item.score || 0,
      }))

      const ids = data.map((item) => item.id).filter(Boolean)

      return {
        success: true,
        output: {
          searchResults,
          ids,
        },
      }
    }

    return {
      success: true,
      output: {
        searchResults: [],
      },
    }
  },

  outputs: {
    searchResults: {
      type: 'array',
      description: 'Array of search results with memory data, each containing id, data, and score',
    },
    ids: {
      type: 'array',
      description: 'Array of memory IDs found in the search results',
    },
  },
}
