import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const milvusEnv = createEnv({
  server: {
    MILVUS_URI: z.string().url().default('http://localhost:19530'),
    MILVUS_TOKEN: z.string().optional(),
    MILVUS_USERNAME: z.string().optional(),
    MILVUS_PASSWORD: z.string().optional(),
    MILVUS_DATABASE: z.string().default('default'),
  },
  runtimeEnv: {
    MILVUS_URI: process.env.MILVUS_URI,
    MILVUS_TOKEN: process.env.MILVUS_TOKEN,
    MILVUS_USERNAME: process.env.MILVUS_USERNAME,
    MILVUS_PASSWORD: process.env.MILVUS_PASSWORD,
    MILVUS_DATABASE: process.env.MILVUS_DATABASE,
  },
  skipValidation: process.env.NODE_ENV === 'development',
})

export const MILVUS_CONFIG = {
  // Collection settings
  EMBEDDING_DIMENSION: 1536, // text-embedding-3-small dimension
  INDEX_TYPE: 'HNSW',
  METRIC_TYPE: 'COSINE',
  
  // HNSW index parameters
  INDEX_PARAMS: {
    M: 16,
    efConstruction: 64,
  },
  
  // Search parameters
  SEARCH_PARAMS: {
    ef: 64,
  },
  
  // Collection naming
  COLLECTION_PREFIX: 'kb_',
  
  // Default limits
  DEFAULT_TOP_K: 10,
  MAX_TOP_K: 100,
} as const
