import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { AssistantGeneratedImage } from '@/lib/chat/assistant-assets'
import type { UserFile } from '@/executor/types'

export interface PersistedChatAttachment {
  id: string
  key: string
  filename: string
  media_type: string
  size: number
}

interface PersistedExecutionDataPatch {
  userAttachments?: PersistedChatAttachment[]
  knowledgeRefs?: unknown[]
  generatedImages?: AssistantGeneratedImage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPersistedGeneratedImage(value: unknown): value is AssistantGeneratedImage {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    typeof value.type === 'string'
  )
}

export function isPersistedChatAttachment(value: unknown): value is PersistedChatAttachment {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.media_type === 'string' &&
    typeof value.size === 'number'
  )
}

export function toPersistedChatAttachment(file: UserFile): PersistedChatAttachment {
  return {
    id: file.id,
    key: file.key,
    filename: file.name,
    media_type: file.type,
    size: file.size,
  }
}

export function toHistoryAttachment(attachment: PersistedChatAttachment) {
  return {
    id: attachment.id,
    name: attachment.filename,
    type: attachment.media_type,
    size: attachment.size,
    dataUrl: `/api/files/serve/${encodeURIComponent(attachment.key)}`,
  }
}

export function getPersistedHistoryAttachments(executionData: unknown) {
  if (!isRecord(executionData) || !Array.isArray(executionData.userAttachments)) {
    return []
  }

  return executionData.userAttachments.filter(isPersistedChatAttachment).map(toHistoryAttachment)
}

export function getPersistedGeneratedImages(executionData: unknown): AssistantGeneratedImage[] {
  if (!isRecord(executionData) || !Array.isArray(executionData.generatedImages)) {
    return []
  }

  return executionData.generatedImages.filter(isPersistedGeneratedImage)
}

function buildExecutionDataUpdate(
  existingExecutionData: unknown,
  patch: PersistedExecutionDataPatch
): Record<string, unknown> {
  const executionData = isRecord(existingExecutionData) ? existingExecutionData : {}

  return {
    ...executionData,
    ...(patch.userAttachments ? { userAttachments: patch.userAttachments } : {}),
    ...(patch.knowledgeRefs && patch.knowledgeRefs.length > 0
      ? { knowledgeRefs: patch.knowledgeRefs }
      : {}),
    ...(patch.generatedImages && patch.generatedImages.length > 0
      ? { generatedImages: patch.generatedImages }
      : {}),
  }
}

export async function updateExecutionHistoryData(
  executionId: string,
  patch: PersistedExecutionDataPatch
): Promise<void> {
  const [executionLog] = await db
    .select({ executionData: workflowExecutionLogs.executionData })
    .from(workflowExecutionLogs)
    .where(eq(workflowExecutionLogs.executionId, executionId))
    .limit(1)

  await db
    .update(workflowExecutionLogs)
    .set({
      executionData: buildExecutionDataUpdate(executionLog?.executionData, patch),
    })
    .where(eq(workflowExecutionLogs.executionId, executionId))
}
