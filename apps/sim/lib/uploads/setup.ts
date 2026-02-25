import { env } from '@/lib/env'

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

export const S3_AGENT_GENERATED_IMAGES_CONFIG = {
  bucket: env.S3_AGENT_GENERATED_IMAGES_BUCKET_NAME || '',
  region: env.S3_AGENT_GENERATED_IMAGES_REGION || env.AWS_REGION || '',
}

export function getStorageProvider(): 'S3' | 'Local' {
  if (USE_S3_STORAGE) return 'S3'
  return 'Local'
}

export function isUsingCloudStorage(): boolean {
  return USE_S3_STORAGE
}
