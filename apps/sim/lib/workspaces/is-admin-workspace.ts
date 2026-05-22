import { env } from '@/lib/core/config/env'

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
 * Workspace IDs from `ADMIN_WORKSPACE_IDS`.
 */
export function getAdminWorkspaceIds(): string[] {
  return parseAdminWorkspaceIds(env.ADMIN_WORKSPACE_IDS)
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
