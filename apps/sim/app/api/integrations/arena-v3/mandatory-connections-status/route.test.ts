/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockDb,
  mockEq,
  mockAnd,
  mockInArray,
  mockSql,
  mockAuthenticateApiKeyFromHeader,
  mockUpdateApiKeyLastUsed,
  mockGetUserEntityPermissions,
} = vi.hoisted(() => {
  const db = {
    select: vi.fn().mockReturnThis(),
    selectDistinct: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  }
  return {
    mockGetSession: vi.fn(),
    mockDb: db,
    mockEq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
    mockAnd: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({ type: 'inArray', field, values })),
    mockSql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings,
      values,
    })),
    mockAuthenticateApiKeyFromHeader: vi.fn(),
    mockUpdateApiKeyLastUsed: vi.fn(),
    mockGetUserEntityPermissions: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}))

vi.mock('@/lib/api-key/service', () => ({
  authenticateApiKeyFromHeader: mockAuthenticateApiKeyFromHeader,
  updateApiKeyLastUsed: mockUpdateApiKeyLastUsed,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  getUserEntityPermissions: mockGetUserEntityPermissions,
}))

vi.mock('@sim/db', () => ({
  db: mockDb,
  account: { userId: 'userId', providerId: 'providerId' },
  user: { email: 'email', id: 'id' },
  eq: mockEq,
}))

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
  sql: mockSql,
}))

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: vi.fn().mockReturnValue('req-test'),
}))

import { GET } from '@/app/api/integrations/arena-v3/mandatory-connections-status/route'

describe('GET /api/integrations/arena-v3/mandatory-connections-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnThis()
    mockDb.selectDistinct.mockReturnThis()
    mockDb.from.mockReturnThis()
    mockDb.where.mockReturnThis()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    const res = await GET(createMockRequest('GET'))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('authentication_required')
  })

  it('returns notConnectedProviderIds for missing links and stable order', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ email: 'arena@example.com' }])

    mockDb.where.mockResolvedValueOnce([
      { providerId: 'google-email' },
      { providerId: 'google-drive' },
    ])

    const res = await GET(createMockRequest('GET'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.email).toBe('arena@example.com')
    expect(data.allMandatoryConnected).toBe(false)
    expect(data.connectedProviderIds).toEqual(['google-email', 'google-drive'])
    expect(data.notConnectedProviderIds).toEqual(['google-calendar', 'google-sheets', 'slack'])
  })

  it('returns allMandatoryConnected when all five are linked', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ email: 'arena@example.com' }])

    mockDb.where.mockResolvedValueOnce([
      { providerId: 'google-email' },
      { providerId: 'google-calendar' },
      { providerId: 'google-drive' },
      { providerId: 'google-sheets' },
      { providerId: 'slack' },
    ])

    const res = await GET(createMockRequest('GET'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.allMandatoryConnected).toBe(true)
    expect(data.notConnectedProviderIds).toEqual([])
    expect(data.connectedProviderIds).toEqual([
      'google-email',
      'google-calendar',
      'google-drive',
      'google-sheets',
      'slack',
    ])
  })

  it('returns 400 when email query does not match signed-in user', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ email: 'signed-in@example.com' }])

    const res = await GET(
      createMockRequest('GET', undefined, {}, 'http://localhost/api?email=other@example.com')
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('email_mismatch')
  })

  it('returns 200 when email query matches signed-in user (case-insensitive)', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ email: 'Signed-In@Example.com' }])

    mockDb.where.mockResolvedValueOnce([{ providerId: 'google-email' }])

    const res = await GET(
      createMockRequest('GET', undefined, {}, 'http://localhost/api?email=signed-in@example.com')
    )
    expect(res.status).toBe(200)
  })

  it('returns 400 when API key is sent without email', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        {},
        'http://localhost/api?workspaceKey=sim_workspace_key_xxx'
      )
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('email_required')
  })

  it('returns 200 for workspace API key + email when user is in workspace', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    mockAuthenticateApiKeyFromHeader.mockResolvedValueOnce({
      success: true,
      userId: 'key-owner',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: 'ws-1',
    })
    mockGetUserEntityPermissions.mockResolvedValueOnce('read')

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-target', email: 'member@example.com' }])

    mockDb.where.mockResolvedValueOnce([{ providerId: 'google-email' }])

    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        {},
        'http://localhost/api?workspaceKey=sim_key&email=member@example.com'
      )
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.email).toBe('member@example.com')
    expect(mockUpdateApiKeyLastUsed).toHaveBeenCalledWith('key-1')
  })

  it('returns 403 for workspace key when target user is not in workspace', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    mockAuthenticateApiKeyFromHeader.mockResolvedValueOnce({
      success: true,
      userId: 'key-owner',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: 'ws-1',
    })
    mockGetUserEntityPermissions.mockResolvedValueOnce(null)

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-target', email: 'outsider@example.com' }])

    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        {},
        'http://localhost/api?workspaceKey=sim_key&email=outsider@example.com'
      )
    )
    expect(res.status).toBe(403)
  })

  it('returns 401 for invalid API key', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    mockAuthenticateApiKeyFromHeader.mockResolvedValueOnce({
      success: false,
      error: 'Invalid API key',
    })

    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        {},
        'http://localhost/api?workspaceKey=bad&email=any@example.com'
      )
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 for personal API key when email is not the key owner', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    mockAuthenticateApiKeyFromHeader.mockResolvedValueOnce({
      success: true,
      userId: 'owner-id',
      keyId: 'key-p',
      keyType: 'personal',
    })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ id: 'other-id', email: 'other@example.com' }])

    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        {},
        'http://localhost/api?workspaceKey=sim_personal_key&email=other@example.com'
      )
    )
    expect(res.status).toBe(403)
  })

  it('accepts API key from x-api-key header', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    mockAuthenticateApiKeyFromHeader.mockResolvedValueOnce({
      success: true,
      userId: 'owner-id',
      keyId: 'key-h',
      keyType: 'personal',
    })

    mockDb.where.mockReturnValueOnce(mockDb)
    mockDb.limit.mockResolvedValueOnce([{ id: 'owner-id', email: 'owner@example.com' }])

    mockDb.where.mockResolvedValueOnce([])

    const res = await GET(
      createMockRequest(
        'GET',
        undefined,
        { 'x-api-key': 'sim_header_key' },
        'http://localhost/api?email=owner@example.com'
      )
    )
    expect(res.status).toBe(200)
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('sim_header_key')
  })
})
