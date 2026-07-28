/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockListOrganizationOAuthApps,
  mockUpsertOrganizationOAuthApp,
  mockValidateOrgWorkspaceAllowlist,
  mockIsZoomAdminEnabledForOrganization,
  mockListCustomOAuthAppKeysForOrganization,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListOrganizationOAuthApps: vi.fn(),
  mockUpsertOrganizationOAuthApp: vi.fn(),
  mockValidateOrgWorkspaceAllowlist: vi.fn(),
  mockIsZoomAdminEnabledForOrganization: vi.fn(),
  mockListCustomOAuthAppKeysForOrganization: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}))

vi.mock('@/lib/oauth/custom-apps', () => ({
  listOrganizationOAuthApps: mockListOrganizationOAuthApps,
  upsertOrganizationOAuthApp: mockUpsertOrganizationOAuthApp,
  validateOrgWorkspaceAllowlist: mockValidateOrgWorkspaceAllowlist,
}))

vi.mock('@/lib/workspaces/zoom-admin-org', () => ({
  isZoomAdminEnabledForOrganization: mockIsZoomAdminEnabledForOrganization,
  listCustomOAuthAppKeysForOrganization: mockListCustomOAuthAppKeysForOrganization,
}))

vi.mock('@sim/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ role: 'owner', organizationId: 'org-1', userId: 'user-1' }]),
        }),
      }),
    }),
  },
}))

vi.mock('@sim/db/schema', () => ({
  member: { organizationId: 'organizationId', userId: 'userId' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}))

import { GET, POST } from '@/app/api/organizations/[id]/oauth-apps/route'

describe('Organization OAuth Apps — Zoom Admin org gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockListCustomOAuthAppKeysForOrganization.mockReturnValue(['zoom'])
    mockIsZoomAdminEnabledForOrganization.mockReturnValue(false)
    mockListOrganizationOAuthApps.mockResolvedValue([])
  })

  it('GET omits zoom-admin for non-allowlisted orgs', async () => {
    const response = await GET(createMockRequest('GET'), {
      params: Promise.resolve({ id: 'org-other' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.apps.every((app: { appKey: string }) => app.appKey !== 'zoom-admin')).toBe(true)
  })

  it('POST rejects zoom-admin for non-allowlisted orgs', async () => {
    const response = await POST(
      createMockRequest('POST', {
        appKey: 'zoom-admin',
        clientId: 'client',
        clientSecret: 'secret',
        allowedWorkspaceIds: [],
      }),
      { params: Promise.resolve({ id: 'org-other' }) }
    )

    expect(response.status).toBe(403)
    expect(mockUpsertOrganizationOAuthApp).not.toHaveBeenCalled()
  })
})
