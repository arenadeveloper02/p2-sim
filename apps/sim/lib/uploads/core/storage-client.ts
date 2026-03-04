import { USE_S3_STORAGE } from '@/lib/uploads/config'
import type { StorageConfig } from '@/lib/uploads/shared/types'

export type { StorageConfig } from '@/lib/uploads/shared/types'

/**
 * Get the current storage provider name
 */
export function getStorageProvider(): 's3' | 'local' {
  if (USE_S3_STORAGE) return 's3'
  return 'local'
}

/**
 * Get the serve path prefix (unified across all storage providers)
 */
export function getServePathPrefix(): string {
  return '/api/files/serve/'
}

/**
 * Get file metadata from storage provider
 * @param key File key/name
 * @param customConfig Optional custom storage configuration
 * @returns File metadata object with userId, workspaceId, originalName, uploadedAt, etc.
 */
export async function getFileMetadata(
  key: string,
  customConfig?: StorageConfig
): Promise<Record<string, string>> {
  const { getFileMetadataByKey } = await import('../server/metadata')
  const metadataRecord = await getFileMetadataByKey(key)

  if (metadataRecord) {
    return {
      userId: metadataRecord.userId,
      workspaceId: metadataRecord.workspaceId || '',
      originalName: metadataRecord.originalName,
      uploadedAt: metadataRecord.uploadedAt.toISOString(),
      purpose: metadataRecord.context,
    }
  }

  if (USE_S3_STORAGE) {
    const { getS3Client } = await import('@/lib/uploads/providers/s3/client')
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    const { S3_CONFIG } = await import('@/lib/uploads/config')

    const s3Client = getS3Client()
    const bucket = customConfig?.bucket || S3_CONFIG.bucket

    if (!bucket) {
      throw new Error('S3 bucket not configured')
    }

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    const response = await s3Client.send(command)
    return response.Metadata || {}
  }

  return {}
}
