/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsure, mockRecordAudit } = vi.hoisted(() => ({
  mockEnsure: vi.fn(),
  mockRecordAudit: vi.fn(),
}))

vi.mock('@/app/api/v1/admin/middleware', () => ({
  withAdminAuth: (handler: unknown) => handler,
}))

vi.mock('@sim/audit', () => ({
  AuditAction: {
    ORGANIZATION_CREATED: 'organization.created',
    ORG_MEMBER_ADDED: 'org_member.added',
  },
  AuditResourceType: {
    ORGANIZATION: 'organization',
  },
  recordAudit: mockRecordAudit,
}))

vi.mock('@/lib/organizations/client-organization', () => ({
  ensureClientOrganizationMember: mockEnsure,
}))

import { POST } from '@/app/api/v1/admin/client-organizations/ensure-member/route'

const requestUrl = 'http://localhost:3000/api/v1/admin/client-organizations/ensure-member'

const requestBody = {
  userId: 'user_1',
  orgDetails: {
    clientId: 'acme_1',
    clientName: 'Acme',
    organizationName: 'Acme Corp',
  },
}

describe('POST /api/v1/admin/client-organizations/ensure-member', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns organization_created payload on success', async () => {
    mockEnsure.mockResolvedValue({
      success: true,
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationId: 'org_1',
      memberId: 'member_1',
      role: 'owner',
      action: 'organization_created',
      personalWorkspaceId: 'ws_personal',
      sharedWorkspaceIds: ['ws_shared'],
      attachedWorkspaceIds: ['ws_attached'],
      userName: 'Ada',
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(200)
    expect(mockEnsure).toHaveBeenCalledWith({
      userId: 'user_1',
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationName: 'Acme Corp',
    })
    expect(mockRecordAudit).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      data: {
        clientId: 'acme_1',
        clientName: 'Acme',
        organizationId: 'org_1',
        memberId: 'member_1',
        role: 'owner',
        action: 'organization_created',
        personalWorkspaceId: 'ws_personal',
        sharedWorkspaceIds: ['ws_shared'],
        attachedWorkspaceIds: ['ws_attached'],
      },
    })
  })

  it('returns an existing membership without recording an add audit', async () => {
    mockEnsure.mockResolvedValue({
      success: true,
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationId: 'org_1',
      memberId: 'member_1',
      role: 'member',
      action: 'already_member',
      personalWorkspaceId: 'ws_personal',
      sharedWorkspaceIds: ['ws_shared'],
      attachedWorkspaceIds: [],
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(200)
    expect(mockRecordAudit).not.toHaveBeenCalled()
  })

  it('returns a conflict when the user belongs to another organization', async () => {
    mockEnsure.mockResolvedValue({
      success: false,
      error: 'User is already a member of another organization.',
      failureCode: 'already-in-other-organization',
      existingOrgId: 'org_existing',
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'User is already a member of another organization.',
      },
    })
  })

  it('rejects an invalid body before calling the organization service', async () => {
    const response = await POST(createMockRequest('POST', { userId: 'user_1' }, {}, requestUrl))

    expect(response.status).toBe(400)
    expect(mockEnsure).not.toHaveBeenCalled()
  })
})
