/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateShell, mockRecordAudit } = vi.hoisted(() => ({
  mockCreateShell: vi.fn(),
  mockRecordAudit: vi.fn(),
}))

vi.mock('@/app/api/v1/admin/middleware', () => ({
  withAdminAuth: (handler: unknown) => handler,
}))

vi.mock('@sim/audit', () => ({
  AuditAction: {
    ORGANIZATION_CREATED: 'organization.created',
  },
  AuditResourceType: {
    ORGANIZATION: 'organization',
  },
  recordAudit: mockRecordAudit,
}))

vi.mock('@/lib/organizations/client-organization', () => ({
  createClientOrganizationShell: mockCreateShell,
}))

import { POST } from '@/app/api/v1/admin/client-organizations/route'

const requestUrl = 'http://localhost:3000/api/v1/admin/client-organizations'

const requestBody = {
  clientId: 'acme_1',
  clientName: 'Acme',
  organizationName: 'Acme Corp',
}

describe('POST /api/v1/admin/client-organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a client organization shell and records audit', async () => {
    mockCreateShell.mockResolvedValue({
      success: true,
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationId: 'org_1',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub_1',
      periodStart: '2026-09-02T00:00:00.000Z',
      periodEnd: '2026-10-02T00:00:00.000Z',
      action: 'created',
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(200)
    expect(mockCreateShell).toHaveBeenCalledWith(requestBody)
    expect(mockRecordAudit).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({
      data: {
        clientId: 'acme_1',
        clientName: 'Acme',
        organizationId: 'org_1',
        organizationName: 'Acme Corp',
        subscriptionId: 'sub_1',
        periodStart: '2026-09-02T00:00:00.000Z',
        periodEnd: '2026-10-02T00:00:00.000Z',
        action: 'created',
      },
    })
  })

  it('returns already_exists without recording a create audit', async () => {
    mockCreateShell.mockResolvedValue({
      success: true,
      clientId: 'acme_1',
      clientName: 'Acme',
      organizationId: 'org_1',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub_1',
      periodStart: '2026-09-02T00:00:00.000Z',
      periodEnd: '2026-10-02T00:00:00.000Z',
      action: 'already_exists',
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(200)
    expect(mockRecordAudit).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      data: { action: 'already_exists', organizationId: 'org_1' },
    })
  })

  it('returns 400 when starter provisioning is unavailable', async () => {
    mockCreateShell.mockResolvedValue({
      success: false,
      error: 'Starter provisioning requires Arena billing to be enabled',
      failureCode: 'starter-unavailable',
    })

    const response = await POST(createMockRequest('POST', requestBody, {}, requestUrl))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Starter provisioning requires Arena billing to be enabled',
      },
    })
  })
})
