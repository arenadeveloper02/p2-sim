export interface P2KnowledgeSearchResponse {
  success: boolean
  output: {
    results: Array<{
      documentId: string
      documentName?: string
      content: string
      chunkIndex: number
      metadata: Record<string, any>
      similarity: number
    }>
    query: string
    knowledgeBaseId: string
    topK: number
    totalResults: number
    cost?: {
      input: number
      output: number
      total: number
      tokens: {
        prompt: number
        completion: number
        total: number
      }
      model: string
      pricing: {
        input: number
        output: number
      }
    }
  }
}

export interface P2KnowledgeUploadChunkResponse {
  success: boolean
  output: {
    message: string
    data: {
      chunkId: string
      documentId: string
      documentName: string
      type: string
      enabled: boolean
      createdAt: string
      updatedAt: string
      cost?: {
        input: number
        output: number
        total: number
        tokens: {
          prompt: number
          completion: number
          total: number
        }
        model: string
        pricing: {
          input: number
          output: number
        }
      }
    }
  }
}

export interface P2KnowledgeCreateDocumentResponse {
  success: boolean
  output: {
    message: string
    data: {
      documentId: string
      documentName: string
      type: string
      enabled: boolean
      createdAt: string
      updatedAt: string
    }
  }
}

export interface P2KnowledgeSearchParams {
  knowledgeBaseId: string
  query?: string
  topK?: number
  tagFilters?: any
}

export interface P2KnowledgeUploadChunkParams {
  knowledgeBaseId: string
  documentId: string
  content: string
}

export interface P2KnowledgeCreateDocumentParams {
  knowledgeBaseId: string
  name: string
  content: string
  documentTags?: string
}

export interface P2KnowledgeCreateDocumentResult {
  documentId: string
  documentName: string
  type: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface P2KnowledgeCreateKnowledgeBaseResponse {
  success: boolean
  output: {
    message: string
    data: {
      knowledgeBaseId: string
      knowledgeBaseName: string
      description: string
      type: string
      embeddingModel: string
      embeddingDimension: number
      chunkingConfig: {
        maxSize: number
        minSize: number
        overlap: number
      }
      createdAt: string
      updatedAt: string
    }
  }
}

export interface P2KnowledgeCreateKnowledgeBaseParams {
  kbName: string
  kbDescription?: string
  chunkingConfig?: number
  chunkOverlap?: number
}
