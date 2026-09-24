import { getActiveOrganizationId } from '@/lib/auth/session-response'
import { isKnowledgeMemberAccessAvailable } from '@/lib/knowledge/access/availability'
import { organizationRoutes, WORKSPACES_PATH } from '@/lib/navigation/paths'
import { getOrganizationSettingsAccess } from '@/lib/organizations/settings-access'
import { resolveOrganizationLanding } from '@/lib/organizations/surface'

interface EntrySession {
  user: { id: string }
}

/**
 * Routes an organization owner or admin to Home when the organization surface is
 * enabled for them. Everyone else — viewers without an organization, members, and
 * owners or admins whose organization has not been rolled out — lands on the
 * workspace picker, which is where the signed-in app's front door pointed before
 * the organization surface existed. The default landing never opens settings: a
 * viewer who did not ask for settings must not be dropped into them.
 */
export async function resolveAppEntryPath(session: EntrySession): Promise<string> {
  const organizationId = await resolveOrganizationLanding(
    session.user.id,
    getActiveOrganizationId(session)
  )
  if (!organizationId) return WORKSPACES_PATH
  const access = await getOrganizationSettingsAccess(organizationId, session.user.id)
  if (!access.isAdmin) return WORKSPACES_PATH
  return (await isKnowledgeMemberAccessAvailable({ organizationId }))
    ? organizationRoutes(organizationId).home
    : WORKSPACES_PATH
}
