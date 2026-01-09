import { db } from '@sim/db'
import { document, embedding } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { env } from '@/lib/core/config/env'
import type { StructuredFilter } from '@/lib/knowledge/types'

const logger = createLogger('KnowledgeSearchUtils')

export async function getDocumentNamesByIds(
  documentIds: string[]
): Promise<Record<string, string>> {
  if (documentIds.length === 0) {
    return {}
  }

  const uniqueIds = [...new Set(documentIds)]
  const documents = await db
    .select({
      id: document.id,
      filename: document.filename,
    })
    .from(document)
    .where(and(inArray(document.id, uniqueIds), isNull(document.deletedAt)))

  const documentNameMap: Record<string, string> = {}
  documents.forEach((doc) => {
    documentNameMap[doc.id] = doc.filename
  })

  return documentNameMap
}

export interface SearchResult {
  id: string
  content: string
  documentId: string
  chunkIndex: number
  // Text tags
  tag1: string | null
  tag2: string | null
  tag3: string | null
  tag4: string | null
  tag5: string | null
  tag6: string | null
  tag7: string | null
  // Number tags (5 slots)
  number1: number | null
  number2: number | null
  number3: number | null
  number4: number | null
  number5: number | null
  // Date tags (2 slots)
  date1: Date | null
  date2: Date | null
  // Boolean tags (3 slots)
  boolean1: boolean | null
  boolean2: boolean | null
  boolean3: boolean | null
  distance: number
  knowledgeBaseId: string
}

export interface SearchParams {
  knowledgeBaseIds: string[]
  topK: number
  structuredFilters?: StructuredFilter[]
  queryVector?: string
  distanceThreshold?: number
}

export interface RerankConfig {
  enabled?: boolean
  model?: string
  topN?: number
  requestId?: string
}

// Use shared embedding utility
export { generateSearchEmbedding } from '@/lib/knowledge/embeddings'

/** All valid tag slot keys */
const TAG_SLOT_KEYS = [
  // Text tags (7 slots)
  'tag1',
  'tag2',
  'tag3',
  'tag4',
  'tag5',
  'tag6',
  'tag7',
  // Number tags (5 slots)
  'number1',
  'number2',
  'number3',
  'number4',
  'number5',
  // Date tags (2 slots)
  'date1',
  'date2',
  // Boolean tags (3 slots)
  'boolean1',
  'boolean2',
  'boolean3',
] as const

type TagSlotKey = (typeof TAG_SLOT_KEYS)[number]

function isTagSlotKey(key: string): key is TagSlotKey {
  return TAG_SLOT_KEYS.includes(key as TagSlotKey)
}

/** Common fields selected for search results */
const getSearchResultFields = (distanceExpr: any) => ({
  id: embedding.id,
  content: embedding.content,
  documentId: embedding.documentId,
  chunkIndex: embedding.chunkIndex,
  // Text tags
  tag1: embedding.tag1,
  tag2: embedding.tag2,
  tag3: embedding.tag3,
  tag4: embedding.tag4,
  tag5: embedding.tag5,
  tag6: embedding.tag6,
  tag7: embedding.tag7,
  // Number tags (5 slots)
  number1: embedding.number1,
  number2: embedding.number2,
  number3: embedding.number3,
  number4: embedding.number4,
  number5: embedding.number5,
  // Date tags (2 slots)
  date1: embedding.date1,
  date2: embedding.date2,
  // Boolean tags (3 slots)
  boolean1: embedding.boolean1,
  boolean2: embedding.boolean2,
  boolean3: embedding.boolean3,
  distance: distanceExpr,
  knowledgeBaseId: embedding.knowledgeBaseId,
})

/**
 * Build a single SQL condition for a filter
 */
function buildFilterCondition(filter: StructuredFilter, embeddingTable: any) {
  const { tagSlot, fieldType, operator, value, valueTo } = filter

  if (!isTagSlotKey(tagSlot)) {
    logger.debug(`[getStructuredTagFilters] Unknown tag slot: ${tagSlot}`)
    return null
  }

  const column = embeddingTable[tagSlot]
  if (!column) return null

  logger.debug(
    `[getStructuredTagFilters] Processing ${tagSlot} (${fieldType}) ${operator} ${value}`
  )

  // Handle text operators
  if (fieldType === 'text') {
    const stringValue = String(value)
    switch (operator) {
      case 'eq':
        return sql`LOWER(${column}) = LOWER(${stringValue})`
      case 'neq':
        return sql`LOWER(${column}) != LOWER(${stringValue})`
      case 'contains':
        return sql`LOWER(${column}) LIKE LOWER(${`%${stringValue}%`})`
      case 'not_contains':
        return sql`LOWER(${column}) NOT LIKE LOWER(${`%${stringValue}%`})`
      case 'starts_with':
        return sql`LOWER(${column}) LIKE LOWER(${`${stringValue}%`})`
      case 'ends_with':
        return sql`LOWER(${column}) LIKE LOWER(${`%${stringValue}`})`
      default:
        return sql`LOWER(${column}) = LOWER(${stringValue})`
    }
  }

  // Handle number operators
  if (fieldType === 'number') {
    const numValue = typeof value === 'number' ? value : Number.parseFloat(String(value))
    if (Number.isNaN(numValue)) return null

    switch (operator) {
      case 'eq':
        return sql`${column} = ${numValue}`
      case 'neq':
        return sql`${column} != ${numValue}`
      case 'gt':
        return sql`${column} > ${numValue}`
      case 'gte':
        return sql`${column} >= ${numValue}`
      case 'lt':
        return sql`${column} < ${numValue}`
      case 'lte':
        return sql`${column} <= ${numValue}`
      case 'between':
        if (valueTo !== undefined) {
          const numValueTo =
            typeof valueTo === 'number' ? valueTo : Number.parseFloat(String(valueTo))
          if (Number.isNaN(numValueTo)) return sql`${column} = ${numValue}`
          return sql`${column} >= ${numValue} AND ${column} <= ${numValueTo}`
        }
        return sql`${column} = ${numValue}`
      default:
        return sql`${column} = ${numValue}`
    }
  }

  // Handle date operators - expects YYYY-MM-DD format from frontend
  if (fieldType === 'date') {
    const dateStr = String(value)
    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      logger.debug(`[getStructuredTagFilters] Invalid date format: ${dateStr}, expected YYYY-MM-DD`)
      return null
    }

    switch (operator) {
      case 'eq':
        return sql`${column}::date = ${dateStr}::date`
      case 'neq':
        return sql`${column}::date != ${dateStr}::date`
      case 'gt':
        return sql`${column}::date > ${dateStr}::date`
      case 'gte':
        return sql`${column}::date >= ${dateStr}::date`
      case 'lt':
        return sql`${column}::date < ${dateStr}::date`
      case 'lte':
        return sql`${column}::date <= ${dateStr}::date`
      case 'between':
        if (valueTo !== undefined) {
          const dateStrTo = String(valueTo)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStrTo)) {
            return sql`${column}::date = ${dateStr}::date`
          }
          return sql`${column}::date >= ${dateStr}::date AND ${column}::date <= ${dateStrTo}::date`
        }
        return sql`${column}::date = ${dateStr}::date`
      default:
        return sql`${column}::date = ${dateStr}::date`
    }
  }

  // Handle boolean operators
  if (fieldType === 'boolean') {
    const boolValue = value === true || value === 'true'
    switch (operator) {
      case 'eq':
        return sql`${column} = ${boolValue}`
      case 'neq':
        return sql`${column} != ${boolValue}`
      default:
        return sql`${column} = ${boolValue}`
    }
  }

  // Fallback to equality
  return sql`${column} = ${value}`
}

/**
 * Build SQL conditions from structured filters with operator support
 * - Same tag multiple times: OR logic
 * - Different tags: AND logic
 */
function getStructuredTagFilters(filters: StructuredFilter[], embeddingTable: any) {
  // Group filters by tagSlot
  const filtersBySlot = new Map<string, StructuredFilter[]>()
  for (const filter of filters) {
    const slot = filter.tagSlot
    if (!filtersBySlot.has(slot)) {
      filtersBySlot.set(slot, [])
    }
    filtersBySlot.get(slot)!.push(filter)
  }

  // Build conditions: OR within same slot, AND across different slots
  const conditions: ReturnType<typeof sql>[] = []

  for (const [slot, slotFilters] of filtersBySlot) {
    const slotConditions = slotFilters
      .map((f) => buildFilterCondition(f, embeddingTable))
      .filter((c): c is ReturnType<typeof sql> => c !== null)

    if (slotConditions.length === 0) continue

    if (slotConditions.length === 1) {
      // Single condition for this slot
      conditions.push(slotConditions[0])
    } else {
      // Multiple conditions for same slot - OR them together
      logger.debug(
        `[getStructuredTagFilters] OR'ing ${slotConditions.length} conditions for ${slot}`
      )
      conditions.push(sql`(${sql.join(slotConditions, sql` OR `)})`)
    }
  }

  return conditions
}

export function getQueryStrategy(kbCount: number, topK: number) {
  const useParallel = kbCount > 4 || (kbCount > 2 && topK > 50)
  const distanceThreshold = kbCount > 3 ? 0.8 : 1.0
  const parallelLimit = Math.ceil(topK / kbCount) + 5

  return {
    useParallel,
    distanceThreshold,
    parallelLimit,
    singleQueryOptimized: kbCount <= 2,
  }
}

async function executeTagFilterQuery(
  knowledgeBaseIds: string[],
  structuredFilters: StructuredFilter[]
): Promise<{ id: string }[]> {
  const tagFilterConditions = getStructuredTagFilters(structuredFilters, embedding)

  if (knowledgeBaseIds.length === 1) {
    return await db
      .select({ id: embedding.id })
      .from(embedding)
      .innerJoin(document, eq(embedding.documentId, document.id))
      .where(
        and(
          eq(embedding.knowledgeBaseId, knowledgeBaseIds[0]),
          eq(embedding.enabled, true),
          isNull(document.deletedAt),
          ...tagFilterConditions
        )
      )
  }
  return await db
    .select({ id: embedding.id })
    .from(embedding)
    .innerJoin(document, eq(embedding.documentId, document.id))
    .where(
      and(
        inArray(embedding.knowledgeBaseId, knowledgeBaseIds),
        eq(embedding.enabled, true),
        isNull(document.deletedAt),
        ...tagFilterConditions
      )
    )
}

async function executeVectorSearchOnIds(
  embeddingIds: string[],
  queryVector: string,
  topK: number,
  distanceThreshold: number
): Promise<SearchResult[]> {
  if (embeddingIds.length === 0) {
    return []
  }

  return await db
    .select(
      getSearchResultFields(
        sql<number>`${embedding.embedding} <=> ${queryVector}::vector`.as('distance')
      )
    )
    .from(embedding)
    .innerJoin(document, eq(embedding.documentId, document.id))
    .where(
      and(
        inArray(embedding.id, embeddingIds),
        isNull(document.deletedAt),
        sql`${embedding.embedding} <=> ${queryVector}::vector < ${distanceThreshold}`
      )
    )
    .orderBy(sql`${embedding.embedding} <=> ${queryVector}::vector`)
    .limit(topK)
}

export async function handleTagOnlySearch(params: SearchParams): Promise<SearchResult[]> {
  const { knowledgeBaseIds, topK, structuredFilters } = params

  if (!structuredFilters || structuredFilters.length === 0) {
    throw new Error('Tag filters are required for tag-only search')
  }

  logger.debug(`[handleTagOnlySearch] Executing tag-only search with filters:`, structuredFilters)

  const strategy = getQueryStrategy(knowledgeBaseIds.length, topK)
  const tagFilterConditions = getStructuredTagFilters(structuredFilters, embedding)

  if (strategy.useParallel) {
    // Parallel approach for many KBs
    const parallelLimit = Math.ceil(topK / knowledgeBaseIds.length) + 5

    const queryPromises = knowledgeBaseIds.map(async (kbId) => {
      return await db
        .select(getSearchResultFields(sql<number>`0`.as('distance')))
        .from(embedding)
        .innerJoin(document, eq(embedding.documentId, document.id))
        .where(
          and(
            eq(embedding.knowledgeBaseId, kbId),
            eq(embedding.enabled, true),
            isNull(document.deletedAt),
            ...tagFilterConditions
          )
        )
        .limit(parallelLimit)
    })

    const parallelResults = await Promise.all(queryPromises)
    return parallelResults.flat().slice(0, topK)
  }
  // Single query for fewer KBs
  return await db
    .select(getSearchResultFields(sql<number>`0`.as('distance')))
    .from(embedding)
    .innerJoin(document, eq(embedding.documentId, document.id))
    .where(
      and(
        inArray(embedding.knowledgeBaseId, knowledgeBaseIds),
        eq(embedding.enabled, true),
        isNull(document.deletedAt),
        ...tagFilterConditions
      )
    )
    .limit(topK)
}

export async function handleVectorOnlySearch(params: SearchParams): Promise<SearchResult[]> {
  const { knowledgeBaseIds, topK, queryVector, distanceThreshold } = params

  if (!queryVector || !distanceThreshold) {
    throw new Error('Query vector and distance threshold are required for vector-only search')
  }

  logger.debug(`[handleVectorOnlySearch] Executing vector-only search`)

  const strategy = getQueryStrategy(knowledgeBaseIds.length, topK)

  const distanceExpr = sql<number>`${embedding.embedding} <=> ${queryVector}::vector`.as('distance')

  if (strategy.useParallel) {
    // Parallel approach for many KBs
    const parallelLimit = Math.ceil(topK / knowledgeBaseIds.length) + 5

    const queryPromises = knowledgeBaseIds.map(async (kbId) => {
      return await db
        .select(getSearchResultFields(distanceExpr))
        .from(embedding)
        .innerJoin(document, eq(embedding.documentId, document.id))
        .where(
          and(
            eq(embedding.knowledgeBaseId, kbId),
            eq(embedding.enabled, true),
            isNull(document.deletedAt),
            sql`${embedding.embedding} <=> ${queryVector}::vector < ${distanceThreshold}`
          )
        )
        .orderBy(sql`${embedding.embedding} <=> ${queryVector}::vector`)
        .limit(parallelLimit)
    })

    const parallelResults = await Promise.all(queryPromises)
    const allResults = parallelResults.flat()
    return allResults.sort((a, b) => a.distance - b.distance).slice(0, topK)
  }
  // Single query for fewer KBs
  return await db
    .select(getSearchResultFields(distanceExpr))
    .from(embedding)
    .innerJoin(document, eq(embedding.documentId, document.id))
    .where(
      and(
        inArray(embedding.knowledgeBaseId, knowledgeBaseIds),
        eq(embedding.enabled, true),
        isNull(document.deletedAt),
        sql`${embedding.embedding} <=> ${queryVector}::vector < ${distanceThreshold}`
      )
    )
    .orderBy(sql`${embedding.embedding} <=> ${queryVector}::vector`)
    .limit(topK)
}

export async function handleTagAndVectorSearch(params: SearchParams): Promise<SearchResult[]> {
  const { knowledgeBaseIds, topK, structuredFilters, queryVector, distanceThreshold } = params

  if (!structuredFilters || structuredFilters.length === 0) {
    throw new Error('Tag filters are required for tag and vector search')
  }
  if (!queryVector || !distanceThreshold) {
    throw new Error('Query vector and distance threshold are required for tag and vector search')
  }

  logger.debug(
    `[handleTagAndVectorSearch] Executing tag + vector search with filters:`,
    structuredFilters
  )

  // Step 1: Filter by tags first
  const tagFilteredIds = await executeTagFilterQuery(knowledgeBaseIds, structuredFilters)

  if (tagFilteredIds.length === 0) {
    logger.debug(`[handleTagAndVectorSearch] No results found after tag filtering`)
    return []
  }

  logger.debug(
    `[handleTagAndVectorSearch] Found ${tagFilteredIds.length} results after tag filtering`
  )

  // Step 2: Perform vector search only on tag-filtered results
  return await executeVectorSearchOnIds(
    tagFilteredIds.map((r) => r.id),
    queryVector,
    topK,
    distanceThreshold
  )
}

/**
 * Apply LLM-based reranking on search results using the Cohere rerank API.
 */
export async function rerankSearchResults(
  query: string,
  results: SearchResult[],
  rerankConfig?: RerankConfig
): Promise<SearchResult[]> {
  const rerankEnabled = rerankConfig?.enabled ?? true

  if (!rerankEnabled) {
    return results
  }

  if (!query?.trim() || results.length === 0) {
    return results
  }

  const apiKey = env.COHERE_API_KEY || 'FtSOTZsLWqFsfgvPlZC2UawkIiTP9kYaH2bvU0BD'

  if (!apiKey) {
    logger.warn('Skipping rerank because COHERE_API_KEY is not configured', {
      requestId: rerankConfig?.requestId,
    })
    return results
  }

  const model = rerankConfig?.model || 'rerank-v4.0-pro'
  const candidateCount = Math.min(results.length, 100)
  const topN = Math.min(rerankConfig?.topN ?? results.length, candidateCount)

  const candidates = results.slice(0, candidateCount)
  const documents = candidates.map((result) => result.content?.slice(0, 4000) ?? '')

  try {
    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: topN,
      }),
    })

    if (!response.ok) {
      logger.warn('Rerank API request failed', {
        status: response.status,
        statusText: response.statusText,
        requestId: rerankConfig?.requestId,
      })
      return results
    }

    const data = await response.json()
    const rerankedItems: any[] = Array.isArray(data?.results) ? data.results : []

    if (!Array.isArray(rerankedItems) || rerankedItems.length === 0) {
      logger.warn('Rerank API returned no data', { requestId: rerankConfig?.requestId })
      return results
    }

    // Sort by relevance_score (descending) and take top 10
    const sortedRerankedItems = rerankedItems
      .filter((item: any) => typeof item.relevance_score === 'number')
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 10)

    if (sortedRerankedItems.length === 0) {
      logger.debug('No results with valid relevance_score', { requestId: rerankConfig?.requestId })
      return []
    }

    // Extract indices from sorted results
    const validIndices = new Set<number>()
    sortedRerankedItems.forEach((item: any) => {
      const candidateIndex = typeof item.index === 'number' ? item.index : -1
      if (candidateIndex >= 0 && candidateIndex < candidates.length) {
        validIndices.add(candidateIndex)
      }
    })

    if (validIndices.size === 0) {
      return []
    }

    // Create score map for sorting
    const scoreMap = new Map<string, number>()
    sortedRerankedItems.forEach((item: any) => {
      const candidateIndex = typeof item.index === 'number' ? item.index : -1
      if (candidateIndex >= 0 && candidateIndex < candidates.length) {
        const candidate = candidates[candidateIndex]
        const relevanceScore = typeof item.relevance_score === 'number' ? item.relevance_score : 0

        if (candidate?.id) {
          scoreMap.set(candidate.id, relevanceScore)
        }
      }
    })

    // Filter candidates to only include those at valid indices and sort by relevance score
    const rerankedResults = candidates
      .filter((_, index) => validIndices.has(index))
      .sort((a, b) => {
        const scoreB = scoreMap.get(b.id) ?? Number.NEGATIVE_INFINITY
        const scoreA = scoreMap.get(a.id) ?? Number.NEGATIVE_INFINITY
        return scoreB - scoreA
      })

    return rerankedResults.slice(0, topN)
  } catch (error) {
    logger.warn('Failed to rerank knowledge base results', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: rerankConfig?.requestId,
    })
    return results
  }
}
