import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { getZoomAdminAllowedWorkspaceIds } from '@/lib/oauth/custom-apps'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

export interface CanUseZoomAdminInWorkspaceParams {
  workspaceId: string
  /** When known, skips a workspace row lookup. */
  organizationId?: string | null
}

/**
 * Returns whether Zoom Admin (connect + account recording ops) is allowed in a workspace.
 *
 * 1. If the workspace's org has a `zoom-admin` app with a **non-empty**
 *    `allowedWorkspaceIds` list → allow only when the workspace is in that list.
 * 2. Otherwise → fall back to env `ADMIN_WORKSPACE_IDS` / `NEXT_PUBLIC_ADMIN_WORKSPACE_IDS`
 *    via {@link isAdminWorkspace}.
 */
export async function canUseZoomAdminInWorkspace(
  params: CanUseZoomAdminInWorkspaceParams
): Promise<boolean> {
  const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId.trim() : ''
  if (!workspaceId) return false

  let organizationId = params.organizationId
  if (organizationId === undefined) {
    const [row] = await db
      .select({ organizationId: workspace.organizationId })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1)
    organizationId = row?.organizationId ?? null
  }

  if (organizationId) {
    const allowlist = await getZoomAdminAllowedWorkspaceIds(organizationId)
    if (allowlist && allowlist.length > 0) {
      return allowlist.includes(workspaceId)
    }
  }

  return isAdminWorkspace(workspaceId)
}
