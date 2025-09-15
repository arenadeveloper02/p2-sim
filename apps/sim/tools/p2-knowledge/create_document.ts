import type { P2KnowledgeCreateDocumentResponse } from '@/tools/p2-knowledge/types'
import type { ToolConfig } from '@/tools/types'

export const p2KnowledgeCreateDocumentTool: ToolConfig<any, P2KnowledgeCreateDocumentResponse> = {
  id: 'p2_knowledge_create_document',
  name: 'P2 Knowledge Create Document',
  description: 'Create a new document in a knowledge base using Milvus',
  version: '1.0.0',

  params: {
    knowledgeBaseId: {
      type: 'string',
      required: true,
      description: 'ID of the knowledge base containing the document',
    },
    name: {
      type: 'string',
      required: true,
      description: 'Name of the document',
    },
    content: {
      type: 'string',
      required: true,
      description: 'Content of the document',
    },
    tag1: {
      type: 'string',
      required: false,
      description: 'Tag 1 value for the document',
    },
    tag2: {
      type: 'string',
      required: false,
      description: 'Tag 2 value for the document',
    },
    tag3: {
      type: 'string',
      required: false,
      description: 'Tag 3 value for the document',
    },
    tag4: {
      type: 'string',
      required: false,
      description: 'Tag 4 value for the document',
    },
    tag5: {
      type: 'string',
      required: false,
      description: 'Tag 5 value for the document',
    },
    tag6: {
      type: 'string',
      required: false,
      description: 'Tag 6 value for the document',
    },
    tag7: {
      type: 'string',
      required: false,
      description: 'Tag 7 value for the document',
    },
    documentTagsData: {
      type: 'array',
      required: false,
      description: 'Structured tag data with names, types, and values',
    },
  },

  request: {
    url: (params) => `/api/p2-knowledge/${params.knowledgeBaseId}/documents`,
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const workflowId = params._context?.workflowId

      // Create data URI for the content
      const contentBytes = new TextEncoder().encode(params.content).length
      const dataUri = `data:text/plain;base64,${Buffer.from(params.content).toString('base64')}`

      // Process document tags
      let tagData: Record<string, string> = {}
      if (params.documentTagsData && Array.isArray(params.documentTagsData)) {
        params.documentTagsData.forEach((tag: any) => {
          if (tag.name && tag.value) {
            tagData[tag.name] = tag.value
          }
        })
      } else {
        // Fallback to individual tag parameters
        if (params.tag1) tagData.tag1 = params.tag1
        if (params.tag2) tagData.tag2 = params.tag2
        if (params.tag3) tagData.tag3 = params.tag3
        if (params.tag4) tagData.tag4 = params.tag4
        if (params.tag5) tagData.tag5 = params.tag5
        if (params.tag6) tagData.tag6 = params.tag6
        if (params.tag7) tagData.tag7 = params.tag7
      }

      const documentName = params.name.endsWith('.txt') ? params.name : `${params.name}.txt`

      const documents = [
        {
          filename: documentName,
          fileUrl: dataUri,
          fileSize: contentBytes,
          mimeType: 'text/plain',
          ...tagData,
        },
      ]

      const requestBody = {
        documents: documents,
        processingOptions: {
          chunkSize: 1024,
          minCharactersPerChunk: 1,
          chunkOverlap: 200,
          recipe: 'default',
          lang: 'en',
        },
        bulk: true,
        ...(workflowId && { workflowId }),
      }

      return requestBody
    },
  },

  transformResponse: async (response): Promise<P2KnowledgeCreateDocumentResponse> => {
    const result = await response.json()
    const data = result.data || result
    const documentsCreated = data.documentsCreated || []

    // Handle multiple documents response
    const uploadCount = documentsCreated.length
    const firstDocument = documentsCreated[0]

    return {
      success: true,
      output: {
        message:
          uploadCount > 1
            ? `Successfully created ${uploadCount} documents in knowledge base`
            : `Successfully created document in knowledge base`,
        data: {
          documentId: firstDocument?.documentId || firstDocument?.id || '',
          documentName:
            uploadCount > 1 ? `${uploadCount} documents` : firstDocument?.filename || 'Unknown',
          type: 'document',
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    }
  },

  outputs: {
    data: {
      type: 'object',
      description: 'Document creation result data',
    },
    success: {
      type: 'boolean',
      description: 'Whether the document creation was successful',
    },
  },
}
