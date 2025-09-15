import type { P2KnowledgeUploadChunkResponse } from '@/tools/p2-knowledge/types'
import type { ToolConfig } from '@/tools/types'

export const p2KnowledgeUploadChunkTool: ToolConfig<any, P2KnowledgeUploadChunkResponse> = {
  id: 'p2_knowledge_upload_chunk',
  name: 'P2 Knowledge Upload Chunk',
  description: 'Upload a new chunk to a document in a knowledge base using Milvus',
  version: '1.0.0',

  params: {
    knowledgeBaseId: {
      type: 'string',
      required: true,
      description: 'ID of the knowledge base containing the document',
    },
    documentId: {
      type: 'string',
      required: true,
      description: 'ID of the document to upload the chunk to',
    },
    content: {
      type: 'string',
      required: true,
      description: 'Content of the chunk to upload',
    },
  },

  request: {
    url: (params) =>
      `/api/p2-knowledge/${params.knowledgeBaseId}/documents/${params.documentId}/chunks`,
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const workflowId = params._context?.workflowId

      const requestBody = {
        content: params.content,
        enabled: true,
        ...(workflowId && { workflowId }),
      }

      return requestBody
    },
  },

  transformResponse: async (response): Promise<P2KnowledgeUploadChunkResponse> => {
    const result = await response.json()
    const data = result.data || result

    return {
      success: true,
      output: {
        message: 'Successfully uploaded chunk to knowledge base',
        data: {
          chunkId: data.chunkId || data.id || '',
          documentId: data.documentId || '',
          documentName: data.documentName || 'Unknown',
          type: 'chunk',
          enabled: true,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          ...(data.cost && { cost: data.cost }),
        },
      },
    }
  },

  outputs: {
    chunkId: {
      type: 'string',
      description: 'ID of the uploaded chunk',
    },
    documentId: {
      type: 'string',
      description: 'ID of the document the chunk was uploaded to',
    },
    documentName: {
      type: 'string',
      description: 'Name of the document',
    },
    success: {
      type: 'boolean',
      description: 'Whether the upload was successful',
    },
    cost: {
      type: 'object',
      description: 'Cost information for the upload operation',
    },
  },
}
