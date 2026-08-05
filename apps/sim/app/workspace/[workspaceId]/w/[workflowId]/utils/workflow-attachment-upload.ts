import { getErrorMessage } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import { isRecordLike } from '@sim/utils/object'
import {
  type ApiFallbackUploadMetadata,
  uploadViaApiFallbackWithMetadata,
} from '@/lib/uploads/client/api-fallback'
import { DirectUploadError, runUploadStrategy } from '@/lib/uploads/client/direct-upload'

export interface WorkflowAttachmentInput {
  name: string
  size: number
  type: string
  file: File
  dataUrl?: string
  url?: string
}

export interface UploadedWorkflowAttachment {
  id: string
  name: string
  url: string
  size: number
  type: string
  key?: string
  context: 'execution' | 'agent-generated-images' | 'workspace'
  uploadedAt?: string
  expiresAt?: string
}

interface UploadWorkflowAttachmentsParams {
  files: WorkflowAttachmentInput[]
  workspaceId: string
  workflowId: string
  executionId: string
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function getDirectUploadFailureReason(error: unknown): string {
  if (error instanceof DirectUploadError && isRecordLike(error.details)) {
    const message =
      getOptionalString(error.details.message) ?? getOptionalString(error.details.error)
    if (message) return message
  }

  return getErrorMessage(error, 'Unknown upload error')
}

function normalizeFallbackUpload(
  value: ApiFallbackUploadMetadata,
  fallbackFile: WorkflowAttachmentInput
): UploadedWorkflowAttachment {
  return {
    id: value.id ?? `file_${Date.now()}_${generateShortId(7)}`,
    name: value.name ?? fallbackFile.name,
    url: value.path,
    size: typeof value.size === 'number' ? value.size : fallbackFile.size,
    type: value.type ?? fallbackFile.type,
    key: value.key,
    context: 'execution',
    uploadedAt: value.uploadedAt,
    expiresAt: value.expiresAt,
  }
}

function inferStoredAttachmentContext(key: string): UploadedWorkflowAttachment['context'] {
  if (key.startsWith('agent-generated-images/')) return 'agent-generated-images'
  if (key.startsWith('workspace/')) return 'workspace'
  return 'execution'
}

/**
 * Reuses an image already stored in app file serving instead of uploading an empty File.
 */
export function reuseStoredWorkflowAttachment(
  fileData: WorkflowAttachmentInput
): UploadedWorkflowAttachment | null {
  const candidate = [fileData.url, fileData.dataUrl].find(
    (value): value is string => typeof value === 'string' && value.includes('/api/files/serve/')
  )
  if (!candidate) return null

  const servePathMatch = candidate.match(/\/api\/files\/serve\/([^?#]+)/)
  if (!servePathMatch) return null

  let key = servePathMatch[1].replace(/\/+$/, '')
  try {
    key = decodeURIComponent(key)
  } catch {
    // Keep the encoded key when it is not valid URI encoding.
  }

  return {
    id: `file_${Date.now()}_${generateShortId(7)}`,
    name: fileData.name,
    url: candidate,
    size: fileData.size > 0 ? fileData.size : 1,
    type: fileData.type,
    key,
    context: inferStoredAttachmentContext(key),
  }
}

/**
 * Uploads every explicit workflow attachment before execution may begin.
 *
 * @throws An actionable, file-specific error if any attachment fails.
 */
export async function uploadWorkflowAttachments({
  files,
  workspaceId,
  workflowId,
  executionId,
}: UploadWorkflowAttachmentsParams): Promise<UploadedWorkflowAttachment[]> {
  const uploadedFiles: UploadedWorkflowAttachment[] = []
  const presignedEndpoint = `/api/files/presigned?type=execution&workflowId=${encodeURIComponent(workflowId)}&executionId=${encodeURIComponent(executionId)}&workspaceId=${encodeURIComponent(workspaceId)}`

  for (const fileData of files) {
    const reusedAttachment = reuseStoredWorkflowAttachment(fileData)
    if (reusedAttachment) {
      uploadedFiles.push(reusedAttachment)
      continue
    }

    try {
      const result = await runUploadStrategy({
        file: fileData.file,
        workspaceId,
        context: 'execution',
        workflowId,
        executionId,
        presignedEndpoint,
      })
      uploadedFiles.push({
        id: `file_${Date.now()}_${generateShortId(7)}`,
        name: fileData.file.name,
        url: result.path,
        size: fileData.file.size > 0 ? fileData.file.size : fileData.size,
        type: fileData.file.type || fileData.type,
        key: result.key,
        context: 'execution',
      })
    } catch (uploadError) {
      if (!(uploadError instanceof DirectUploadError) || uploadError.code !== 'FALLBACK_REQUIRED') {
        throw new Error(
          `Failed to upload ${fileData.name}: ${getDirectUploadFailureReason(uploadError)}`
        )
      }

      try {
        const fallbackResult = await uploadViaApiFallbackWithMetadata(fileData.file, 'execution', {
          workflowId,
          executionId,
          workspaceId,
        })
        uploadedFiles.push(normalizeFallbackUpload(fallbackResult, fileData))
      } catch (error) {
        throw new Error(
          `Failed to upload ${fileData.name}: ${getErrorMessage(error, 'Network error')}`
        )
      }
    }
  }

  return uploadedFiles
}
