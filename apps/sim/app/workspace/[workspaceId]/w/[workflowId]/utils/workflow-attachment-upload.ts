import { getErrorMessage } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import { uploadInternalFileSession } from '@/lib/uploads/client/session-upload'

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

  for (const fileData of files) {
    const reusedAttachment = reuseStoredWorkflowAttachment(fileData)
    if (reusedAttachment) {
      uploadedFiles.push(reusedAttachment)
      continue
    }

    try {
      const result = await uploadInternalFileSession({
        purpose: 'execution_attachment',
        file: fileData.file,
        workspaceId,
        workflowId,
        executionId,
      })
      uploadedFiles.push(result)
    } catch (uploadError) {
      throw new Error(
        `Failed to upload ${fileData.name}: ${getErrorMessage(uploadError, 'Network error')}`
      )
    }
  }

  return uploadedFiles
}
