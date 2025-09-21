import { getMilvusClient } from './client'
import { getCollectionName, ensureCollectionLoaded, type MilvusDocument } from './collections'
import { MILVUS_CONFIG } from './config'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('MilvusOperations')

export interface InsertDocumentsParams {
  knowledgeBaseId: string
  documents: MilvusDocument[]
}

export interface SearchParams {
  knowledgeBaseId: string
  queryVector: number[]
  topK?: number
  filter?: string
  outputFields?: string[]
}

export interface SearchResult {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  tag1?: string
  tag2?: string
  tag3?: string
  tag4?: string
  tag5?: string
  tag6?: string
  tag7?: string
  distance: number
  knowledgeBaseId: string
}

export async function insertDocuments(params: InsertDocumentsParams): Promise<void> {
  const { knowledgeBaseId, documents } = params
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    // Ensure collection is loaded
    await ensureCollectionLoaded(knowledgeBaseId)

    if (documents.length === 0) {
      logger.warn(`No documents to insert for knowledge base ${knowledgeBaseId}`)
      return
    }

    // Convert documents to Milvus format
    const milvusData = {
      collection_name: collectionName,
      data: documents,
    }

    const result = await client.insert(milvusData)
    logger.info(`Inserted ${documents.length} documents into ${collectionName}`, {
      insertCount: result.insert_cnt,
      ids: result.IDs,
    })

  } catch (error) {
    logger.error(`Failed to insert documents into ${collectionName}`, error)
    throw error
  }
}

export async function searchDocuments(params: SearchParams): Promise<SearchResult[]> {
  const {
    knowledgeBaseId,
    queryVector,
    topK = MILVUS_CONFIG.DEFAULT_TOP_K,
    filter,
    outputFields = ['id', 'content', 'documentId', 'chunkIndex', 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'],
  } = params

  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    // Ensure collection is loaded
    await ensureCollectionLoaded(knowledgeBaseId)

    const searchParams = {
      collection_name: collectionName,
      vectors: [queryVector],
      search_params: MILVUS_CONFIG.SEARCH_PARAMS,
      limit: Math.min(topK, MILVUS_CONFIG.MAX_TOP_K),
      metric_type: MILVUS_CONFIG.METRIC_TYPE,
      vector_type: 100, // FLOAT_VECTOR
      output_fields: outputFields,
      ...(filter && { expr: filter }),
    }

    const searchResult = await client.search(searchParams)
    
    if (!searchResult.results || searchResult.results.length === 0) {
      return []
    }

    // Transform results to match expected format
    const results: SearchResult[] = searchResult.results.map((result: any) => ({
      id: result.id,
      content: result.content || '',
      documentId: result.documentId || '',
      chunkIndex: result.chunkIndex || 0,
      tag1: result.tag1 || null,
      tag2: result.tag2 || null,
      tag3: result.tag3 || null,
      tag4: result.tag4 || null,
      tag5: result.tag5 || null,
      tag6: result.tag6 || null,
      tag7: result.tag7 || null,
      distance: result.distance || 1.0,
      knowledgeBaseId,
    }))

    logger.info(`Search completed for ${collectionName}`, {
      queryVectorLength: queryVector.length,
      topK,
      resultsCount: results.length,
    })

    return results

  } catch (error) {
    logger.error(`Failed to search documents in ${collectionName}`, error)
    throw error
  }
}

export async function deleteDocumentsByFilter(knowledgeBaseId: string, filter: string): Promise<void> {
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    await ensureCollectionLoaded(knowledgeBaseId)

    const deleteParams = {
      collection_name: collectionName,
      expr: filter,
    }

    const result = await client.delete(deleteParams)
    logger.info(`Deleted documents from ${collectionName}`, {
      filter,
      deleteCount: result.delete_cnt,
    })

  } catch (error) {
    logger.error(`Failed to delete documents from ${collectionName}`, error)
    throw error
  }
}

export async function getCollectionStats(knowledgeBaseId: string): Promise<any> {
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    const stats = await client.getCollectionStatistics({
      collection_name: collectionName,
    })

    return {
      collectionName,
      rowCount: stats.data?.row_count || 0,
      ...stats.data,
    }

  } catch (error) {
    logger.error(`Failed to get stats for ${collectionName}`, error)
    throw error
  }
}

export function buildTagFilter(filters: Record<string, string>): string | undefined {
  const conditions: string[] = []

  Object.entries(filters).forEach(([key, value]) => {
    if (value && ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'].includes(key)) {
      // Escape single quotes in the value
      const escapedValue = value.replace(/'/g, "''")
      conditions.push(`${key} == '${escapedValue}'`)
    }
  })

  return conditions.length > 0 ? conditions.join(' && ') : undefined
}
