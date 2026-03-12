import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import path, { join } from 'path'
import { createLogger } from '@sim/logger'
import { env } from '@/lib/core/config/env'
import { getStorageProvider, USE_S3_STORAGE } from '@/lib/uploads/config'
import { ensureAgentGeneratedImagesDirectory } from '@/lib/uploads/utils/image-storage.server'

const logger = createLogger('UploadsSetup')

const PROJECT_ROOT = path.resolve(process.cwd())
export const UPLOAD_DIR_SERVER = join(PROJECT_ROOT, 'uploads')

/**
 * Server-only function to ensure uploads directory exists
 */
export async function ensureUploadsDirectory() {
  if (USE_S3_STORAGE) {
    logger.info('Using S3 storage, skipping local uploads directory creation')
    return true
  }

  try {
    if (!existsSync(UPLOAD_DIR_SERVER)) {
      await mkdir(UPLOAD_DIR_SERVER, { recursive: true })
    } else {
      logger.info(`Uploads directory already exists at ${UPLOAD_DIR_SERVER}`)
    }
    return true
  } catch (error) {
    logger.error('Failed to create uploads directory:', error)
    return false
  }
}

// Immediately invoke on server startup
if (typeof process !== 'undefined') {
  const storageProvider = getStorageProvider()

  // Log storage mode
  logger.info(`Storage provider: ${storageProvider}`)

  if (USE_S3_STORAGE) {
    // Verify AWS credentials
    if (!env.S3_BUCKET_NAME || !env.AWS_REGION) {
      logger.warn('S3 storage configuration is incomplete')
      logger.warn('Set S3_BUCKET_NAME and AWS_REGION for S3 storage')
    } else if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      logger.warn('AWS credentials are not set in environment variables')
      logger.warn('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3 storage')
    } else {
      logger.info('AWS S3 credentials found in environment variables')
    }
  } else {
    // Local storage mode
    logger.info('Using local file storage')

    // Only initialize local uploads directory when using local storage
    ensureUploadsDirectory().then((success) => {
      if (success) {
        logger.info('Local uploads directory initialized')
      } else {
        logger.error('Failed to initialize local uploads directory')
      }
    })

    // Ensure agent-generated-images directory exists
    ensureAgentGeneratedImagesDirectory().then((success) => {
      if (success) {
        logger.info('Agent-generated-images directory initialized')
      } else {
        logger.error(
          'Failed to initialize agent-generated-images directory - check write permissions'
        )
      }
    })
  }

  if (USE_S3_STORAGE && env.S3_KB_BUCKET_NAME) {
    logger.info(`S3 knowledge base bucket: ${env.S3_KB_BUCKET_NAME}`)
  }
  if (USE_S3_STORAGE && env.S3_COPILOT_BUCKET_NAME) {
    logger.info(`S3 copilot bucket: ${env.S3_COPILOT_BUCKET_NAME}`)
  }
}

export default ensureUploadsDirectory
