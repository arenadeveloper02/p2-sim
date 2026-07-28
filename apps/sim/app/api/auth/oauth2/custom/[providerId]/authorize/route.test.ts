/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockCheckWorkspaceAccess,
  mockGetOrganizationOAuthApp,
  mockCanUseZoomAdminInWorkspace,
  mockCreateCustomOAuthAppState,
  mockCreateConnectDraft,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCheckWorkspaceAccess: vi.fn(),
  mockGetOrganizationOAuthApp: vi.fn(),
  mockCanUseZoomAdminInWorkspace: vi.fn(),
  mockCreateCustomOAuthAppState: vi.fn(),
  mockCreateConnectDraft: vi.fn(),
}))

vi.mock('@/lib/auth/auth', () => ({
  getSession: mockGetSession,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: mockCheckWorkspaceAccess,
}))

vi.mock('@/lib/oauth/custom-apps', () => ({
  getOrganizationOAuthApp: mockGetOrganizationOAuthApp,
  createCustomOAuthAppState: mockCreateCustomOAuthAppState,
}))

vi.mock('@/lib/workspaces/can-use-zoom-admin', () => ({
  canUseZoomAdminInWorkspace: mockCanUseZoomAdminInWorkspace,
}))

vi.mock('@/lib/credentials/connect-draft', () => ({
  createConnectDraft: mockCreateConnectDraft,
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}))

vi.mock('@sim/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ organizationId: 'org-1' }]),
        }),
      }),
    }),
  },
}))

vi.mock('@sim/db/schema', () => ({
  workspace: { id: 'id', organizationId: 'organizationId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

import { GET } from '@/app/api/auth/oauth2/custom/[providerId]/authorize/route'

describe('custom OAuth authorize — zoom-admin allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockCheckWorkspaceAccess.mockResolvedValue({ canWrite: true, hasAccess: true })
    mockGetOrganizationOAuthApp.mockResolvedValue({
      clientId: 'zoom-admin-client',
      clientSecret: 'secret',
    })
    mockCreateCustomOAuthAppState.mockResolvedValue('state-1')
    mockCreateConnectDraft.mockResolvedValue(undefined)
  })

  it('rejects zoom-admin when workspace is not allowed', async () => {
    mockCanUseZoomAdminInWorkspace.mockResolvedValue(false)

    const request = createMockRequest(
      'GET',
      undefined,
      {},
      'http://localhost:3000/api/auth/oauth2/custom/zoom-admin/authorize?workspaceId=ws-blocked'
    )
    const response = await GET(request, {
      params: Promise.resolve({ providerId: 'zoom-admin' }),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('zoom_admin_workspace_not_allowed')
    expect(mockCreateConnectDraft).not.toHaveBeenCalled()
  })

  it('continues zoom-admin authorize when workspace is allowed', async () => {
    mockCanUseZoomAdminInWorkspace.mockResolvedValue(true)

    const request = createMockRequest(
      'GET',
      undefined,
      {},
      'http://localhost:3000/api/auth/oauth2/custom/zoom-admin/authorize?workspaceId=ws-allowed'
    )
    const response = await GET(request, {
      params: Promise.resolve({ providerId: 'zoom-admin' }),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('zoom.us')
    expect(mockCreateConnectDraft).toHaveBeenCalled()
    expect(mockCanUseZoomAdminInWorkspace).toHaveBeenCalledWith({
      workspaceId: 'ws-allowed',
      organizationId: 'org-1',
    })
  })
})
