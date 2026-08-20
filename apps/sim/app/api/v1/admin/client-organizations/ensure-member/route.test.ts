/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsure, mockAuthenticateAdminRequest } = vi.hoisted(() => ({
  mockEnsure: vi.fn(),
  mockAuthenticateAdminRequest: vi.fn(),
}))

vi.mock('@/app/api/v1/admin/auth', () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}))

vi.mock('@sim/audit', () => ({
  AuditAction: {
    ORGANIZATION_CREATED: 'organization.created',
    ORG_MEMBER_ADDED: 'org_member.added',
  },
  AuditResourceType: {
    ORGANIZATION: 'organization',
  },
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/organizations/client-organization', () => ({
  ensureClientOrganizationMember: mockEnsure,
}))

import { POST } from '@/app/api/v1/admin/client-organizations/ensure-member/route'

describe('POST /api/v1/admin/client-organizations/ensure-member', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticateAdminRequest.mockReturnValue({ authenticated: true })
  })

  it('returns organization_created payload on success', async () => {
    mockEnsure.mockResolvedValue({
      success: true,
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationId: 'org_1',
      memberId: 'mem_1',
      role: 'owner',
      action: 'organization_created',
      personalWorkspaceId: 'ws_personal',
      sharedWorkspaceIds: ['ws_client'],
      attachedWorkspaceIds: [],
    })

    const request = createMockRequest('POST', {
      userId: 'user_1',
      orgDetails: {
        clientId: 'acme_1',
        clientName: 'Acme',
        organizationName: 'Acme Corp',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toMatchObject({
      clientId: 'acme_1',
      organizationId: 'org_1',
      role: 'owner',
      action: 'organization_created',
      personalWorkspaceId: 'ws_personal',
      sharedWorkspaceIds: ['ws_client'],
    })
    expect(mockEnsure).toHaveBeenCalledWith({
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationName: 'Acme Corp',
      userId: 'user_1',
    })
  })

  it('returns 404 when user is missing', async () => {
    mockEnsure.mockResolvedValue({
      success: false,
      error: 'User not found',
      failureCode: 'user-not-found',
    })

    const request = createMockRequest('POST', {
      userId: 'missing',
      orgDetails: {
        clientId: 'acme_1',
        clientName: 'Acme',
        organizationName: 'Acme Corp',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(404)
  })

  it('returns 400 when user is already in another org', async () => {
    mockEnsure.mockResolvedValue({
      success: false,
      error: 'User is already a member of another organization.',
      failureCode: 'already-in-other-organization',
      existingOrgId: 'org_other',
    })

    const request = createMockRequest('POST', {
      userId: 'user_1',
      orgDetails: {
        clientId: 'acme_1',
        clientName: 'Acme',
        organizationName: 'Acme Corp',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
