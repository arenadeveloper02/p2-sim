/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/desktop', () => ({
  getDesktopUpdates: () => null,
}))
vi.mock('@/hooks/queries/user-profile', () => ({
  useUserProfile: () => ({ data: { id: 'user-1', name: 'Ada', email: 'ada@sim.ai' } }),
}))
vi.mock('@/lib/auth/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } } }),
}))
vi.mock('@/lib/billing/workspace-permissions', () => ({
  canViewWorkspaceBillingSettings: () => true,
}))
vi.mock('@/lib/core/config/env-flags', () => ({ isBillingEnabled: true }))
vi.mock('@/lib/workspaces/colors', () => ({ getUserColor: () => '#000000' }))
vi.mock('@/hooks/use-workspace-invite-policy', () => ({
  useWorkspaceInvitePolicy: () => ({ isInvitationsDisabled: false }),
}))
vi.mock('@/app/workspace/[workspaceId]/providers/workspace-host-provider', () => ({
  useWorkspaceHostContext: () => null,
}))
vi.mock('@/app/workspace/[workspaceId]/w/components/sidebar/sidebar', () => ({
  SidebarTooltip: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock(
  '@/app/workspace/[workspaceId]/w/components/sidebar/components/settings-sidebar/use-visible-settings-navigation',
  () => ({
    useVisibleSettingsNavigation: () => [],
    firstAccessibleSettingsSection: () => null,
  })
)
vi.mock('@/components/icons', () => ({
  SlackIcon: ({ className }: { className?: string }) => <svg className={className} />,
}))

import { SidebarFooter } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/sidebar-footer/sidebar-footer'

let container: HTMLDivElement
let root: Root

async function renderFooter() {
  await act(async () => {
    root.render(
      <SidebarFooter
        workspaceId='workspace-1'
        isCollapsed={false}
        showCollapsedTooltips={false}
        onOpenSettings={() => {}}
        onOpenSettingsMenu={() => {}}
        onOpenDocs={() => {}}
        onJoinSlack={() => {}}
        onContactSupport={() => {}}
      />
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('SidebarFooter', () => {
  it('renders the More menu and hides the help control', async () => {
    await renderFooter()

    expect(container.querySelector('[data-item-id="profile"]')).toHaveTextContent('More')
    expect(container.querySelector('[data-item-id="help"]')).not.toBeInTheDocument()
  })
})
