import { createLogger } from '@sim/logger'
import { processExecutionFiles } from '@/lib/execution/files'
import { generateFileId } from '@/lib/uploads/contexts/execution/utils'
import { isInternalFileUrl, parseInternalFileUrl } from '@/lib/uploads/utils/file-utils'
import type { UserFile } from '@/executor/types'

const logger = createLogger('ChatFileManager')

const DURABLE_CHAT_REFERENCE_CONTEXTS = new Set(['agent-generated-images', 'workspace'])

export interface ChatFile {
  data?: string // Legacy field - base64-encoded file data (data:mime;base64,...) or raw base64
  dataUrl?: string // Preferred field - base64-encoded file data (data:mime;base64,...)
  url?: string // Direct URL to existing file
  name: string // Original filename
  type: string // MIME type
}

export interface ChatExecutionContext {
  workspaceId: string
  workflowId: string
  executionId: string
}

function toAbsoluteInternalUrl(fileUrl: string): string {
  if (fileUrl.startsWith('http')) {
    return fileUrl
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${baseUrl}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`
}

/**
 * Reuse an already-stored internal file by key instead of copying into execution storage.
 */
function resolveDurableInternalFileReference(
  fileUrl: string,
  name: string,
  mime: string
): UserFile | null {
  if (!isInternalFileUrl(fileUrl)) {
    return null
  }

  try {
    const { key, context } = parseInternalFileUrl(fileUrl)
    if (!DURABLE_CHAT_REFERENCE_CONTEXTS.has(context)) {
      return null
    }

    return {
      id: generateFileId(),
      name,
      size: 1,
      type: mime,
      url: toAbsoluteInternalUrl(fileUrl),
      key,
      context,
    }
  } catch {
    return null
  }
}

/**
 * Process and upload chat files to temporary execution storage
 *
 * Handles three input formats:
 * 1. Base64 dataUrl - File content encoded as data URL (uploaded from client)
 * 2. Direct URL - Pass-through URL to existing file (already uploaded)
 * 3. Internal serve URL to durable storage - Reused by key without re-upload
 *
 * Fresh uploads are stored in the execution context. Reused generated or workspace
 * images keep their original storage keys for chat history.
 *
 * @param files Array of chat file attachments
 * @param executionContext Execution context for temporary storage
 * @param requestId Unique request identifier for logging/tracing
 * @param userId User ID for file metadata (optional)
 * @returns Array of UserFile objects with upload results
 */
export async function processChatFiles(
  files: ChatFile[],
  executionContext: ChatExecutionContext,
  requestId: string,
  userId?: string
): Promise<UserFile[]> {
  logger.info(
    `Processing ${files.length} chat files for execution ${executionContext.executionId}`,
    {
      requestId,
      executionContext,
    }
  )

  const durableReferences: UserFile[] = []
  const transformedFiles: Array<{ type: 'file' | 'url'; data: string; name: string; mime?: string }> =
    []

  for (const file of files) {
    const directUrl = file.url?.trim()
    const inlineData = file.dataUrl || file.data
    const internalUrl =
      directUrl ||
      (inlineData && isInternalFileUrl(inlineData) ? toAbsoluteInternalUrl(inlineData) : '')

    if (internalUrl) {
      const durableReference = resolveDurableInternalFileReference(
        internalUrl,
        file.name,
        file.type
      )
      if (durableReference) {
        durableReferences.push(durableReference)
        continue
      }
    }

    if (directUrl) {
      transformedFiles.push({
        type: 'url',
        data: directUrl,
        name: file.name,
        mime: file.type,
      })
      continue
    }

    if (inlineData && isInternalFileUrl(inlineData)) {
      transformedFiles.push({
        type: 'url',
        data: toAbsoluteInternalUrl(inlineData),
        name: file.name,
        mime: file.type,
      })
      continue
    }

    transformedFiles.push({
      type: inlineData ? 'file' : 'url',
      data: inlineData || '',
      name: file.name,
      mime: file.type,
    })
  }

  const uploadedFiles =
    transformedFiles.length > 0
      ? await processExecutionFiles(transformedFiles, executionContext, requestId, userId)
      : []

  const userFiles = [...durableReferences, ...uploadedFiles]

  logger.info(`Successfully processed ${userFiles.length} chat files`, {
    requestId,
    executionId: executionContext.executionId,
  })

  return userFiles
}

/**
 * Upload a single chat file to temporary execution storage
 *
 * This is a convenience function for uploading individual files.
 * For batch uploads, use processChatFiles() for better performance.
 *
 * @param file Chat file to upload
 * @param executionContext Execution context for temporary storage
 * @param requestId Unique request identifier
 * @returns UserFile object with upload result
 */
export async function uploadChatFile(
  file: ChatFile,
  executionContext: ChatExecutionContext,
  requestId: string,
  userId?: string
): Promise<UserFile> {
  const [userFile] = await processChatFiles([file], executionContext, requestId, userId)
  return userFile
}
