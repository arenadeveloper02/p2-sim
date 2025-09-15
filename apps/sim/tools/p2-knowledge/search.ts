import type { P2KnowledgeSearchResponse } from '@/tools/p2-knowledge/types'
import type { ToolConfig } from '@/tools/types'

export const p2KnowledgeSearchTool: ToolConfig<any, P2KnowledgeSearchResponse> = {
  id: 'p2_knowledge_search',
  name: 'P2 Knowledge Search',
  description: 'Search for similar content in a knowledge base using Milvus vector similarity',
  version: '1.0.0',

  params: {
    knowledgeBaseId: {
      type: 'string',
      required: true,
      description: 'ID of the knowledge base to search in',
    },
    query: {
      type: 'string',
      required: false,
      description: 'Search query text (optional when using tag filters)',
    },
    topK: {
      type: 'number',
      required: false,
      description: 'Number of most similar results to return (1-100)',
    },
    tagFilters: {
      type: 'any',
      required: false,
      description: 'Array of tag filters with tagName and tagValue properties',
    },
  },

  request: {
    url: () => '/api/p2-knowledge/search',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const workflowId = params._context?.workflowId

      const requestBody = {
        knowledgeBaseIds: [params.knowledgeBaseId],
        query: params.query,
        topK: params.topK || 10,
        filters: params.tagFilters,
        ...(workflowId && { workflowId }),
      }

      return requestBody
    },
  },

  transformResponse: async (response): Promise<P2KnowledgeSearchResponse> => {
    const result = await response.json()
    const data = result.data || result

    return {
      success: true,
      output: {
        results: data.results || [],
        query: data.query || '',
        knowledgeBaseId: data.knowledgeBaseId || '',
        topK: data.topK || 10,
        totalResults: data.totalResults || 0,
        ...(data.cost && { cost: data.cost }),
      },
    }
  },

  outputs: {
    results: {
      type: 'array',
      description: 'Array of search results with content, metadata, and similarity scores',
    },
    query: {
      type: 'string',
      description: 'The search query used',
    },
    knowledgeBaseId: {
      type: 'string',
      description: 'ID of the knowledge base searched',
    },
    topK: {
      type: 'number',
      description: 'Number of results requested',
    },
    totalResults: {
      type: 'number',
      description: 'Total number of results found',
    },
    cost: {
      type: 'object',
      description: 'Cost information for the search operation',
    },
  },
}
