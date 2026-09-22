import type { WorkspaceHostContext } from '@/lib/api/contracts/workspaces'
import { organizationRoutes } from '@/lib/navigation/paths'

/**
 * Returns the workspace's organization destination for an owner or admin.
 * Members stay in the workspace.
 */
export function getWorkspaceOrganizationHref(hostContext: WorkspaceHostContext): string | null {
  return hostContext.hostOrganizationId &&
    hostContext.viewer.isHostOrganizationAdmin &&
    hostContext.features?.organizationSearch
    ? organizationRoutes(hostContext.hostOrganizationId).root
    : null
}
