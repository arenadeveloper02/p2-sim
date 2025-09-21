import { DataType } from '@zilliz/milvus2-sdk-node'
import { getMilvusClient } from './client'
import { MILVUS_CONFIG } from './config'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('MilvusCollections')

export interface MilvusDocument {
  id: string
  knowledgeBaseId: string
  documentId: string
  chunkIndex: number
  chunkHash: string
  content: string
  contentLength: number
  tokenCount: number
  embedding: number[]
  embeddingModel: string
  startOffset: number
  endOffset: number
  tag1?: string
  tag2?: string
  tag3?: string
  tag4?: string
  tag5?: string
  tag6?: string
  tag7?: string
  createdAt: number
  updatedAt: number
}

export function getCollectionName(knowledgeBaseId: string): string {
  return `${MILVUS_CONFIG.COLLECTION_PREFIX}${knowledgeBaseId.replace(/-/g, '_')}`
}

export async function createKnowledgeBaseCollection(knowledgeBaseId: string): Promise<void> {
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    // Check if collection already exists
    const hasCollection = await client.hasCollection({ collection_name: collectionName })
    if (hasCollection.value) {
      logger.info(`Collection ${collectionName} already exists`)
      return
    }

    // Define collection schema
    const schema = {
      collection_name: collectionName,
      description: `Knowledge base embeddings for ${knowledgeBaseId}`,
      fields: [
        {
          name: 'id',
          description: 'Primary key',
          data_type: DataType.VarChar,
          max_length: 255,
          is_primary_key: true,
        },
        {
          name: 'knowledgeBaseId',
          description: 'Knowledge base ID',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'documentId',
          description: 'Document ID',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'chunkIndex',
          description: 'Chunk index within document',
          data_type: DataType.Int64,
        },
        {
          name: 'chunkHash',
          description: 'Content hash for deduplication',
          data_type: DataType.VarChar,
          max_length: 64,
        },
        {
          name: 'content',
          description: 'Chunk content text',
          data_type: DataType.VarChar,
          max_length: 65535,
        },
        {
          name: 'contentLength',
          description: 'Content length in characters',
          data_type: DataType.Int64,
        },
        {
          name: 'tokenCount',
          description: 'Token count for billing',
          data_type: DataType.Int64,
        },
        {
          name: 'embedding',
          description: 'Vector embedding',
          data_type: DataType.FloatVector,
          dim: MILVUS_CONFIG.EMBEDDING_DIMENSION,
        },
        {
          name: 'embeddingModel',
          description: 'Model used for embedding',
          data_type: DataType.VarChar,
          max_length: 100,
        },
        {
          name: 'startOffset',
          description: 'Start position in original document',
          data_type: DataType.Int64,
        },
        {
          name: 'endOffset',
          description: 'End position in original document',
          data_type: DataType.Int64,
        },
        {
          name: 'tag1',
          description: 'Tag field 1',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag2',
          description: 'Tag field 2',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag3',
          description: 'Tag field 3',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag4',
          description: 'Tag field 4',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag5',
          description: 'Tag field 5',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag6',
          description: 'Tag field 6',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'tag7',
          description: 'Tag field 7',
          data_type: DataType.VarChar,
          max_length: 255,
        },
        {
          name: 'createdAt',
          description: 'Creation timestamp',
          data_type: DataType.Int64,
        },
        {
          name: 'updatedAt',
          description: 'Update timestamp',
          data_type: DataType.Int64,
        },
      ],
    }

    // Create collection
    await client.createCollection(schema)
    logger.info(`Created collection ${collectionName}`)

    // Create HNSW index on embedding field
    const indexParams = {
      collection_name: collectionName,
      field_name: 'embedding',
      index_type: MILVUS_CONFIG.INDEX_TYPE,
      metric_type: MILVUS_CONFIG.METRIC_TYPE,
      params: MILVUS_CONFIG.INDEX_PARAMS,
    }

    await client.createIndex(indexParams)
    logger.info(`Created HNSW index on collection ${collectionName}`)

    // Load collection into memory
    await client.loadCollection({ collection_name: collectionName })
    logger.info(`Loaded collection ${collectionName} into memory`)

  } catch (error) {
    logger.error(`Failed to create collection ${collectionName}`, error)
    throw error
  }
}

export async function dropKnowledgeBaseCollection(knowledgeBaseId: string): Promise<void> {
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    const hasCollection = await client.hasCollection({ collection_name: collectionName })
    if (hasCollection.value) {
      await client.dropCollection({ collection_name: collectionName })
      logger.info(`Dropped collection ${collectionName}`)
    }
  } catch (error) {
    logger.error(`Failed to drop collection ${collectionName}`, error)
    throw error
  }
}

export async function ensureCollectionLoaded(knowledgeBaseId: string): Promise<void> {
  const client = getMilvusClient()
  const collectionName = getCollectionName(knowledgeBaseId)

  try {
    const loadState = await client.getLoadState({ collection_name: collectionName })
    if (loadState.state !== 'LoadStateLoaded') {
      await client.loadCollection({ collection_name: collectionName })
      logger.info(`Loaded collection ${collectionName} into memory`)
    }
  } catch (error) {
    logger.error(`Failed to ensure collection ${collectionName} is loaded`, error)
    throw error
  }
}
