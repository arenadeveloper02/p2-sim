import { env, getEnv } from '@/lib/core/config/env'

/** Injected into subblock condition `values` during server-side serialization. */
export const WORKSPACE_ID_CONDITION_KEY = '__workspaceId'

export interface AdminWorkspaceContext {
  isAdminWorkspace: boolean
  workspaceId: string | null
}

function normalizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim()
}

type AdminWorkspaceIdsEnv = string | string[] | undefined

/**
 * Parses workspace IDs from env (array, JSON string array, or comma-separated string).
 */
export function parseAdminWorkspaceIds(raw: AdminWorkspaceIdsEnv): string[] {
  if (!raw) return []

  if (Array.isArray(raw)) {
    return raw.map(normalizeWorkspaceId).filter(Boolean)
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []

    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((id): id is string => typeof id === 'string')
          .map(normalizeWorkspaceId)
          .filter(Boolean)
      }
    } catch {
      // Fall through to comma-separated parsing
    }

    return trimmed.split(',').map(normalizeWorkspaceId).filter(Boolean)
  }

  return []
}

/**
 * Workspace IDs from `NEXT_PUBLIC_ADMIN_WORKSPACE_IDS` (client UI) and/or `ADMIN_WORKSPACE_IDS` (server).
 * Block visibility runs in the browser — set `NEXT_PUBLIC_ADMIN_WORKSPACE_IDS` for admin-only subblocks.
 */
export function getAdminWorkspaceIds(): string[] {
  const publicIds = parseAdminWorkspaceIds(getEnv('NEXT_PUBLIC_ADMIN_WORKSPACE_IDS'))
  const serverIds = parseAdminWorkspaceIds(env.ADMIN_WORKSPACE_IDS)
  if (publicIds.length === 0) return serverIds
  if (serverIds.length === 0) return publicIds
  return [...new Set([...publicIds, ...serverIds])]
}

/**
 * Resolves workspace ID during block tool param transforms (execution context or condition injection).
 */
export function resolveExecutionWorkspaceId(params?: Record<string, unknown>): string | undefined {
  const context = params?._context as { workspaceId?: string } | undefined
  if (typeof context?.workspaceId === 'string') {
    const fromContext = context.workspaceId.trim()
    if (fromContext) return fromContext
  }
  return resolveWorkspaceIdForAdminCheck(params)
}

/**
 * Resolves workspace ID for admin-only subblock conditions (browser path or serializer injection).
 */
export function resolveWorkspaceIdForAdminCheck(
  values?: Record<string, unknown>
): string | undefined {
  const fromValues = values?.[WORKSPACE_ID_CONDITION_KEY]
  if (typeof fromValues === 'string') {
    const trimmed = fromValues.trim()
    if (trimmed) return trimmed
  }

  if (typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/workspace\/([^/]+)/)
    return match?.[1]
  }

  return undefined
}

/**
 * Returns whether the workspace is configured as an admin workspace via `ADMIN_WORKSPACE_IDS`.
 */
export function isAdminWorkspace(workspaceId: string | null | undefined): boolean {
  if (!workspaceId || typeof workspaceId !== 'string') return false

  const adminWorkspaceIds = getAdminWorkspaceIds()
  if (adminWorkspaceIds.length === 0) return false

  const normalized = normalizeWorkspaceId(workspaceId)
  if (!normalized) return false

  return adminWorkspaceIds.includes(normalized)
}

/**
 * Payload helper for APIs and workflow execute bodies that need an admin-workspace flag.
 */
/** OAuth provider IDs shown only on admin workspaces (e.g. integrations settings). */
export const ADMIN_WORKSPACE_ONLY_OAUTH_PROVIDER_IDS = ['zoom-admin'] as const

/**
 * Integration tool IDs exposed to Mothership/Copilot only in admin workspaces.
 * Add entries here when a block registers separate admin-only tools in the registry.
 */
export const ADMIN_WORKSPACE_ONLY_TOOL_IDS = [
  'zoom_list_account_recordings',
  'zoom_get_account_recordings_with_transcript',
  'p2_docs_get_template_schema',
  'p2_docs_get_presentation_icons',
  'p2_docs_get_p2_users',
] as const

/**
 * Returns whether an OAuth provider is restricted to admin workspaces.
 */
export function isAdminWorkspaceOnlyOAuthProvider(providerId: string | null | undefined): boolean {
  if (!providerId || typeof providerId !== 'string') return false
  return (ADMIN_WORKSPACE_ONLY_OAUTH_PROVIDER_IDS as readonly string[]).includes(providerId)
}

/**
 * Returns whether an integration tool is restricted to admin workspaces.
 */
export function isAdminWorkspaceOnlyTool(toolId: string | null | undefined): boolean {
  if (!toolId || typeof toolId !== 'string') return false
  const normalized = toolId.trim()
  if (!normalized) return false
  const baseId = normalized.replace(/_v\d+$/, '')
  return (ADMIN_WORKSPACE_ONLY_TOOL_IDS as readonly string[]).includes(baseId)
}

/**
 * Filters OAuth services/credentials for the current workspace (hides admin-only providers elsewhere).
 * Pass `canUseZoomAdmin` when the org Zoom Admin allowlist (or env fallback) has been resolved.
 */
export function filterOAuthItemsForWorkspace<T extends { providerId?: string | null }>(
  items: T[],
  workspaceId: string | null | undefined,
  options?: { canUseZoomAdmin?: boolean }
): T[] {
  const canUseZoomAdmin = options?.canUseZoomAdmin ?? isAdminWorkspace(workspaceId)
  if (canUseZoomAdmin) return items
  return items.filter((item) => !isAdminWorkspaceOnlyOAuthProvider(item.providerId))
}

export function getAdminWorkspaceContext(
  workspaceId: string | null | undefined
): AdminWorkspaceContext {
  const normalized =
    workspaceId != null && typeof workspaceId === 'string'
      ? normalizeWorkspaceId(workspaceId) || null
      : null

  return {
    isAdminWorkspace: isAdminWorkspace(workspaceId),
    workspaceId: normalized,
  }
}
