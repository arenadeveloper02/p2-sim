/**
 * Tests for OAuth credentials API route
 *
 * @vitest-environment node
 */

import {
  dbChainMock,
  dbChainMockFns,
  hybridAuthMockFns,
  permissionsMock,
  permissionsMockFns,
  resetDbChainMock,
  workflowAuthzMock,
  workflowAuthzMockFns,
  workflowsUtilsMock,
} from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAnd, mockEq, mockInArray } = vi.hoisted(() => ({
  mockAnd: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  mockEq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  mockInArray: vi.fn((column: unknown, values: unknown[]) => ({ type: 'inArray', column, values })),
}))

vi.mock('@sim/db', () => dbChainMock)

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
}))

vi.mock('@/lib/credentials/oauth', () => ({
  syncWorkspaceOAuthCredentialsForUser: vi.fn(),
}))

vi.mock('@sim/workflow-authz', () => workflowAuthzMock)

vi.mock('@/lib/workflows/utils', () => workflowsUtilsMock)

vi.mock('@/lib/workspaces/permissions/utils', () => permissionsMock)

import { GET } from '@/app/api/auth/oauth/credentials/route'

describe('OAuth Credentials API Route', () => {
  function createMockRequestWithQuery(method = 'GET', queryParams = ''): NextRequest {
    const url = `http://localhost:3000/api/auth/oauth/credentials${queryParams}`
    return new NextRequest(new URL(url), { method })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('should handle unauthenticated user', async () => {
    hybridAuthMockFns.mockCheckSessionOrInternalAuth.mockResolvedValueOnce({
      success: false,
      error: 'Authentication required',
    })

    const req = createMockRequestWithQuery('GET', '?provider=google')

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('User not authenticated')
  })

  it('should handle missing provider parameter', async () => {
    hybridAuthMockFns.mockCheckSessionOrInternalAuth.mockResolvedValueOnce({
      success: true,
      userId: 'user-123',
      authType: 'session',
    })

    const req = createMockRequestWithQuery('GET')

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Provider or credentialId is required')
  })

  it('should handle no credentials found', async () => {
    hybridAuthMockFns.mockCheckSessionOrInternalAuth.mockResolvedValueOnce({
      success: true,
      userId: 'user-123',
      authType: 'session',
    })

    const req = createMockRequestWithQuery('GET', '?provider=github')

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.credentials).toHaveLength(0)
  })

  it('should return empty credentials when no workspace context', async () => {
    hybridAuthMockFns.mockCheckSessionOrInternalAuth.mockResolvedValueOnce({
      success: true,
      userId: 'user-123',
      authType: 'session',
    })

    const req = createMockRequestWithQuery('GET', '?provider=google-email')

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.credentials).toHaveLength(0)
  })

  it('should return both zoom and zoom-admin credentials when querying zoom', async () => {
    hybridAuthMockFns.mockCheckSessionOrInternalAuth.mockResolvedValueOnce({
      success: true,
      userId: 'user-123',
      authType: 'session',
    })
    workflowAuthzMockFns.mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValueOnce({
      allowed: true,
      status: 200,
      workflow: { id: 'bc526c7d-d3c7-4523-9c64-e2ea24d570d7', workspaceId: '16ae48f8-b760-4f08-981c-6becbb19f3c8' },
      workspacePermission: 'write',
    })
    permissionsMockFns.mockCheckWorkspaceAccess.mockResolvedValueOnce({
      hasAccess: true,
      canWrite: true,
      exists: true,
      workspace: { id: '16ae48f8-b760-4f08-981c-6becbb19f3c8' },
    })
    dbChainMockFns.where.mockResolvedValueOnce([
      {
        id: 'cred-zoom',
        displayName: 'Zoom Personal',
        providerId: 'zoom',
        accountProviderId: 'zoom',
        scope: 'user:read:user',
        updatedAt: new Date('2026-05-26T10:00:00.000Z'),
      },
      {
        id: 'cred-zoom-admin',
        displayName: 'Zoom Admin',
        providerId: 'zoom-admin',
        accountProviderId: 'zoom-admin',
        scope: 'recording:read:admin',
        updatedAt: new Date('2026-05-26T10:05:00.000Z'),
      },
    ])

    const req = createMockRequestWithQuery(
      'GET',
      '?provider=zoom&workspaceId=16ae48f8-b760-4f08-981c-6becbb19f3c8&workflowId=bc526c7d-d3c7-4523-9c64-e2ea24d570d7'
    )

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.credentials).toHaveLength(2)
    expect(data.credentials.map((credential: { provider: string }) => credential.provider)).toEqual([
      'zoom',
      'zoom-admin',
    ])
    expect(mockInArray).toHaveBeenCalledWith(expect.anything(), ['zoom', 'zoom-admin'])
  })
})
