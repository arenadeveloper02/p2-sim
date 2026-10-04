'use client'

import { useRouter } from 'next/navigation'
import { organizationRoutes } from '@/lib/navigation/paths'
import { useOrganizationContext } from '@/app/o/[organizationId]/providers/organization-provider'
import { SidebarFooter } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/sidebar-footer/sidebar-footer'

interface OrganizationFooterProps {
  /** Accepted so the organization rail can share the workspace footer's call shape. */
  showDivider?: boolean
  isCollapsed: boolean
  showCollapsedTooltips: boolean
  onOpenDocs: () => void
  onJoinSlack: () => void
  onContactSupport: () => void
}

/**
 * Organization rail footer. More opens organization settings. The workspace
 * sidebar uses the same control to reveal its settings list in place.
 */
export function OrganizationFooter({
  isCollapsed,
  showCollapsedTooltips,
  onOpenDocs,
  onJoinSlack,
  onContactSupport,
}: OrganizationFooterProps) {
  const { organization } = useOrganizationContext()
  const router = useRouter()
  const settingsHref = organizationRoutes(organization.id).settingsSection('general')

  return (
    <SidebarFooter
      workspaceId={organization.id}
      isCollapsed={isCollapsed}
      showCollapsedTooltips={showCollapsedTooltips}
      onOpenSettings={() => router.push(settingsHref)}
      onOpenSettingsMenu={() => router.push(settingsHref)}
      onOpenDocs={onOpenDocs}
      onJoinSlack={onJoinSlack}
      onContactSupport={onContactSupport}
    />
  )
}
