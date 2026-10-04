/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResolveOrganizationLanding, mockSearchAvailable, mockSettingsAccess } = vi.hoisted(
  () => ({
    mockResolveOrganizationLanding: vi.fn(),
    mockSearchAvailable: vi.fn(),
    mockSettingsAccess: vi.fn(),
  })
)

vi.mock('@/lib/knowledge/access/availability', () => ({
  isKnowledgeMemberAccessAvailable: mockSearchAvailable,
}))

vi.mock('@/lib/organizations/surface', () => ({
  resolveOrganizationLanding: mockResolveOrganizationLanding,
}))

vi.mock('@/lib/organizations/settings-access', () => ({
  getOrganizationSettingsAccess: mockSettingsAccess,
}))

import { resolveAppEntryPath } from '@/lib/navigation/resolve-app-entry'

describe('resolveAppEntryPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchAvailable.mockResolvedValue(true)
    mockSettingsAccess.mockResolvedValue({ isAdmin: true, isMember: true, role: 'admin' })
  })

  it('lands an organization owner or admin on that organization home', async () => {
    mockResolveOrganizationLanding.mockResolvedValue('org-2')

    await expect(
      resolveAppEntryPath({
        user: { id: 'viewer' },
        session: { activeOrganizationId: 'org-2' },
      })
    ).resolves.toBe('/o/org-2/home')
    expect(mockResolveOrganizationLanding).toHaveBeenCalledWith('viewer', 'org-2')
    expect(mockSettingsAccess).toHaveBeenCalledWith('org-2', 'viewer')
    expect(mockSearchAvailable).toHaveBeenCalledWith({ organizationId: 'org-2' })
  })

  it('lands an organization member on the workspace picker', async () => {
    mockResolveOrganizationLanding.mockResolvedValue('org-2')
    mockSettingsAccess.mockResolvedValue({ isAdmin: false, isMember: true, role: 'member' })

    await expect(resolveAppEntryPath({ user: { id: 'viewer' } })).resolves.toBe('/workspace')
    expect(mockSearchAvailable).not.toHaveBeenCalled()
  })

  it('lands an organization owner or admin on the workspace picker when Search is disabled', async () => {
    mockResolveOrganizationLanding.mockResolvedValue('org-2')
    mockSearchAvailable.mockResolvedValue(false)
    await expect(resolveAppEntryPath({ user: { id: 'viewer' } })).resolves.toBe('/workspace')
  })

  it('lands a viewer with no organization on the workspace picker', async () => {
    mockResolveOrganizationLanding.mockResolvedValue(null)

    await expect(resolveAppEntryPath({ user: { id: 'viewer' } })).resolves.toBe('/workspace')
    expect(mockResolveOrganizationLanding).toHaveBeenCalledWith('viewer', null)
    expect(mockSearchAvailable).not.toHaveBeenCalled()
  })
})
