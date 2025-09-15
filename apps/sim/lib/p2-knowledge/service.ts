import { randomUUID } from 'crypto'
import { createLogger } from '@/lib/logs/console/logger'
import { getMilvusService } from '@/lib/milvus/service'
import { generateEmbeddings } from '@/lib/embeddings/utils'
import { chunkText } from '@/lib/text-processing/chunking'
import type { ChunkingConfig } from '@/lib/knowledge/types'

const logger = createLogger('P2KnowledgeService')

export interface P2KnowledgeDocument {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  knowledgeBaseId: string
  embedding: number[]
  tag1: string
  tag2: string
  tag3: string
  tag4: string
  tag5: string
  tag6: string
  tag7: string
  createdAt: Date
  updatedAt: Date
}

export interface P2KnowledgeSearchResult {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  knowledgeBaseId: string
  distance: number
  tag1: string
  tag2: string
  tag3: string
  tag4: string
  tag5: string
  tag6: string
  tag7: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Create a P2 Knowledge base with Milvus collection
 */
export async function createP2KnowledgeBase(
  knowledgeBaseId: string,
  requestId: string
): Promise<void> {
  try {
    const milvusService = getMilvusService()
    await milvusService.createCollection(knowledgeBaseId)
    
    // Verify collection was created successfully
    const stats = await milvusService.getCollectionStats(knowledgeBaseId)
    logger.info(`[${requestId}] Successfully created P2 Knowledge base with Milvus collection: ${knowledgeBaseId}`, {
      entityCount: stats.entityCount
    })
  } catch (error) {
    logger.error(`[${requestId}] Failed to create P2 Knowledge base:`, error)
    throw new Error(`Failed to create Milvus collection for knowledge base ${knowledgeBaseId}`)
  }
}

/**
 * Process and store document in P2 Knowledge (Milvus only)
 */
export async function processDocumentForP2Knowledge(
  knowledgeBaseId: string,
  documentId: string,
  content: string,
  filename: string,
  chunkingConfig: ChunkingConfig,
  tags: {
    tag1?: string
    tag2?: string
    tag3?: string
    tag4?: string
    tag5?: string
    tag6?: string
    tag7?: string
  } = {},
  requestId: string
): Promise<{
  documentId: string
  filename: string
  chunkCount: number
  embeddingCount: number
}> {
  try {
    const milvusService = getMilvusService()
    
    // Ensure collection exists
    await milvusService.createCollection(knowledgeBaseId)
    
    // Chunk the content
    const chunks = await chunkText(content, chunkingConfig.maxSize, chunkingConfig.overlap)
    
    // Generate embeddings for all chunks using OpenAI
    logger.info(`[${requestId}] Generating embeddings for ${chunks.length} chunks in document: ${filename}`)
    const embeddings = await generateEmbeddings(chunks)
    
    // Create Milvus documents with embeddings
    const milvusDocuments: P2KnowledgeDocument[] = chunks.map((chunk, chunkIndex) => ({
      id: randomUUID(),
      content: chunk,
      documentId,
      chunkIndex,
      knowledgeBaseId,
      embedding: embeddings[chunkIndex] || [],
      tag1: tags.tag1 || '',
      tag2: tags.tag2 || '',
      tag3: tags.tag3 || '',
      tag4: tags.tag4 || '',
      tag5: tags.tag5 || '',
      tag6: tags.tag6 || '',
      tag7: tags.tag7 || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    
    // Insert into Milvus (this is where all embeddings are stored)
    logger.info(`[${requestId}] Inserting ${milvusDocuments.length} chunks with embeddings into Milvus for document: ${filename}`)
    await milvusService.insertDocuments(knowledgeBaseId, milvusDocuments)
    
    return {
      documentId,
      filename,
      chunkCount: chunks.length,
      embeddingCount: embeddings.length,
    }
  } catch (error) {
    logger.error(`[${requestId}] Failed to process document for P2 Knowledge:`, error)
    throw new Error(`Failed to process document ${filename} for P2 Knowledge base ${knowledgeBaseId}`)
  }
}

/**
 * Process and store chunk in P2 Knowledge (Milvus only)
 */
export async function processChunkForP2Knowledge(
  knowledgeBaseId: string,
  documentId: string,
  content: string,
  chunkIndex: number = 0,
  tags: {
    tag1?: string
    tag2?: string
    tag3?: string
    tag4?: string
    tag5?: string
    tag6?: string
    tag7?: string
  } = {},
  requestId: string
): Promise<{
  chunkId: string
  documentId: string
  content: string
  chunkIndex: number
}> {
  try {
    const milvusService = getMilvusService()
    
    // Ensure collection exists
    await milvusService.createCollection(knowledgeBaseId)
    
    // Generate embedding for the chunk using OpenAI
    logger.info(`[${requestId}] Generating embedding for chunk upload in document: ${documentId}`)
    const embeddings = await generateEmbeddings([content])
    const embedding = embeddings[0] || []
    
    // Create Milvus document with embedding
    const chunkId = randomUUID()
    const milvusDocument: P2KnowledgeDocument = {
      id: chunkId,
      content,
      documentId,
      chunkIndex,
      knowledgeBaseId,
      embedding,
      tag1: tags.tag1 || '',
      tag2: tags.tag2 || '',
      tag3: tags.tag3 || '',
      tag4: tags.tag4 || '',
      tag5: tags.tag5 || '',
      tag6: tags.tag6 || '',
      tag7: tags.tag7 || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    // Insert into Milvus (this is where the embedding is stored)
    logger.info(`[${requestId}] Inserting chunk with embedding into Milvus for document: ${documentId}`)
    await milvusService.insertDocuments(knowledgeBaseId, [milvusDocument])
    
    return {
      chunkId,
      documentId,
      content,
      chunkIndex,
    }
  } catch (error) {
    logger.error(`[${requestId}] Failed to process chunk for P2 Knowledge:`, error)
    throw new Error(`Failed to process chunk for P2 Knowledge base ${knowledgeBaseId}`)
  }
}

/**
 * Search P2 Knowledge base using Milvus
 */
export async function searchP2Knowledge(
  knowledgeBaseId: string,
  query: string,
  topK: number = 10,
  tagFilters?: Record<string, string>,
  requestId: string
): Promise<P2KnowledgeSearchResult[]> {
  try {
    const milvusService = getMilvusService()
    
    // Generate query embedding
    logger.info(`[${requestId}] Generating query embedding for P2 Knowledge search`)
    const queryEmbeddings = await generateEmbeddings([query])
    const queryVector = queryEmbeddings[0] || []
    
    // Perform vector search in Milvus
    logger.info(`[${requestId}] Performing vector search in P2 Knowledge base: ${knowledgeBaseId}`)
    const results = await milvusService.searchSimilar(knowledgeBaseId, queryVector, topK, tagFilters)
    
    return results.map((result, index) => ({
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
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    }))
  } catch (error) {
    logger.error(`[${requestId}] Failed to search P2 Knowledge base:`, error)
    throw new Error(`Failed to search P2 Knowledge base ${knowledgeBaseId}`)
  }
}

/**
 * Get P2 Knowledge base statistics from Milvus
 */
export async function getP2KnowledgeBaseStats(
  knowledgeBaseId: string,
  requestId: string
): Promise<{
  entityCount: number
  collectionName: string
  status: string
}> {
  try {
    const milvusService = getMilvusService()
    const stats = await milvusService.getCollectionStats(knowledgeBaseId)
    
    return {
      entityCount: stats.entityCount,
      collectionName: knowledgeBaseId,
      status: 'active',
    }
  } catch (error) {
    logger.error(`[${requestId}] Failed to get P2 Knowledge base stats:`, error)
    return {
      entityCount: 0,
      collectionName: knowledgeBaseId,
      status: 'inactive',
    }
  }
}

/**
 * Delete P2 Knowledge base and its Milvus collection
 */
export async function deleteP2KnowledgeBase(
  knowledgeBaseId: string,
  requestId: string
): Promise<void> {
  try {
    const milvusService = getMilvusService()
    
    // Note: Milvus doesn't have a direct delete collection method in the SDK
    // We would need to implement this or handle it differently
    logger.info(`[${requestId}] P2 Knowledge base ${knowledgeBaseId} marked for deletion`)
    logger.warn(`[${requestId}] Milvus collection ${knowledgeBaseId} should be manually deleted`)
  } catch (error) {
    logger.error(`[${requestId}] Failed to delete P2 Knowledge base:`, error)
    throw new Error(`Failed to delete P2 Knowledge base ${knowledgeBaseId}`)
  }
}
