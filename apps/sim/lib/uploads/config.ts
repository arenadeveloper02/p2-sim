import { env } from '@/lib/core/config/env'
import type { StorageConfig, StorageContext } from '@/lib/uploads/shared/types'

export type { StorageConfig, StorageContext } from '@/lib/uploads/shared/types'
export const UPLOAD_DIR = '/uploads'

const hasS3Config = !!(env.S3_BUCKET_NAME && env.AWS_REGION)

export const USE_S3_STORAGE = hasS3Config

export const S3_CONFIG = {
  bucket: env.S3_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

export const S3_KB_CONFIG = {
  bucket: env.S3_KB_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

export const S3_EXECUTION_FILES_CONFIG = {
  bucket: env.S3_EXECUTION_FILES_BUCKET_NAME || 'sim-execution-files',
  region: env.AWS_REGION || '',
}

export const S3_CHAT_CONFIG = {
  bucket: env.S3_CHAT_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

export const S3_COPILOT_CONFIG = {
  bucket: env.S3_COPILOT_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

export const S3_PROFILE_PICTURES_CONFIG = {
  bucket: env.S3_PROFILE_PICTURES_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

export const S3_OG_IMAGES_CONFIG = {
  bucket: env.S3_OG_IMAGES_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/**
 * S3 config for agent-generated images (e.g. image generator block).
 * Uses the same AWS credentials as the main S3 bucket.
 * Set S3_AGENT_GENERATED_IMAGES_REGION if the bucket is in a different region than AWS_REGION.
 */
export const S3_AGENT_GENERATED_IMAGES_CONFIG = {
  bucket: env.S3_AGENT_GENERATED_IMAGES_BUCKET_NAME || '',
  region: env.S3_AGENT_GENERATED_IMAGES_REGION || env.AWS_REGION || '',
}

/**
 * Get the current storage provider as a human-readable string
 */
export function getStorageProvider(): 'S3' | 'Local' {
  if (USE_S3_STORAGE) return 'S3'
  return 'Local'
}

/**
 * Check if we're using cloud storage (S3)
 */
export function isUsingCloudStorage(): boolean {
  return USE_S3_STORAGE
}

/**
 * Get the appropriate storage configuration for a given context
 */
export function getStorageConfig(context: StorageContext): StorageConfig {
  if (USE_S3_STORAGE) {
    return getS3Config(context)
  }

  return {}
}

/**
 * Get S3 configuration for a given context
 */
function getS3Config(context: StorageContext): StorageConfig {
  switch (context) {
    case 'knowledge-base':
      return {
        bucket: S3_KB_CONFIG.bucket,
        region: S3_KB_CONFIG.region,
      }
    case 'chat':
      return {
        bucket: S3_CHAT_CONFIG.bucket,
        region: S3_CHAT_CONFIG.region,
      }
    case 'copilot':
      return {
        bucket: S3_COPILOT_CONFIG.bucket,
        region: S3_COPILOT_CONFIG.region,
      }
    case 'execution':
      return {
        bucket: S3_EXECUTION_FILES_CONFIG.bucket,
        region: S3_EXECUTION_FILES_CONFIG.region,
      }
    case 'workspace':
      return {
        bucket: S3_CONFIG.bucket,
        region: S3_CONFIG.region,
      }
    case 'profile-pictures':
      return {
        bucket: S3_PROFILE_PICTURES_CONFIG.bucket,
        region: S3_PROFILE_PICTURES_CONFIG.region,
      }
    case 'og-images':
      return {
        bucket: S3_OG_IMAGES_CONFIG.bucket || S3_CONFIG.bucket,
        region: S3_OG_IMAGES_CONFIG.region || S3_CONFIG.region,
      }
    case 'agent-generated-images':
      return {
        bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket || S3_CONFIG.bucket,
        region: S3_AGENT_GENERATED_IMAGES_CONFIG.region || S3_CONFIG.region,
      }
    default:
      return {
        bucket: S3_CONFIG.bucket,
        region: S3_CONFIG.region,
      }
  }
}

/**
 * Check if a specific storage context is configured for cloud storage.
 * Returns true if the context has its own bucket configured (e.g. agent-generated-images S3 bucket)
 * or if global S3 is on and the context has config.
 */
export function isStorageContextConfigured(context: StorageContext): boolean {
  const config = getStorageConfig(context)

  if (USE_S3_STORAGE) {
    return !!(config.bucket && config.region)
  }

  if (context === 'agent-generated-images') {
    return !!(S3_AGENT_GENERATED_IMAGES_CONFIG.bucket && S3_AGENT_GENERATED_IMAGES_CONFIG.region)
  }

  return false
}
