/**
 * @vitest-environment node
 */
import { authMockFns } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/components/settings/navigation', () => ({
  getSettingsSectionMeta: () => ({
    label: 'General',
    description: 'Manage your profile, appearance, and preferences.',
  }),
}))

vi.mock('@/app/workspace/arena-general-settings/arena-general-settings-shell', () => ({
  ArenaGeneralSettingsShell: ({ children }: { children: unknown }) => children,
}))

import ArenaGeneralSettingsLayout from '@/app/workspace/arena-general-settings/layout'

const mockGetSession = authMockFns.mockGetSession

describe('ArenaGeneralSettingsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'viewer-a' } })
  })

  it('redirects unauthenticated viewers to login', async () => {
    mockGetSession.mockResolvedValue(null)

    await ArenaGeneralSettingsLayout({ children: null })

    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders without a workspace id when the viewer is signed in', async () => {
    await ArenaGeneralSettingsLayout({ children: null })

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
