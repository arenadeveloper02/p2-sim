import { env } from '@/lib/core/config/env'
import { listCustomOAuthAppKeys } from '@/lib/oauth/custom-app-config'
import { parseAdminWorkspaceIds } from '@/lib/workspaces/is-admin-workspace'

/** Org IDs from `ZOOM_ADMIN_ORG_IDS`. Empty/unset → no org may use Zoom Admin. */
export function isZoomAdminEnabledForOrganization(
  organizationId: string | null | undefined
): boolean {
  if (!organizationId?.trim()) return false
  const allowed = parseAdminWorkspaceIds(env.ZOOM_ADMIN_ORG_IDS)
  return allowed.length > 0 && allowed.includes(organizationId.trim())
}

/** Custom OAuth app keys for settings; omits `zoom-admin` unless the org is allowlisted. */
export function listCustomOAuthAppKeysForOrganization(
  organizationId: string | null | undefined
): string[] {
  const keys = listCustomOAuthAppKeys()
  if (isZoomAdminEnabledForOrganization(organizationId)) return keys
  return keys.filter((appKey) => appKey !== 'zoom-admin')
}
