import type { P2KnowledgeCreateKnowledgeBaseResponse } from '@/tools/p2-knowledge/types'
import type { ToolConfig } from '@/tools/types'

export const p2KnowledgeCreateKnowledgeBaseTool: ToolConfig<any, P2KnowledgeCreateKnowledgeBaseResponse> = {
  id: 'p2_knowledge_create_knowledge_base',
  name: 'P2 Knowledge Create Knowledge Base',
  description: 'Create a new knowledge base using Milvus',
  version: '1.0.0',

  params: {
    kbName: {
      type: 'string',
      required: true,
      description: 'Name of the knowledge base',
    },
    kbDescription: {
      type: 'string',
      required: false,
      description: 'Description of the knowledge base',
    },
    chunkingConfig: {
      type: 'number',
      required: false,
      description: 'Maximum chunk size (default: 1024)',
    },
    chunkOverlap: {
      type: 'number',
      required: false,
      description: 'Chunk overlap size (default: 200)',
    },
  },

  request: {
    url: () => '/api/p2-knowledge',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const requestBody = {
        name: params.kbName,
        description: params.kbDescription || '',
        chunkingConfig: {
          maxSize: params.chunkingConfig || 1024,
          minSize: 1,
          overlap: params.chunkOverlap || 200,
        },
        embeddingModel: 'text-embedding-3-small',
        embeddingDimension: 1536,
      }

      return requestBody
    },
  },

  transformResponse: async (response): Promise<P2KnowledgeCreateKnowledgeBaseResponse> => {
    const result = await response.json()
    const data = result.data || result

    return {
      success: true,
      output: {
        message: 'Successfully created P2 knowledge base',
        data: {
          knowledgeBaseId: data.id || '',
          knowledgeBaseName: data.name || '',
          description: data.description || '',
          type: 'p2-knowledge',
          embeddingModel: data.embeddingModel || 'text-embedding-3-small',
          embeddingDimension: data.embeddingDimension || 1536,
          chunkingConfig: data.chunkingConfig || {
            maxSize: 1024,
            minSize: 1,
            overlap: 200,
          },
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        },
      },
    }
  },

  outputs: {
    knowledgeBaseId: {
      type: 'string',
      description: 'ID of the created knowledge base',
    },
    knowledgeBaseName: {
      type: 'string',
      description: 'Name of the created knowledge base',
    },
    success: {
      type: 'boolean',
      description: 'Whether the knowledge base creation was successful',
    },
  },
}
