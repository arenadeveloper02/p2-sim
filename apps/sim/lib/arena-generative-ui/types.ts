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
/** Session-only draft preview (`/gui-apps/preview/{draftId}`). */
export const ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH = '/gui-apps/preview'
/** JSON API prefix for generative apps (`/api/gui-apps/...`). */
export const ARENA_GENERATIVE_APP_API_BASE_PATH = '/api/gui-apps'
/** Identifiers that collide with static `/gui-apps` segments. */
export const ARENA_GENERATIVE_APP_RESERVED_IDENTIFIERS = ['preview'] as const
export const ARENA_EMAIL_COOKIE_NAME = 'arena_email_id'
export const ARENA_ACCESS_DENIED_MESSAGE = 'Do not have access'

/**
 * Returns true when an identifier would shadow a static `/gui-apps` route.
 */
export function isReservedGenerativeAppIdentifier(identifier: string): boolean {
  return (ARENA_GENERATIVE_APP_RESERVED_IDENTIFIERS as readonly string[]).includes(identifier)
}

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
  /** When true, the host streams CTA tokens into DataText instead of waiting for JSON. */
  stream?: boolean
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

/** Host state path DataText should bind to while a streaming CTA is in flight. */
export const ARENA_GENERATIVE_STREAM_CONTENT_KEY = 'content'

/**
 * Action ids whose API binding has `stream: true`.
 */
export function streamingActionIdsFrom(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[]
): string[] {
  const streamingKeys = new Set(
    bindings.filter((binding) => binding.stream === true).map((binding) => binding.key)
  )
  if (streamingKeys.size === 0) return []
  return Object.entries(manifest.actions)
    .filter(([, action]) => streamingKeys.has(action.apiKey))
    .map(([actionId]) => actionId)
}

/**
 * Immediate navigate targets for streaming actions (`onSuccess.navigate`).
 */
export function streamingNavigateFrom(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[]
): Record<string, string> {
  const streamingIds = new Set(streamingActionIdsFrom(manifest, bindings))
  const targets: Record<string, string> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const path = action.onSuccess?.navigate
    if (streamingIds.has(actionId) && path) {
      targets[actionId] = path
    }
  }
  return targets
}
