import { MilvusClient } from '@zilliz/milvus2-sdk-node'
import { createLogger } from '@/lib/logs/console/logger'
import { generateEmbeddings } from '@/lib/embeddings/utils'
import { env } from '@/lib/env'

const logger = createLogger('MilvusService')

export interface MilvusConfig {
  host: string
  port: number
  user?: string
  password?: string
  database?: string
}

export interface MilvusDocument {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  knowledgeBaseId: string
  embedding: number[]
  tag1?: string
  tag2?: string
  tag3?: string
  tag4?: string
  tag5?: string
  tag6?: string
  tag7?: string
  createdAt: Date
  updatedAt: Date
}

export interface MilvusSearchResult {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  knowledgeBaseId: string
  distance: number
  tag1?: string
  tag2?: string
  tag3?: string
  tag4?: string
  tag5?: string
  tag6?: string
  tag7?: string
}

export class MilvusService {
  private client: MilvusClient
  private config: MilvusConfig

  constructor(config?: Partial<MilvusConfig>) {
    this.config = {
      host: config?.host || env.MILVUS_HOST || 'localhost',
      port: config?.port || env.MILVUS_PORT || 19530,
      user: config?.user || env.MILVUS_USER,
      password: config?.password || env.MILVUS_PASSWORD,
      database: config?.database || env.MILVUS_DATABASE || 'default',
    }

    this.client = new MilvusClient({
      address: `${this.config.host}:${this.config.port}`,
      username: this.config.user,
      password: this.config.password,
      database: this.config.database,
    })
  }

  /**
   * Create a collection for a knowledge base
   */
  async createCollection(knowledgeBaseId: string): Promise<void> {
    const collectionName = `kb_${knowledgeBaseId}`
    
    try {
      // Check if collection exists
      const hasCollection = await this.client.hasCollection({
        collection_name: collectionName,
      })

      if (hasCollection) {
        logger.info(`Collection ${collectionName} already exists`)
        return
      }

      // Create collection with vector field
      await this.client.createCollection({
        collection_name: collectionName,
        description: `Knowledge base collection for ${knowledgeBaseId}`,
        fields: [
          {
            name: 'id',
            data_type: 'VarChar',
            is_primary_key: true,
            max_length: 255,
          },
          {
            name: 'content',
            data_type: 'VarChar',
            max_length: 65535,
          },
          {
            name: 'documentId',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'chunkIndex',
            data_type: 'Int64',
          },
          {
            name: 'knowledgeBaseId',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'embedding',
            data_type: 'FloatVector',
            dim: 1536, // OpenAI text-embedding-3-small dimension
          },
          {
            name: 'tag1',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag2',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag3',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag4',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag5',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag6',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'tag7',
            data_type: 'VarChar',
            max_length: 255,
          },
          {
            name: 'createdAt',
            data_type: 'Int64',
          },
          {
            name: 'updatedAt',
            data_type: 'Int64',
          },
        ],
      })

      // Create index for vector field
      await this.client.createIndex({
        collection_name: collectionName,
        field_name: 'embedding',
        index_type: 'IVF_FLAT',
        metric_type: 'COSINE',
        params: {
          nlist: 1024,
        },
      })

      // Load collection
      await this.client.loadCollection({
        collection_name: collectionName,
      })

      logger.info(`Created collection ${collectionName} for knowledge base ${knowledgeBaseId}`)
    } catch (error) {
      logger.error(`Failed to create collection ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Insert documents into a collection
   */
  async insertDocuments(
    knowledgeBaseId: string,
    documents: MilvusDocument[]
  ): Promise<void> {
    const collectionName = `kb_${knowledgeBaseId}`

    try {
      // Ensure collection exists
      await this.createCollection(knowledgeBaseId)

      // Prepare data for insertion
      const data = documents.map((doc) => ({
        id: doc.id,
        content: doc.content,
        documentId: doc.documentId,
        chunkIndex: doc.chunkIndex,
        knowledgeBaseId: doc.knowledgeBaseId,
        embedding: doc.embedding,
        tag1: doc.tag1 || '',
        tag2: doc.tag2 || '',
        tag3: doc.tag3 || '',
        tag4: doc.tag4 || '',
        tag5: doc.tag5 || '',
        tag6: doc.tag6 || '',
        tag7: doc.tag7 || '',
        createdAt: doc.createdAt.getTime(),
        updatedAt: doc.updatedAt.getTime(),
      }))

      await this.client.insert({
        collection_name: collectionName,
        data,
      })

      logger.info(`Inserted ${documents.length} documents into collection ${collectionName}`)
    } catch (error) {
      logger.error(`Failed to insert documents into collection ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number = 10,
    filters?: Record<string, string>
  ): Promise<MilvusSearchResult[]> {
    const collectionName = `kb_${knowledgeBaseId}`

    try {
      // Build filter expression
      let filterExpression = ''
      if (filters && Object.keys(filters).length > 0) {
        const filterConditions = Object.entries(filters).map(([key, value]) => {
          if (value.includes('|OR|')) {
            const values = value.split('|OR|')
            const orConditions = values.map(v => `${key} == "${v.trim()}"`)
            return `(${orConditions.join(' or ')})`
          }
          return `${key} == "${value}"`
        })
        filterExpression = filterConditions.join(' and ')
      }

      const searchParams = {
        collection_name: collectionName,
        vector: queryVector,
        limit: topK,
        output_fields: [
          'id',
          'content',
          'documentId',
          'chunkIndex',
          'knowledgeBaseId',
          'tag1',
          'tag2',
          'tag3',
          'tag4',
          'tag5',
          'tag6',
          'tag7',
        ],
        ...(filterExpression && { expr: filterExpression }),
      }

      const results = await this.client.search(searchParams)

      return (results as any).data?.map((result: any) => ({
        id: result.id,
        content: result.content,
        documentId: result.documentId,
        chunkIndex: result.chunkIndex,
        knowledgeBaseId: result.knowledgeBaseId,
        distance: result.distance,
        tag1: result.tag1,
        tag2: result.tag2,
        tag3: result.tag3,
        tag4: result.tag4,
        tag5: result.tag5,
        tag6: result.tag6,
        tag7: result.tag7,
      }))
    } catch (error) {
      logger.error(`Failed to search in collection ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Search using only tag filters (no vector similarity)
   */
  async searchByTags(
    knowledgeBaseId: string,
    filters: Record<string, string>,
    topK: number = 10
  ): Promise<MilvusSearchResult[]> {
    const collectionName = `kb_${knowledgeBaseId}`

    try {
      // Build filter expression
      const filterConditions = Object.entries(filters).map(([key, value]) => {
        if (value.includes('|OR|')) {
          const values = value.split('|OR|')
          const orConditions = values.map(v => `${key} == "${v.trim()}"`)
          return `(${orConditions.join(' or ')})`
        }
        return `${key} == "${value}"`
      })
      const filterExpression = filterConditions.join(' and ')

      const queryParams = {
        collection_name: collectionName,
        expr: filterExpression,
        output_fields: [
          'id',
          'content',
          'documentId',
          'chunkIndex',
          'knowledgeBaseId',
          'tag1',
          'tag2',
          'tag3',
          'tag4',
          'tag5',
          'tag6',
          'tag7',
        ],
        limit: topK,
      }

      const results = await this.client.query(queryParams)

      return (results as any).data?.map((result: any) => ({
        id: result.id,
        content: result.content,
        documentId: result.documentId,
        chunkIndex: result.chunkIndex,
        knowledgeBaseId: result.knowledgeBaseId,
        distance: 0, // No distance for tag-only searches
        tag1: result.tag1,
        tag2: result.tag2,
        tag3: result.tag3,
        tag4: result.tag4,
        tag5: result.tag5,
        tag6: result.tag6,
        tag7: result.tag7,
      }))
    } catch (error) {
      logger.error(`Failed to search by tags in collection ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Delete documents by IDs
   */
  async deleteDocuments(knowledgeBaseId: string, documentIds: string[]): Promise<void> {
    const collectionName = `kb_${knowledgeBaseId}`

    try {
      const deleteExpression = `documentId in [${documentIds.map(id => `"${id}"`).join(', ')}]`

      await this.client.deleteEntities({
        collection_name: collectionName,
        expr: deleteExpression,
      })

      logger.info(`Deleted documents with IDs: ${documentIds.join(', ')} from collection ${collectionName}`)
    } catch (error) {
      logger.error(`Failed to delete documents from collection ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(knowledgeBaseId: string): Promise<{ entityCount: number }> {
    const collectionName = `kb_${knowledgeBaseId}`

    try {
      const stats = await this.client.getCollectionStatistics({
        collection_name: collectionName,
      })

      return {
        entityCount: stats.data.row_count,
      }
    } catch (error) {
      logger.error(`Failed to get collection stats for ${collectionName}:`, error)
      throw error
    }
  }

  /**
   * Close the Milvus client connection
   */
  async close(): Promise<void> {
    try {
      await this.client.closeConnection()
      logger.info('Milvus client connection closed')
    } catch (error) {
      logger.error('Failed to close Milvus client connection:', error)
      throw error
    }
  }
}

// Singleton instance
let milvusService: MilvusService | null = null

export function getMilvusService(): MilvusService {
  if (!milvusService) {
    milvusService = new MilvusService()
  }
  return milvusService
}
