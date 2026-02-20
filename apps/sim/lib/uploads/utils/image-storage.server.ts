'use server'

import { createLogger } from '@sim/logger'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { join } from 'path'
import { uploadFile } from '@/lib/uploads/core/storage-service'
import {
  USE_S3_STORAGE,
  USE_BLOB_STORAGE,
  S3_AGENT_GENERATED_IMAGES_CONFIG,
} from '@/lib/uploads/config'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('ImageStorage')

// Store images at /apps/sim/agent-generated-images
const LOCAL_STORAGE_DIR = 'agent-generated-images'

/** Sanitise segment for use in storage path (no slashes, no parent refs, no empty). */
function sanitisePathSegment(value: string): string {
  const s = value.replace(/[/\\\0]/g, '').replace(/\.\./g, '').trim()
  return s || 'unknown'
}

/**
 * Ensure the agent-generated-images base directory exists
 * This should be called on server startup
 */
export async function ensureAgentGeneratedImagesDirectory(): Promise<boolean> {
  const useCloudForAgentImages =
    USE_S3_STORAGE ||
    USE_BLOB_STORAGE ||
    (!!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
      !!S3_AGENT_GENERATED_IMAGES_CONFIG.region)
  if (useCloudForAgentImages) {
    return true
  }

  try {
    // Store at /apps/sim/agent-generated-images
    const baseDir = join(process.cwd(), LOCAL_STORAGE_DIR)
    
    if (!existsSync(baseDir)) {
      await fs.mkdir(baseDir, { recursive: true })
      logger.info(`Created agent-generated-images directory at ${baseDir}`)
    } else {
      logger.debug(`Agent-generated-images directory already exists at ${baseDir}`)
    }

    // Verify write permissions by attempting to create a test file
    try {
      const testFile = join(baseDir, '.write-test')
      await fs.writeFile(testFile, 'test')
      await fs.unlink(testFile)
      logger.debug('Write permissions verified for agent-generated-images directory')
    } catch (permError) {
      logger.error('No write permissions for agent-generated-images directory:', permError)
      return false
    }

    return true
  } catch (error) {
    logger.error('Failed to ensure agent-generated-images directory exists:', error)
    return false
  }
}

/**
 * Save a generated image to storage (S3, Azure Blob, or local)
 * Structure: agent-generated-images/[workflow_id]/[user_id]/[image]
 * @param base64Image - Base64 encoded image data
 * @param workflowId - Workflow ID
 * @param userId - User ID
 * @param mimeType - MIME type of the image (default: image/png)
 * @returns URL or path to the stored image
 */
export async function saveGeneratedImage(
  base64Image: string,
  workflowId: string,
  userId: string,
  mimeType = 'image/png'
): Promise<string> {
  try {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Determine file extension from MIME type
    const extension = mimeType.split('/')[1] || 'png'
    const timestamp = Date.now()
    const fileName = `${timestamp}.${extension}`

    const safeWorkflowId = sanitisePathSegment(workflowId)
    const safeUserId = sanitisePathSegment(userId)

    // Structure: agent-generated-images/[workflow_id]/[user_id]/[image]
    const key = `${LOCAL_STORAGE_DIR}/${safeWorkflowId}/${safeUserId}/${fileName}`

    const useCloudStorage =
      USE_S3_STORAGE ||
      USE_BLOB_STORAGE ||
      (!!S3_AGENT_GENERATED_IMAGES_CONFIG.bucket &&
        !!S3_AGENT_GENERATED_IMAGES_CONFIG.region)

    if (useCloudStorage) {
      logger.info('S3 upload started for agent-generated image', {
        key,
        workflowId,
        userId,
        bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
        region: S3_AGENT_GENERATED_IMAGES_CONFIG.region,
      })

      const fileInfo = await uploadFile({
        file: imageBuffer,
        fileName: key,
        contentType: mimeType,
        context: 'agent-generated-images', // Use dedicated context for agent-generated images
        preserveKey: true, // Preserve the key structure
        metadata: {
          workflowId,
          userId,
          purpose: 'agent-generated-image',
        },
      })

      // Return serve URL (not direct S3 URL) so the app can:
      // 1. Handle authentication/authorization
      // 2. Serve files through the app's domain
      // 3. Support both S3 and local storage transparently
      const serveUrl = `${getBaseUrl()}${fileInfo.path}`
      logger.info('S3 URL returned for agent-generated image', {
        url: serveUrl,
        s3Bucket: S3_AGENT_GENERATED_IMAGES_CONFIG.bucket,
        s3Key: fileInfo.key,
        s3Location: `s3://${S3_AGENT_GENERATED_IMAGES_CONFIG.bucket}/${fileInfo.key}`,
      })
      return serveUrl
    }

    // Local storage fallback
    logger.info(`Saving generated image to local storage: ${key}`)

    // Structure: agent-generated-images/[workflow_id]/[user_id]/[image]
    const baseDir = join(process.cwd(), LOCAL_STORAGE_DIR, safeWorkflowId, safeUserId)
    if (!existsSync(join(process.cwd(), LOCAL_STORAGE_DIR))) {
      const success = await ensureAgentGeneratedImagesDirectory()
      if (!success) {
        throw new Error('Failed to create agent-generated-images directory. Check write permissions.')
      }
    }

    await fs.mkdir(baseDir, { recursive: true })

    const fullPath = join(baseDir, fileName)
    try {
      await fs.writeFile(fullPath, imageBuffer)
      logger.debug(`Successfully wrote image file: ${fullPath}`)
    } catch (writeError) {
      logger.error(`Failed to write image file ${fullPath}:`, writeError)
      throw new Error(
        `Failed to write image file: ${writeError instanceof Error ? writeError.message : String(writeError)}`
      )
    }

    // Return serve URL (path without leading slash for the API route)
    const baseUrl = getBaseUrl()
    const servePath = `${LOCAL_STORAGE_DIR}/${safeWorkflowId}/${safeUserId}/${fileName}`
    return `${baseUrl}/api/files/serve/${servePath}`
  } catch (error) {
    logger.error('Error saving generated image:', error)
    throw new Error(`Failed to save generated image: ${error instanceof Error ? error.message : String(error)}`)
  }
}