/**
 * Defense-in-depth ceiling on the size of any single workspace file upload.
 * Enforced both server-side (upload-session creation) and client-side (Files tab) so
 * users get fast feedback before bytes are streamed.
 */
export const MAX_WORKSPACE_FILE_SIZE = 5 * 1024 * 1024 * 1024

const MAX_POSTGRES_INTEGER = 2_147_483_647

/**
 * Keeps the legacy int4 metadata projection writable while `size_bytes` stores the exact value.
 */
export function toLegacyWorkspaceFileSize(size: number): number {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error(`Invalid workspace file size: ${size}`)
  return Math.min(size, MAX_POSTGRES_INTEGER)
}

/**
 * Cap on the legacy FormData upload route, which buffers the whole file in
 * worker memory. Direct-to-storage uploads use {@link MAX_WORKSPACE_FILE_SIZE}.
 */
export const MAX_WORKSPACE_FORMDATA_FILE_SIZE = 100 * 1024 * 1024

/** Maximum size accepted by the knowledge-document parsing pipeline. */
export const MAX_KNOWLEDGE_DOCUMENT_FILE_SIZE = 100 * 1024 * 1024

/**
 * Rejection wording shared by every surface that admits a knowledge document.
 *
 * The size guards were upper-bound only, so a zero-byte file passed admission
 * and was stored and registered — but the parsing pipeline refuses an empty
 * buffer outright (`parseBuffer` throws before dispatching to a parser), so the
 * document could never reach anything but `failed`. A file the pipeline is
 * guaranteed to reject is a bad request, and admission is the only place a
 * caller can be told so.
 */
export const EMPTY_KNOWLEDGE_DOCUMENT_MESSAGE = 'Knowledge document cannot be empty'

export type StorageContext =
  | 'knowledge-base'
  | 'chat'
  | 'copilot'
  | 'mothership'
  | 'execution'
  | 'workspace'
  | 'table-import'
  | 'profile-pictures'
  | 'og-images'
  | 'agent-generated-images'
  | 'logs'
  | 'figma-design'
  | 'workspace-logos'
  | 'org-logos'

export type MultipartCompletionPolicy = 'create-only' | 'replace' | 'reuse-existing'

/**
 * Storage contexts that support large direct-to-storage uploads via upload
 * sessions (multipart when the object exceeds the single-PUT threshold). This
 * replaces the legacy `/api/files/multipart` allowlist.
 */
export const ALLOWED_UPLOAD_CONTEXTS = new Set<StorageContext>([
  'knowledge-base',
  'chat',
  'copilot',
  'mothership',
  'execution',
  'workspace',
  'profile-pictures',
  'og-images',
  'workspace-logos',
  'org-logos',
])

/**
 * Contexts exempt from storage quota checks. Includes system-internal contexts
 * (`logs` — written by the execution pipeline, not user-initiated) and small
 * metadata assets (`profile-pictures`, `workspace-logos`, `og-images`,
 * `org-logos`). Mothership chat attachments are also exempt because they are
 * not counted as durable workspace-file storage.
 */
export const QUOTA_EXEMPT_STORAGE_CONTEXTS = new Set<StorageContext>([
  'mothership',
  'profile-pictures',
  'workspace-logos',
  'org-logos',
  'og-images',
  'logs',
])

export interface FileInfo {
  path: string
  key: string
  name: string
  size: number
  type: string
  /** Set when upload fell back to local after S3 failed (e.g. agent-generated-images). */
  s3UploadFailed?: boolean
}

export interface StorageConfig {
  bucket?: string
  region?: string
  containerName?: string
  accountName?: string
  accountKey?: string
  connectionString?: string
}

export interface UploadFileOptions {
  file: Buffer
  fileName: string
  contentType: string
  context: StorageContext
  preserveKey?: boolean
  customKey?: string
  metadata?: Record<string, string>
  /**
   * Whether the storage service should also persist its generic metadata row.
   * Disable when a caller finalizes metadata in its own database transaction.
   */
  persistMetadata?: boolean
}

export interface DownloadFileOptions {
  key: string
  context?: StorageContext
  maxBytes?: number
}

export interface DeleteFileOptions {
  key: string
  context?: StorageContext
}

export interface StoredObjectInfo {
  size: number
  contentType?: string
  metadata?: Record<string, string>
  uploadId?: string
  version?: string
}
