import { MilvusClient } from '@zilliz/milvus2-sdk-node'
import { milvusEnv } from './config'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('MilvusClient')

let milvusClient: MilvusClient | null = null

export function getMilvusClient(): MilvusClient {
  if (!milvusClient) {
    const config: any = {
      address: milvusEnv.MILVUS_URI,
      database: milvusEnv.MILVUS_DATABASE,
    }

    // Add authentication if provided
    if (milvusEnv.MILVUS_TOKEN) {
      config.token = milvusEnv.MILVUS_TOKEN
    } else if (milvusEnv.MILVUS_USERNAME && milvusEnv.MILVUS_PASSWORD) {
      config.username = milvusEnv.MILVUS_USERNAME
      config.password = milvusEnv.MILVUS_PASSWORD
    }

    milvusClient = new MilvusClient(config)
    logger.info('Milvus client initialized', { 
      uri: milvusEnv.MILVUS_URI,
      database: milvusEnv.MILVUS_DATABASE 
    })
  }

  return milvusClient
}

export async function testMilvusConnection(): Promise<boolean> {
  try {
    const client = getMilvusClient()
    const health = await client.checkHealth()
    logger.info('Milvus connection test successful', { health })
    return health.isHealthy
  } catch (error) {
    logger.error('Milvus connection test failed', error)
    return false
  }
}

export function closeMilvusConnection(): void {
  if (milvusClient) {
    milvusClient = null
    logger.info('Milvus client connection closed')
  }
}
