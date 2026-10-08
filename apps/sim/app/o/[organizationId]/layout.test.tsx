import type { ReactNode } from 'react'
import { authMockFns } from '@sim/testing'
import { authClientMock, authClientMockFns } from '@sim/testing/mocks/auth-client.mock'
import { nextNavigationMock } from '@sim/testing/mocks/next-navigation.mock'
import { reactQueryMock } from '@sim/testing/mocks/react-query.mock'
import { tableTtlAvailabilityMock } from '@sim/testing/mocks/table-ttl-availability.mock'
import { dehydrate } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDeploymentShape } from '@/lib/core/config/deployment-shape'

const { mockGetOrganizationSurfaceContext, mockWorkspaceChrome, mockPrefetchOrganizationSidebar } =
  vi.hoisted(() => ({
    mockGetOrganizationSurfaceContext: vi.fn(),
    mockWorkspaceChrome: vi.fn(({ children }: { children: ReactNode }) => children),
    mockPrefetchOrganizationSidebar: vi.fn(async () => undefined),
  }))

vi.mock('@/lib/table/ttl-availability', () => tableTtlAvailabilityMock)
vi.mock('@/lib/dashboards/feature-flag', () => ({
  isDashboardsEnabled: vi.fn(async () => false),
}))
vi.mock('@/lib/mothership/feature-flags', () => ({
  isMothershipModelSelectorEnabled: vi.fn(async () => false),
  isPlanModeEnabled: vi.fn(async () => false),
}))
vi.mock('@/app/workspace/providers/socket-provider', () => ({
  SocketProvider: ({ children }: { children: import('react').ReactNode }) => children,
}))
vi.mock('@/lib/auth/auth-client', () => authClientMock)
vi.mock('@/hooks/queries/admin-users', () => ({
  useStopImpersonating: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/stores', () => ({ clearUserData: vi.fn() }))
vi.mock('@/lib/auth/stale-session-recovery', () => ({
  recoverFromStaleSession: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => reactQueryMock)

vi.mock('@/app/_shell/providers/get-query-client', () => ({
  getQueryClient: () => ({}),
}))

vi.mock('@/app/o/[organizationId]/prefetch', () => ({
  prefetchOrganizationSidebar: mockPrefetchOrganizationSidebar,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: '1' })) })),
}))

vi.mock('next/navigation', () => nextNavigationMock)

vi.mock('@/lib/organizations/surface', () => ({
  getOrganizationSurfaceContext: mockGetOrganizationSurfaceContext,
}))

vi.mock('@/app/o/[organizationId]/components/organization-sidebar', () => ({
  OrganizationSidebar: () => null,
}))

vi.mock('@/app/workspace/[workspaceId]/components/workspace-chrome', () => ({
  WorkspaceChrome: mockWorkspaceChrome,
}))

vi.mock('@/app/workspace/[workspaceId]/providers/global-commands-provider', () => ({
  GlobalCommandsProvider: ({ children }: { children: ReactNode }) => children,
}))

import OrganizationLayout from '@/app/o/[organizationId]/layout'

const mockGetSession = authMockFns.mockGetSession
const mockUseSession = authClientMockFns.mockUseSession

const SURFACE_CONTEXT = {
  organization: { id: 'org-1', name: 'Acme', slug: 'acme', logo: null, memberCount: 1 },
  viewer: { role: 'admin', isAdmin: true },
  searchAccess: { memberScoped: true, sourceMirrored: true },
  deployment: resolveDeploymentShape(),
}

describe('OrganizationLayout', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      user: { id: 'viewer-1' },
      session: { id: 'session-1', activeOrganizationId: 'active-org' },
    })
    mockUseSession.mockReturnValue({ data: { user: { id: 'viewer-1' } }, isPending: false })
  })

  it('returns signed-out visitors to the organization entry after sign-in', async () => {
    mockGetSession.mockResolvedValue(null)

    await expect(
      OrganizationLayout({
        children: null,
        params: Promise.resolve({ organizationId: 'org-1' }),
      })
    ).rejects.toThrow('redirect:/login?callbackUrl=%2Fo%2Forg-1')
    expect(mockGetOrganizationSurfaceContext).not.toHaveBeenCalled()
    expect(mockPrefetchOrganizationSidebar).not.toHaveBeenCalled()
  })

  it('renders the surface for a member in the Search rollout and seeds the chrome from the collapse cookie', async () => {
    mockGetOrganizationSurfaceContext.mockResolvedValue(SURFACE_CONTEXT)

    const element = await OrganizationLayout({
      children: <div>Organization child</div>,
      params: Promise.resolve({ organizationId: 'org-1' }),
    })
    const html = renderToStaticMarkup(element)

    expect(mockGetOrganizationSurfaceContext).toHaveBeenCalledWith('org-1', 'viewer-1')
    expect(mockPrefetchOrganizationSidebar).toHaveBeenCalledWith(
      {},
      'org-1',
      { kind: 'session', userId: 'viewer-1', sessionId: 'session-1' },
      'active-org'
    )
    expect(html).toContain('Organization child')
    expect(html).not.toContain('Stop impersonating')
    expect(mockWorkspaceChrome).toHaveBeenCalledWith(
      expect.objectContaining({ initialSidebarCollapsed: true }),
      undefined
    )
  })

  it('shows the shared impersonation banner above organization content', async () => {
    const session = {
      user: { id: 'viewer-1', name: 'QA Member', email: 'member@example.com' },
      session: { id: 'session-1', impersonatedBy: 'platform-admin' },
    }
    mockGetSession.mockResolvedValue(session)
    mockUseSession.mockReturnValue({ data: session, isPending: false })
    mockGetOrganizationSurfaceContext.mockResolvedValue(SURFACE_CONTEXT)

    const html = renderToStaticMarkup(
      await OrganizationLayout({
        children: <div>Organization child</div>,
        params: Promise.resolve({ organizationId: 'org-1' }),
      })
    )

    expect(mockGetOrganizationSurfaceContext).toHaveBeenCalledWith('org-1', 'viewer-1')
    expect(mockPrefetchOrganizationSidebar).toHaveBeenCalledWith(
      {},
      'org-1',
      { kind: 'session', userId: 'viewer-1', sessionId: 'session-1' },
      null
    )
    expect(html).toContain('Impersonating QA Member (member@example.com)')
    expect(html).toContain('Stop impersonating')
    expect(html.indexOf('Stop impersonating')).toBeLessThan(html.indexOf('Organization child'))
  })

  it('does not use the impersonating admin to enter an organization outside the rollout', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'customer-member' },
      session: { id: 'session-1', impersonatedBy: 'platform-admin' },
    })
    mockGetOrganizationSurfaceContext.mockResolvedValue({
      ...SURFACE_CONTEXT,
      searchAccess: { memberScoped: false, sourceMirrored: false },
    })

    await expect(
      OrganizationLayout({
        children: <div>Organization child</div>,
        params: Promise.resolve({ organizationId: 'customer-org' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT:/workspace?redirect=settings')
    expect(mockGetOrganizationSurfaceContext).toHaveBeenCalledWith(
      'customer-org',
      'customer-member'
    )
    expect(mockWorkspaceChrome).not.toHaveBeenCalled()
    expect(mockPrefetchOrganizationSidebar).not.toHaveBeenCalled()
  })

  it('renders the surface for a member when Search is rolled out', async () => {
    mockGetOrganizationSurfaceContext.mockResolvedValue({
      ...SURFACE_CONTEXT,
      viewer: { role: 'member', isAdmin: false },
    })

    const html = renderToStaticMarkup(
      await OrganizationLayout({
        children: <div>Organization child</div>,
        params: Promise.resolve({ organizationId: 'org-1' }),
      })
    )

    expect(html).toContain('Organization child')
    expect(mockWorkspaceChrome).toHaveBeenCalled()
  })

  it('renders an explicit denial for a non-member without the surface', async () => {
    mockGetOrganizationSurfaceContext.mockResolvedValue(null)

    const element = await OrganizationLayout({
      children: <div>Secret organization child</div>,
      params: Promise.resolve({ organizationId: 'org-denied' }),
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('Organization access denied')
    expect(html).not.toContain('Secret organization child')
    expect(mockWorkspaceChrome).not.toHaveBeenCalled()
    expect(mockPrefetchOrganizationSidebar).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'member'])(
    'returns %s viewers outside the rollout to workspace settings before rendering org chrome',
    async (role) => {
      mockGetOrganizationSurfaceContext.mockResolvedValue({
        ...SURFACE_CONTEXT,
        viewer: { role, isAdmin: role !== 'member' },
        searchAccess: { memberScoped: false, sourceMirrored: true },
      })

      await expect(
        OrganizationLayout({
          children: <div>Organization settings</div>,
          params: Promise.resolve({ organizationId: 'org-1' }),
        })
      ).rejects.toThrow('NEXT_REDIRECT:/workspace?redirect=settings')
      expect(mockWorkspaceChrome).not.toHaveBeenCalled()
      expect(mockPrefetchOrganizationSidebar).not.toHaveBeenCalled()
    }
  )

  it('waits for sidebar reads before serializing hydration', async () => {
    const ready = Promise.withResolvers<void>()
    mockGetOrganizationSurfaceContext.mockResolvedValue(SURFACE_CONTEXT)
    mockPrefetchOrganizationSidebar.mockReturnValue(ready.promise)
    const pending = OrganizationLayout({
      children: null,
      params: Promise.resolve({ organizationId: 'org-1' }),
    })
    await vi.waitFor(() => expect(mockPrefetchOrganizationSidebar).toHaveBeenCalledOnce(), {
      interval: 1,
    })
    expect(dehydrate).not.toHaveBeenCalled()
    ready.resolve()
    await pending
    expect(dehydrate).toHaveBeenCalledOnce()
  })
})
