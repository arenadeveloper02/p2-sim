/**
 * @vitest-environment node
 */
import { createEnvMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetZoomAdminAllowedWorkspaceIds } = vi.hoisted(() => ({
  mockGetZoomAdminAllowedWorkspaceIds: vi.fn(),
}))

vi.mock('@/lib/core/config/env', () =>
  createEnvMock({
    ADMIN_WORKSPACE_IDS: '["ws-env-admin"]',
    ZOOM_ADMIN_ORG_IDS: '["org-1"]',
  })
)

vi.mock('@/lib/oauth/custom-apps', () => ({
  getZoomAdminAllowedWorkspaceIds: mockGetZoomAdminAllowedWorkspaceIds,
}))

import { canUseZoomAdminInWorkspace } from '@/lib/workspaces/can-use-zoom-admin'

describe('canUseZoomAdminInWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows only allowlisted workspaces when org allowlist is non-empty', async () => {
    mockGetZoomAdminAllowedWorkspaceIds.mockResolvedValue(['ws-allowed'])

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-allowed',
        organizationId: 'org-1',
      })
    ).resolves.toBe(true)

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-env-admin',
        organizationId: 'org-1',
      })
    ).resolves.toBe(false)
  })

  it('falls back to env ADMIN_WORKSPACE_IDS when allowlist is empty', async () => {
    mockGetZoomAdminAllowedWorkspaceIds.mockResolvedValue([])

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-env-admin',
        organizationId: 'org-1',
      })
    ).resolves.toBe(true)

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-other',
        organizationId: 'org-1',
      })
    ).resolves.toBe(false)
  })

  it('falls back to env when org has no zoom-admin app row', async () => {
    mockGetZoomAdminAllowedWorkspaceIds.mockResolvedValue(null)

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-env-admin',
        organizationId: 'org-1',
      })
    ).resolves.toBe(true)
  })

  it('returns false for missing workspace id', async () => {
    await expect(
      canUseZoomAdminInWorkspace({ workspaceId: '', organizationId: 'org-1' })
    ).resolves.toBe(false)
  })

  it('returns false when organization is not on ZOOM_ADMIN_ORG_IDS', async () => {
    mockGetZoomAdminAllowedWorkspaceIds.mockResolvedValue(['ws-allowed'])

    await expect(
      canUseZoomAdminInWorkspace({
        workspaceId: 'ws-allowed',
        organizationId: 'org-other',
      })
    ).resolves.toBe(false)

    expect(mockGetZoomAdminAllowedWorkspaceIds).not.toHaveBeenCalled()
  })
})
