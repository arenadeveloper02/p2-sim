import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node'
import { EmbeddingData } from './utils'
import { Row } from '@react-email/components'

const VECTOR_DIM = 1536
const METRIC = MetricType.IP
const INDEX_TYPE = IndexType.HNSW

const client = new MilvusClient({
  address: 'http://localhost:19530',
  timeout: 1000, // ms
})

const fields = [
  {
    name: 'id',
    data_type: DataType.VarChar,
    is_primary_key: true,
    autoID: false,
    max_length: 64,
  },
  { name: 'knowledge_base_id', data_type: DataType.VarChar, max_length: 64 },
  { name: 'document_id', data_type: DataType.VarChar, max_length: 64 },
  { name: 'chunk_index', data_type: DataType.Int64 },
  { name: 'chunk_hash', data_type: DataType.VarChar, max_length: 128 },
  { name: 'content', data_type: DataType.VarChar, max_length: 65535 },
  { name: 'content_length', data_type: DataType.Int64 },
  { name: 'token_count', data_type: DataType.Int64 },
  {
    name: 'embedding',
    data_type: DataType.FloatVector,
    type_params: { dim: String(VECTOR_DIM) },
  },
  { name: 'embedding_model', data_type: DataType.VarChar, max_length: 64 },
  { name: 'start_offset', data_type: DataType.Int64 },
  { name: 'end_offset', data_type: DataType.Int64 },
  { name: 'created_at', data_type: DataType.VarChar, max_length: 32 }, // store as ISO string
  { name: 'updated_at', data_type: DataType.VarChar, max_length: 32 }, // store as ISO string
  { name: 'enabled', data_type: DataType.Bool },
  { name: 'tag1', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag2', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag3', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag4', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag5', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag6', data_type: DataType.VarChar, max_length: 64 },
  { name: 'tag7', data_type: DataType.VarChar, max_length: 64 },
]

export async function createCollection(collectionName: string) {
  const res = await client.createCollection({
    collection_name: collectionName,
    fields: fields,
    properties: {
      /**
       * Milvus enables mmap on all collections by default, allowing Milvus to map raw field data into memory instead of fully loading them. This reduces memory footprints and increases collection capacity.
       */
      'mmap.enabled': true,
      /**
       * If the data in a collection needs to be dropped for a specific period, consider setting its Time-To-Live (TTL) in seconds. Once the TTL times out, Milvus deletes entities in the collection.
       */
      'collection.ttl.seconds': 86400,
      /**
       * When creating a collection, you can set the consistency level for searches and queries in the collection. You can also change the consistency level of the collection during a specific search or query.
       */
      consistency_level: 'Bounded',
    },
  })
  console.log('Collection created:', res)
  const indexResponse = await client.createIndex({
    collection_name: collectionName,
    field_name: 'embedding',
    index_type: INDEX_TYPE,
    metric_type: METRIC,
    params: { M: '16', efConstruction: '200' },
  })
  console.log('indexResponse', indexResponse)
  const collectionLoaded = await client.loadCollection({ collection_name: collectionName })
  console.log('collectionLoaded', collectionLoaded)
  return indexResponse
}

export async function loadCollection(collectionName: string) {
  const collectionLoaded = await client.loadCollection({ collection_name: collectionName })
  return collectionLoaded
}

export async function hasCollection(collectionName: string) {
  const res = await client.hasCollection({ collection_name: collectionName })
  return res
}

export async function dropCollection(collectionName: string) {
  const res = await client.dropCollection({ collection_name: collectionName })
  return res
}

export async function getCollectionStats(collectionName: string) {
  const res = await client.getCollectionStats({ collection_name: collectionName })
  return res
}

function l2Normalize(vec: number[]) {
  const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1
  return vec.map((x) => x / n)
}

export async function insertDocument(collectionName: string, document: any) {
  let rows = [
    {
      id: document.id,
      knowledge_base_id: document.knowledgeBaseId,
      document_id: document.documentId,
      chunk_index: document.chunkIndex,
      chunk_hash: document.chunkHash,
      content: document.content,
      content_length: document.contentLength,
      token_count: document.tokenCount,
      embedding: document.embedding,
      embedding_model: document.embeddingModel,
      start_offset: document.startOffset,
      end_offset: document.endOffset,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      enabled: document.enabled,
      tag1: document.tag1,
      tag2: document.tag2,
      tag3: document.tag3,
      tag4: document.tag4,
      tag5: document.tag5,
      tag6: document.tag6,
      tag7: document.tag7,
    },
  ]
  const res = await client.insert({
    collection_name: collectionName,
    data: rows,
  })
  return res
}

export async function getChunkByIdAndDoc(collectionName: string, chunkId: string, documentId: string) {
  const res = await client.query({
    collection_name: collectionName,
    expr: `id == "${chunkId}" && document_id == "${documentId}"`,
    output_fields: ['id', 'document_id', 'chunk_index', 'chunk_hash', 'content', 'embedding'],
    limit: 1,
  })
  return res
}

export async function getChunkCountByTagSlot(
  knowledgeBaseId: string,
  tagSlot: 'tag1' | 'tag2' | 'tag3' | 'tag4' | 'tag5' | 'tag6' | 'tag7'
): Promise<number> {
  const expr = `knowledge_base_id == "${knowledgeBaseId}" && ${tagSlot} != null`

  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields: ['id'], // only fetch IDs to keep response light
  })

  return result.data.length
}

export async function getLastChunkIndex(documentId: string): Promise<number | null> {
  const result = await client.query({
    collection_name: 'embedding',
    expr: `document_id == "${documentId}"`,
    output_fields: ['chunk_index'],
  })

  if (!result.data || result.data.length === 0) return null

  const sorted = result.data
    .map((item) => Number(item.chunk_index))
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a)

  return sorted[0] ?? null
}

export async function deleteChunksByDocumentId(documentId: string): Promise<void> {
  // Step 1: Query all matching primary keys
  const queryResult = await client.query({
    collection_name: 'embedding',
    expr: `document_id == "${documentId}"`,
    output_fields: ['id'],
  })

  const idsToDelete = queryResult.data?.map((row) => row.id) ?? []

  if (idsToDelete.length === 0) {
    console.log(`[Milvus] No chunks found for document_id = ${documentId}`)
    return
  }

  // Step 2: Delete by primary key
  await client.delete({
    collection_name: 'embedding',
    ids: idsToDelete,
  })

  console.log(`[Milvus] Deleted ${idsToDelete.length} chunks for document_id = ${documentId}`)
}



export async function updateTagValueInChunks({
  knowledgeBaseId,
  tagSlot,
  oldValue,
  newValue,
}: {
  knowledgeBaseId: string
  tagSlot: 'tag1' | 'tag2' | 'tag3' | 'tag4' | 'tag5' | 'tag6' | 'tag7'
  oldValue: string
  newValue: string | null
}) {
  const expr = `knowledge_base_id == "${knowledgeBaseId}" && ${tagSlot} == "${oldValue}"`

  // Step 1: Query matching rows
  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields: ['id', 'knowledge_base_id', 'document_id', 'chunk_index', 'chunk_hash', 'content',
      'content_length', 'token_count', 'embedding', 'embedding_model', 'start_offset', 'end_offset',
      'created_at', 'updated_at', 'enabled', 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'],
  })

  if (!result.data || result.data.length === 0) {
    console.log(`[Milvus] No chunks to update for ${tagSlot} = ${oldValue}`)
    return
  }

  // Step 2: Prepare updated documents
  const updated = result.data.map((row) => ({
    ...row,
    [tagSlot]: newValue,
    updated_at: new Date().toISOString(),
  }))

  const idsToDelete = updated.map((row) => row.id)

  // Step 3: Delete old rows
  await client.delete({
    collection_name: 'embedding',
    ids: idsToDelete,
  })

  // Step 4: Re-insert updated rows
  await client.insert({
    collection_name: 'embedding',
    data: updated,
  })

  console.log(`[Milvus] Updated ${updated.length} chunks setting ${tagSlot} = ${newValue}`)
}


export async function clearTagSlot({
  knowledgeBaseId,
  tagSlot,
}: {
  knowledgeBaseId: string
  tagSlot: 'tag1' | 'tag2' | 'tag3' | 'tag4' | 'tag5' | 'tag6' | 'tag7'
}) {
  const expr = `knowledge_base_id == "${knowledgeBaseId}" && ${tagSlot} != null`

  // Step 1: Query matching rows
  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields: [
      'id', 'knowledge_base_id', 'document_id', 'chunk_index', 'chunk_hash',
      'content', 'content_length', 'token_count', 'embedding', 'embedding_model',
      'start_offset', 'end_offset', 'created_at', 'updated_at', 'enabled',
      'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7',
    ],
  })

  if (!result.data || result.data.length === 0) {
    console.log(`[Milvus] No entries found with non-null ${tagSlot} in KB: ${knowledgeBaseId}`)
    return
  }

  // Step 2: Update in memory
  const updated = result.data.map((row) => ({
    ...row,
    [tagSlot]: null,
    updated_at: new Date().toISOString(),
  }))

  const idsToDelete = updated.map((row) => row.id)

  // Step 3: Delete old records
  await client.delete({
    collection_name: 'embedding',
    ids: idsToDelete,
  })

  // Step 4: Re-insert updated records
  await client.insert({
    collection_name: 'embedding',
    data: updated,
  })

  console.log(`[Milvus] Cleared ${tagSlot} for ${updated.length} entries in KB: ${knowledgeBaseId}`)
}

export async function updateEmbeddingRowsByDocumentId(
  documentId: string,
  embeddingUpdateData: Partial<Record<string, any>>
): Promise<void> {
  const expr = `document_id == "${documentId}"`

  // Step 1: Query all rows by documentId
  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields: [
      'id', 'knowledge_base_id', 'document_id', 'chunk_index', 'chunk_hash', 'content',
      'content_length', 'token_count', 'embedding', 'embedding_model', 'start_offset',
      'end_offset', 'created_at', 'updated_at', 'enabled',
      'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7',
    ],
  })

  if (!result.data || result.data.length === 0) {
    console.log(`[Milvus] No records found for document_id: ${documentId}`)
    return
  }

  // Step 2: Apply updates
  const now = new Date().toISOString()
  const updated = result.data.map((row) => ({
    ...row,
    ...embeddingUpdateData,
    updated_at: now,
    id: row.id
  }))

  const idsToDelete = updated.map((row) => row.id)

  // Step 3: Delete old entries
  await client.delete({
    collection_name: 'embedding',
    ids: idsToDelete,
  })

  // Step 4: Re-insert updated entries
  await client.insert({
    collection_name: 'embedding',
    data: updated,
  })

  console.log(`[Milvus] Updated ${updated.length} rows for document_id: ${documentId}`)
}



export async function deleteChunksById(chunkId: string): Promise<void> {

  await client.delete({
    collection_name: 'embedding',
    ids: [chunkId],
  })

  console.log(`[Milvus] Deleted 1 chunks for chunk Id  = ${chunkId}`)
  
}

export async function getChunksWithFilters({
  documentId,
  enabled,
  search,
  limit = 10,
  offset = 0,
}: {
  documentId: string
  enabled?: 'true' | 'false' | 'all'
  search?: string
  limit?: number
  offset?: number
}) {
  // Step 1: Construct Milvus expression string
  const exprParts: string[] = [`document_id == "${documentId}"`]

  if (enabled === 'true') exprParts.push(`enabled == true`)
  else if (enabled === 'false') exprParts.push(`enabled == false`)

  if (search) {
    // Milvus has no "ilike", so simulate by filtering post-query
    // But add a soft expr to reduce total records if needed
    exprParts.push(`content != null`)
  }

  const expr = exprParts.join(' && ')

  const output_fields = [
    'id', 'chunk_index', 'content', 'content_length', 'token_count',
    'enabled', 'start_offset', 'end_offset',
    'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7',
    'created_at', 'updated_at',
  ]

  // Step 2: Query with rough filter
  const queryRes = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields,
    limit: limit + offset, // Fetch enough to slice
  })

  if (!queryRes.data) return { chunks: [], totalCount: 0 }

  // Step 3: Post-filter and paginate in JS
  let filtered = queryRes.data.map(row => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentLength: row.content_length,
    tokenCount: row.token_count,
    enabled: row.enabled,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    tag1: row.tag1,
    tag2: row.tag2,
    tag3: row.tag3,
    tag4: row.tag4,
    tag5: row.tag5,
    tag6: row.tag6,
    tag7: row.tag7,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  // Apply ILIKE post-filter for search
  if (search) {
    const lowerSearch = search.toLowerCase()
    filtered = filtered.filter(chunk => chunk.content?.toLowerCase().includes(lowerSearch))
  }

  const totalCount = filtered.length

  const chunks = filtered
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .slice(offset, offset + limit)

  return { chunks, totalCount }
}


export async function getChunksToDelete(documentId: string, chunkIds: string[]) {
  if (!chunkIds.length) return []

  // Milvus supports `in` via `id in [val1, val2, ...]`
  const idList = chunkIds.map((id) => `"${id}"`).join(', ')
  const expr = `document_id == "${documentId}" && id in [${idList}]`

  const output_fields = ['id', 'token_count', 'content_length']

  const res = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields,
  })

  if (!res.data || res.data.length === 0) return []

  return res.data.map((row) => ({
    id: row.id,
    tokenCount: row.token_count,
    contentLength: row.content_length,
  }))
}

export async function deleteChunksByIds(documentId: string, chunkIds: string[]) {
  if (!chunkIds.length) return { deletedCount: 0 }

  // Step 1: Get only those ids that match both conditions
  const idList = chunkIds.map((id) => `"${id}"`).join(', ')
  const expr = `document_id == "${documentId}" && id in [${idList}]`

  const queryResult = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields: ['id'],
  })

  const matchingIds = queryResult.data?.map((row) => row.id) ?? []

  if (matchingIds.length === 0) {
    console.log(`[Milvus] No matching chunks found for deletion.`)
    return { deletedCount: 0 }
  }

  // Step 2: Delete entities by ID
  await client.delete({
    collection_name: 'embedding',
    ids: matchingIds,
  })

  console.log(`[Milvus] Deleted ${matchingIds.length} chunks for document_id: ${documentId}`)
  return { deletedCount: matchingIds.length }
}

export async function updateChunksEnabledFlag({
  documentId,
  chunkIds,
  enabled,
}: {
  documentId: string
  chunkIds: string[]
  enabled: boolean
}) {
  if (!chunkIds.length) return { updatedCount: 0 }

  const idList = chunkIds.map((id) => `"${id}"`).join(', ')
  const expr = `document_id == "${documentId}" && id in [${idList}]`

  const output_fields = [
    'id', 'knowledge_base_id', 'document_id', 'chunk_index', 'chunk_hash',
    'content', 'content_length', 'token_count', 'embedding', 'embedding_model',
    'start_offset', 'end_offset', 'created_at', 'updated_at',
    'enabled', 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7',
  ]

  // Step 1: Query matching records
  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields,
  })

  if (!result.data || result.data.length === 0) {
    console.log(`[Milvus] No matching chunks to update.`)
    return { updatedCount: 0 }
  }

  const now = new Date().toISOString()

  // Step 2: Update the fields in-memory
  const updatedDocs = result.data.map((row) => ({
    ...row,
    enabled,
    updated_at: now,
    id: row.id
  }))

  const idsToDelete = updatedDocs.map((row) => row.id)

  // Step 3: Delete old versions
  await client.delete({
    collection_name: 'embedding',
    ids: idsToDelete,
  })

  // Step 4: Re-insert updated versions
  await client.insert({
    collection_name: 'embedding',
    data: updatedDocs,
  })

  console.log(`[Milvus] Updated 'enabled' to ${enabled} for ${updatedDocs.length} chunks`)
  return { updatedCount: updatedDocs.length }
}

export async function getChunkById(chunkId: string) {
  const expr = `id == "${chunkId}"`

  const output_fields = ['document_id', 'content', 'content_length', 'token_count']

  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields,
    limit: 1,
  })

  if (!result.data || result.data.length === 0) return null

  const row = result.data[0]

  return [{
    documentId: row.document_id,
    content: row.content,
    contentLength: row.content_length,
    tokenCount: row.token_count,
  }]
}
export async function getChunkByIdWithMetadata(chunkId: string) {
  const expr = `id == "${chunkId}"`

  const output_fields = [
    'id', 'chunk_index', 'content', 'content_length', 'token_count',
    'enabled', 'start_offset', 'end_offset',
    'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7',
    'created_at', 'updated_at',
  ]

  const result = await client.query({
    collection_name: 'embedding',
    expr,
    output_fields,
    limit: 1,
  })

  if (!result.data || result.data.length === 0) return null

  const row = result.data[0]

  return [{
    id: row.id,
    chunkIndex: row.chunk_index,
    content: row.content,
    contentLength: row.content_length,
    tokenCount: row.token_count,
    enabled: row.enabled,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    tag1: row.tag1,
    tag2: row.tag2,
    tag3: row.tag3,
    tag4: row.tag4,
    tag5: row.tag5,
    tag6: row.tag6,
    tag7: row.tag7,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }]
}
