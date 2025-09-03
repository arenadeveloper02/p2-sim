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

export async function searchCollection(collectionName: string, chunkId: string, documentId: string) {
  const res = await client.query({
    collection_name: collectionName,
    expr: `id == "${chunkId}" && document_id == "${documentId}"`,
    output_fields: ['id', 'document_id', 'chunk_index', 'chunk_hash', 'content', 'embedding'],
    limit: 1,
  })
  return res
}