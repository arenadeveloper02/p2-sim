import { searchDocuments, buildTagFilter, type SearchResult as MilvusSearchResult } from './operations'
import { createLogger } from '@/lib/logs/console/logger'
import { generateSearchEmbedding } from '@/lib/embeddings/utils'

const logger = createLogger('MilvusSearch')

export interface SearchParams {
  knowledgeBaseIds: string[]
  query?: string
  topK?: number
  distanceThreshold?: number
  filters?: Record<string, string>
}

export interface SearchResult {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  tag1?: string | null
  tag2?: string | null
  tag3?: string | null
  tag4?: string | null
  tag5?: string | null
  tag6?: string | null
  tag7?: string | null
  distance: number
  knowledgeBaseId: string
}

/**
 * Search across multiple knowledge bases using Milvus
 */
export async function searchKnowledgeBases(params: SearchParams): Promise<SearchResult[]> {
  const { knowledgeBaseIds, query, topK = 10, distanceThreshold = 0.5, filters } = params

  if (knowledgeBaseIds.length === 0) {
    return []
  }

  // Handle tag-only search
  if (!query && filters && Object.keys(filters).length > 0) {
    return handleTagOnlySearch({ knowledgeBaseIds, filters, topK })
  }

  // Handle vector search (with or without tag filters)
  if (query) {
    return handleVectorSearch({
      knowledgeBaseIds,
      query,
      topK,
      distanceThreshold,
      filters,
    })
  }

  logger.warn('No query or filters provided for search')
  return []
}

/**
 * Handle tag-only search across multiple knowledge bases
 */
async function handleTagOnlySearch(params: {
  knowledgeBaseIds: string[]
  filters: Record<string, string>
  topK: number
}): Promise<SearchResult[]> {
  const { knowledgeBaseIds, filters, topK } = params
  const results: SearchResult[] = []

  // Build tag filter expression
  const tagFilter = buildTagFilter(filters)
  if (!tagFilter) {
    return []
  }

  // Search each knowledge base
  for (const knowledgeBaseId of knowledgeBaseIds) {
    try {
      // For tag-only search, we need to use a dummy query vector
      // This is a limitation of Milvus - we can't do pure metadata filtering without a vector search
      // We'll use a zero vector and set a very high distance threshold
      const dummyVector = new Array(1536).fill(0)
      
      const kbResults = await searchDocuments({
        knowledgeBaseId,
        queryVector: dummyVector,
        topK,
        filter: tagFilter,
        outputFields: ['id', 'content', 'documentId', 'chunkIndex', 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'],
      })

      results.push(...kbResults.map(result => ({
        ...result,
        distance: 0, // Set distance to 0 for tag-only results
      })))
    } catch (error) {
      logger.error(`Failed to search knowledge base ${knowledgeBaseId} with tags`, error)
    }
  }

  // Sort by relevance (for tag-only search, we can sort by content length or keep original order)
  return results.slice(0, topK)
}

/**
 * Handle vector search with optional tag filters
 */
async function handleVectorSearch(params: {
  knowledgeBaseIds: string[]
  query: string
  topK: number
  distanceThreshold: number
  filters?: Record<string, string>
}): Promise<SearchResult[]> {
  const { knowledgeBaseIds, query, topK, distanceThreshold, filters } = params

  // Generate query embedding
  const queryEmbedding = await generateSearchEmbedding(query)
  if (!queryEmbedding || queryEmbedding.length === 0) {
    logger.warn('Failed to generate query embedding')
    return []
  }

  const results: SearchResult[] = []
  const tagFilter = filters ? buildTagFilter(filters) : undefined

  // Search each knowledge base
  for (const knowledgeBaseId of knowledgeBaseIds) {
    try {
      const kbResults = await searchDocuments({
        knowledgeBaseId,
        queryVector: queryEmbedding,
        topK: Math.ceil(topK / knowledgeBaseIds.length) + 5, // Get more results per KB to ensure we have enough after filtering
        filter: tagFilter,
        outputFields: ['id', 'content', 'documentId', 'chunkIndex', 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'],
      })

      results.push(...kbResults)
    } catch (error) {
      logger.error(`Failed to search knowledge base ${knowledgeBaseId}`, error)
    }
  }

  // Filter by distance threshold and sort by relevance
  const filteredResults = results
    .filter(result => result.distance <= distanceThreshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topK)

  logger.info(`Vector search completed`, {
    query,
    knowledgeBaseCount: knowledgeBaseIds.length,
    totalResults: results.length,
    filteredResults: filteredResults.length,
    distanceThreshold,
  })

  return filteredResults
}

/**
 * Search a single knowledge base
 */
export async function searchSingleKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  options: {
    topK?: number
    distanceThreshold?: number
    filters?: Record<string, string>
  } = {}
): Promise<SearchResult[]> {
  return searchKnowledgeBases({
    knowledgeBaseIds: [knowledgeBaseId],
    query,
    ...options,
  })
}
