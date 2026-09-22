/**
 * @vitest-environment jsdom
 */
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNavigate, mockPush, context } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockPush: vi.fn(),
  context: {
    organization: { id: 'org-1' },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/o/org-1/home',
}))
vi.mock('next/link', () => ({
  default: ({
    onNavigate,
    prefetch: _prefetch,
    ...props
  }: ComponentProps<'a'> & {
    prefetch?: boolean
    onNavigate?: (event: { preventDefault: () => void }) => void
  }) => (
    <a
      {...props}
      href={props.href}
      onClick={(event) => {
        event.preventDefault()
        let prevented = false
        onNavigate?.({
          preventDefault: () => {
            prevented = true
          },
        })
        if (!prevented) mockNavigate(props.href)
      }}
    />
  ),
}))
vi.mock('@/lib/auth/sign-out', () => ({ signOutAndRedirect: vi.fn() }))
vi.mock('@/lib/desktop', () => ({ getDesktopUpdates: () => null }))
vi.mock('@/hooks/use-desktop-update-state', () => ({
  useDesktopUpdateState: () => ({ status: 'idle' }),
}))
vi.mock('@/hooks/queries/user-profile', () => ({
  useUserProfile: () => ({ data: { id: 'user-1', name: 'Ada', email: 'ada@example.com' } }),
}))
vi.mock('@/app/o/[organizationId]/providers/organization-provider', () => ({
  useOrganizationContext: () => context,
}))
vi.mock('@/app/workspace/[workspaceId]/w/components/sidebar/components', () => ({
  SidebarTooltip: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/icons', () => ({
  SlackIcon: () => <svg />,
}))

import { OrganizationFooter } from '@/app/o/[organizationId]/components/organization-sidebar/components/organization-footer/organization-footer'
import { useSettingsDirtyStore } from '@/stores/settings/dirty/store'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useSettingsDirtyStore.getState().reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useSettingsDirtyStore.getState().reset()
  vi.unstubAllGlobals()
})

async function renderFooter() {
  await act(async () => {
    root.render(
      <OrganizationFooter
        showDivider={false}
        isCollapsed={false}
        showCollapsedTooltips={false}
        onOpenDocs={() => {}}
        onJoinSlack={() => {}}
        onContactSupport={() => {}}
      />
    )
  })
}

describe('OrganizationFooter settings navigation', () => {
  it('opens organization settings from More', async () => {
    await renderFooter()
    const trigger = container.querySelector<HTMLButtonElement>('[data-item-id="profile"]')
    expect(trigger).toHaveTextContent('More')

    await act(async () => {
      trigger?.click()
    })

    expect(mockPush).toHaveBeenCalledWith('/o/org-1/settings/general')
  })
})
