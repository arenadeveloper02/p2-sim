import type { Spec } from '@json-render/core'

export const ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Narrows a page payload to a json-render Spec (`root` + `elements`).
 */
export function isJsonRenderSpec(value: unknown): value is Spec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.root === 'string' &&
    Boolean(record.elements) &&
    typeof record.elements === 'object' &&
    !Array.isArray(record.elements)
  )
}
/** Public host path for published generative apps (`/gui-apps/{identifier}`). */
export const ARENA_GENERATIVE_APP_BASE_PATH = '/gui-apps'
/** JSON API prefix for generative apps (`/api/gui-apps/...`). */
export const ARENA_GENERATIVE_APP_API_BASE_PATH = '/api/gui-apps'
export const ARENA_EMAIL_COOKIE_NAME = 'arena_email_id'
export const ARENA_ACCESS_DENIED_MESSAGE = 'Do not have access'

export type ArenaGenerativeHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ArenaGenerativePageHint {
  path: string
  title: string
  purpose?: string
}

export interface ArenaGenerativeHttpBinding {
  method: ArenaGenerativeHttpMethod
  url: string
  headersSecretName?: string
}

export interface ArenaGenerativeApiBinding {
  key: string
  label: string
  kind: 'workflow' | 'http'
  workflowId?: string
  http?: ArenaGenerativeHttpBinding
  inputSchema?: Array<{ name: string; type: string }>
}

export interface ArenaGenerativePageManifest {
  title: string
  path: string
  spec: Spec
}

export interface ArenaGenerativeActionManifest {
  apiKey: string
  inputMapping?: Record<string, string>
  onSuccess?: {
    navigate?: string
    setState?: Record<string, unknown>
  }
  onError?: {
    setState?: Record<string, unknown>
  }
}

export interface ArenaGenerativeAppManifest {
  entryPath: string
  pages: Record<string, ArenaGenerativePageManifest>
  actions: Record<string, ArenaGenerativeActionManifest>
}

export interface ArenaGenerativeGenerateResult {
  success: boolean
  error?: string
  title?: string
  content?: string
  manifest?: ArenaGenerativeAppManifest
}
