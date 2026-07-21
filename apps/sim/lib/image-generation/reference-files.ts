import { normalizeFileInput } from '@/blocks/utils'
import { START_FILES_REF } from '@/executor/constants'

export const CONVERSATION_IMAGE_REF_SOURCE = 'conversation-image' as const

export interface ConversationImageRef {
  source: typeof CONVERSATION_IMAGE_REF_SOURCE
  id: string
  messageId: string
  name: string
  url: string
  type: string
  key?: string
  size?: number
}

export function isStartFilesRef(value: unknown): value is typeof START_FILES_REF {
  return value === START_FILES_REF
}

export function isConversationImageRef(value: unknown): value is ConversationImageRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.source === CONVERSATION_IMAGE_REF_SOURCE &&
    typeof record.id === 'string' &&
    typeof record.messageId === 'string' &&
    typeof record.url === 'string'
  )
}

export function isWorkspaceUploadedFile(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  if (isConversationImageRef(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    (typeof record.path === 'string' || typeof record.url === 'string')
  )
}

export interface ParsedReferenceFileValue {
  includeStartFiles: boolean
  workspaceFiles: Record<string, unknown>[]
  conversationImages: ConversationImageRef[]
}

/**
 * Normalizes a file-upload subblock value into start-files, workspace, and conversation selections.
 */
export function parseReferenceFileValue(value: unknown): ParsedReferenceFileValue {
  if (isStartFilesRef(value)) {
    return { includeStartFiles: true, workspaceFiles: [], conversationImages: [] }
  }

  if (!value) {
    return { includeStartFiles: false, workspaceFiles: [], conversationImages: [] }
  }

  const items = Array.isArray(value) ? value : [value]
  let includeStartFiles = false
  const workspaceFiles: Record<string, unknown>[] = []
  const conversationImages: ConversationImageRef[] = []

  for (const item of items) {
    if (isStartFilesRef(item)) {
      includeStartFiles = true
      continue
    }
    if (isConversationImageRef(item)) {
      conversationImages.push(item)
      continue
    }
    if (isWorkspaceUploadedFile(item)) {
      workspaceFiles.push(item)
    }
  }

  return { includeStartFiles, workspaceFiles, conversationImages }
}

/**
 * Builds the stored subblock value from parsed reference file parts.
 */
export function buildReferenceFileValue(parts: ParsedReferenceFileValue): unknown {
  const items: unknown[] = []

  if (parts.includeStartFiles) {
    items.push(START_FILES_REF)
  }

  items.push(...parts.workspaceFiles, ...parts.conversationImages)

  if (items.length === 0) {
    return null
  }

  if (items.length === 1 && isStartFilesRef(items[0])) {
    return START_FILES_REF
  }

  return items
}

/**
 * Flattens nested file arrays produced when `<start.files>` resolves to multiple files.
 */
export function flattenReferenceFileInputs(input: unknown): unknown[] {
  const flatten = (value: unknown): unknown[] => {
    if (value === null || value === undefined || value === '') {
      return []
    }

    if (Array.isArray(value)) {
      return value.flatMap(flatten)
    }

    return [value]
  }

  return flatten(input)
}

/**
 * Normalizes block file params that may mix workspace files, conversation refs, and resolved start.files arrays.
 */
export function normalizeReferenceFileParams(input: unknown): unknown[] | undefined {
  const flattened = flattenReferenceFileInputs(input)
  const files: unknown[] = []

  for (const item of flattened) {
    const normalized = normalizeFileInput(item)
    if (Array.isArray(normalized)) {
      files.push(...normalized)
      continue
    }
    if (normalized) {
      files.push(normalized)
      continue
    }
    if (item !== null && item !== undefined && item !== '') {
      files.push(item)
    }
  }

  return files.length > 0 ? files : undefined
}
