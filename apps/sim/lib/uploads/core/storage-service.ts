import { createLogger } from '@sim/logger'
import {
  getStorageConfig,
  S3_AGENT_GENERATED_IMAGES_CONFIG,
  S3_CONFIG,
  USE_S3_STORAGE,
} from '@/lib/uploads/config'
import type { S3Config } from '@/lib/uploads/providers/s3/types'
import type {
  DeleteFileOptions,
  DownloadFileOptions,
  FileInfo,
  GeneratePresignedUrlOptions,
  PresignedUrlResponse,
  StorageConfig,
  StorageContext,
  UploadFileOptions,
} from '@/lib/uploads/shared/types'
import {
  sanitizeFileKey,
  sanitizeFilenameForMetadata,
  sanitizeStorageMetadata,
} from '@/lib/uploads/utils/file-utils'

const logger = createLogger('StorageService')

/**
 * Create an S3 config from StorageConfig
 * @throws Error if required properties are missing
 */
function createS3Config(config: StorageConfig): S3Config {
  if (!config.bucket || !config.region) {
    throw new Error('S3 configuration missing required properties: bucket and region')
  }

  return {
    bucket: config.bucket,
    region: config.region,
  }
}

/**
 * Insert file metadata into the database
 */
async function insertFileMetadataHelper(
  key: string,
  metadata: Record<string, string>,
  context: StorageContext,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<void> {
  const { insertFileMetadata } = await import('../server/metadata')
  await insertFileMetadata({
    key,
    userId: metadata.userId,
    workspaceId: metadata.workspaceId || null,
    context,
    originalName: metadata.originalName || fileName,
    contentType,
    size: fileSize,
  })
}

/**
 * Upload a file to the configured storage provider with context-aware configuration
 */
export async function uploadFile(options: UploadFileOptions): Promise<FileInfo> {
  const { file, fileName, contentType, context, preserveKey, customKey, metadata } = options

  logger.info(`Uploading file to ${context} storage: ${fileName}`)

  const keyToUse = customKey || fileName

  if (context === 'agent-generated-images' && (!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket || !S3_AGENT_GENERATED_IMAGES_CONFIG.region)) {
    logger.warn('Agent-generated image will use local storage: S3_AGENT_GENERATED_IMAGES_BUCKET_NAME or S3_AGENT_GENERATED_IMAGES_REGION not set', {
      hasBucket: !!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
      hasRegion: !!S3_AGENT_GENERATED_IMAGES_CONFIG.region,
    })
  }

  if (
    context === 'agent-generated-images' &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.region
  ) {
    const s3Config = createS3Config({
      bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
      region: S3_AGENT_GENERATED_IMAGES_CONFIG.region,
    })
    logger.info('Uploading agent-generated image to dedicated S3 bucket', {
      bucket: s3Config.bucket,
      region: s3Config.region,
      key: keyToUse,
    })
    try {
      const { uploadToS3 } = await import('@/lib/uploads/providers/s3/client')
      const uploadResult = await uploadToS3(
        file,
        keyToUse,
        contentType,
        s3Config,
        file.length,
        preserveKey,
        metadata
      )
      if (metadata) {
        await insertFileMetadataHelper(
          uploadResult.key,
          metadata,
          context,
          fileName,
          contentType,
          file.length
        )
      }
      logger.info('S3 upload completed for agent-generated image', {
        bucket: s3Config.bucket,
        s3Key: uploadResult.key,
        servePath: uploadResult.path,
      })
      return uploadResult
    } catch (s3Error) {
      logger.warn('S3 upload failed for agent-generated image, falling back to local storage', {
        bucket: s3Config.bucket,
        key: keyToUse,
        error: s3Error instanceof Error ? s3Error.message : String(s3Error),
      })
      const { writeFile, mkdir } = await import('fs/promises')
      const { join, dirname } = await import('path')
      const { UPLOAD_DIR_SERVER } = await import('./setup.server')
      const safeKey = sanitizeFileKey(keyToUse)
      const filesystemPath = join(UPLOAD_DIR_SERVER, safeKey)
      await mkdir(dirname(filesystemPath), { recursive: true })
      await writeFile(filesystemPath, file)
      if (metadata) {
        await insertFileMetadataHelper(
          keyToUse,
          metadata,
          context,
          fileName,
          contentType,
          file.length
        )
      }
      return {
        path: `/api/files/serve/${keyToUse}`,
        key: keyToUse,
        name: fileName,
        size: file.length,
        type: contentType,
        s3UploadFailed: true,
      }
    }
  }

  const config = getStorageConfig(context)

  const useS3ForThisUpload =
    USE_S3_STORAGE ||
    (context === 'agent-generated-images' && !!config.bucket && !!config.region)

  if (useS3ForThisUpload && config.bucket && config.region) {
    logger.info('Uploading to S3', {
      bucket: config.bucket,
      region: config.region,
      key: keyToUse,
      context,
    })
    const { uploadToS3 } = await import('@/lib/uploads/providers/s3/client')
    const uploadResult = await uploadToS3(
      file,
      keyToUse,
      contentType,
      createS3Config(config),
      file.length,
      preserveKey,
      metadata
    )

    logger.info('S3 upload completed', {
      bucket: config.bucket,
      s3Key: uploadResult.key,
      servePath: uploadResult.path,
    })

    if (metadata) {
      await insertFileMetadataHelper(
        uploadResult.key,
        metadata,
        context,
        fileName,
        contentType,
        file.length
      )
    }

    return uploadResult
  }

  const { writeFile, mkdir } = await import('fs/promises')
  const { join, dirname } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const storageKey = keyToUse
  const safeKey = sanitizeFileKey(keyToUse) // Validates and preserves path structure
  const filesystemPath = join(UPLOAD_DIR_SERVER, safeKey)

  await mkdir(dirname(filesystemPath), { recursive: true })

  await writeFile(filesystemPath, file)

  if (metadata) {
    await insertFileMetadataHelper(
      storageKey,
      metadata,
      context,
      fileName,
      contentType,
      file.length
    )
  }

  return {
    path: `/api/files/serve/${storageKey}`,
    key: storageKey,
    name: fileName,
    size: file.length,
    type: contentType,
  }
}

/**
 * Download a file from the configured storage provider
 */
export async function downloadFile(options: DownloadFileOptions): Promise<Buffer> {
  const { key, context } = options

  if (
    context === 'agent-generated-images' &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.region
  ) {
    const s3Config = createS3Config({
      bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
      region: S3_AGENT_GENERATED_IMAGES_CONFIG.region,
    })
    const { downloadFromS3 } = await import('@/lib/uploads/providers/s3/client')
    return downloadFromS3(key, s3Config)
  }

  if (context) {
    const config = getStorageConfig(context)

    const useS3ForThisDownload =
      USE_S3_STORAGE ||
      (context === 'agent-generated-images' && !!config.bucket && !!config.region)

    if (useS3ForThisDownload && config.bucket && config.region) {
      const { downloadFromS3 } = await import('@/lib/uploads/providers/s3/client')
      return downloadFromS3(key, createS3Config(config))
    }
  }

  const { readFile } = await import('fs/promises')
  const { join } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const safeKey = sanitizeFileKey(key)
  const filePath = join(UPLOAD_DIR_SERVER, safeKey)

  return readFile(filePath)
}

/**
 * Delete a file from the configured storage provider
 */
export async function deleteFile(options: DeleteFileOptions): Promise<void> {
  const { key, context } = options

  if (
    context === 'agent-generated-images' &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
    S3_AGENT_GENERATED_IMAGES_CONFIG.region
  ) {
    const s3Config = createS3Config({
      bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
      region: S3_AGENT_GENERATED_IMAGES_CONFIG.region,
    })
    const { deleteFromS3 } = await import('@/lib/uploads/providers/s3/client')
    return deleteFromS3(key, s3Config)
  }

  if (context) {
    const config = getStorageConfig(context)

    const useS3ForThisDelete =
      USE_S3_STORAGE ||
      (context === 'agent-generated-images' && !!config.bucket && !!config.region)

    if (useS3ForThisDelete && config.bucket && config.region) {
      const { deleteFromS3 } = await import('@/lib/uploads/providers/s3/client')
      return deleteFromS3(key, createS3Config(config))
    }
  }

  const { unlink } = await import('fs/promises')
  const { join } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const safeKey = sanitizeFileKey(key)
  const filePath = join(UPLOAD_DIR_SERVER, safeKey)

  await unlink(filePath)
}

/**
 * Generate a presigned URL for direct file upload
 */
export async function generatePresignedUploadUrl(
  options: GeneratePresignedUrlOptions
): Promise<PresignedUrlResponse> {
  const {
    fileName,
    contentType,
    fileSize,
    context,
    userId,
    expirationSeconds = 3600,
    metadata = {},
  } = options

  const allMetadata = {
    ...metadata,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
    purpose: context,
    ...(userId && { userId }),
  }

  const config = getStorageConfig(context)

  const timestamp = Date.now()
  const uniqueId = Math.random().toString(36).substring(2, 9)
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const key = `${context}/${timestamp}-${uniqueId}-${safeFileName}`

  if (USE_S3_STORAGE) {
    return generateS3PresignedUrl(
      key,
      contentType,
      fileSize,
      allMetadata,
      config,
      expirationSeconds
    )
  }

  throw new Error('Cloud storage not configured. Cannot generate presigned URL for local storage.')
}

/**
 * Generate presigned URL for S3
 */
async function generateS3PresignedUrl(
  key: string,
  contentType: string,
  fileSize: number,
  metadata: Record<string, string>,
  config: { bucket?: string; region?: string },
  expirationSeconds: number
): Promise<PresignedUrlResponse> {
  const { getS3Client, getS3ClientForRegion } = await import('@/lib/uploads/providers/s3/client')
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

  if (!config.bucket || !config.region) {
    throw new Error('S3 configuration missing bucket or region')
  }

  const sanitizedMetadata = sanitizeStorageMetadata(metadata, 2000)
  if (sanitizedMetadata.originalName) {
    sanitizedMetadata.originalName = sanitizeFilenameForMetadata(sanitizedMetadata.originalName)
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    Metadata: sanitizedMetadata,
  })

  const s3Client =
    config.region !== S3_CONFIG.region
      ? getS3ClientForRegion(config.region)
      : getS3Client()
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: expirationSeconds })

  return {
    url: presignedUrl,
    key,
  }
}

/**
 * Generate multiple presigned URLs at once (batch operation)
 */
export async function generateBatchPresignedUploadUrls(
  files: Array<{
    fileName: string
    contentType: string
    fileSize: number
  }>,
  context: StorageContext,
  userId?: string,
  expirationSeconds?: number
): Promise<PresignedUrlResponse[]> {
  const results: PresignedUrlResponse[] = []

  for (const file of files) {
    const result = await generatePresignedUploadUrl({
      fileName: file.fileName,
      contentType: file.contentType,
      fileSize: file.fileSize,
      context,
      userId,
      expirationSeconds,
    })
    results.push(result)
  }

  return results
}

/**
 * Generate a presigned URL for downloading/accessing an existing file
 */
export async function generatePresignedDownloadUrl(
  key: string,
  context: StorageContext,
  expirationSeconds = 3600
): Promise<string> {
  const config = getStorageConfig(context)

  if (USE_S3_STORAGE) {
    const { getPresignedUrlWithConfig } = await import('@/lib/uploads/providers/s3/client')
    return getPresignedUrlWithConfig(key, createS3Config(config), expirationSeconds)
  }

  const { getBaseUrl } = await import('@/lib/core/utils/urls')
  const baseUrl = getBaseUrl()
  return `${baseUrl}/api/files/serve/${encodeURIComponent(key)}`
}

/**
 * Check if cloud storage is available
 */
export function hasCloudStorage(): boolean {
  return USE_S3_STORAGE
}

/**
 * Get S3 bucket and key information for a storage key
 * Useful for services that need direct S3 access (e.g., AWS Textract async)
 */
export function getS3InfoForKey(
  key: string,
  context: StorageContext
): { bucket: string; key: string } {
  if (!USE_S3_STORAGE) {
    throw new Error('S3 storage is not configured. Cannot retrieve S3 info for key.')
  }

  const config = getStorageConfig(context)

  if (!config.bucket) {
    throw new Error(`S3 bucket not configured for context: ${context}`)
  }

  return {
    bucket: config.bucket,
    key,
  }
}
