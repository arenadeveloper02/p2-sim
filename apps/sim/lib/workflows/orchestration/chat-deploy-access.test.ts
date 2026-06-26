/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLimit, mockGetOrganizationOwnerId } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockGetOrganizationOwnerId: vi.fn(),
}))

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockLimit,
        })),
      })),
    })),
  },
}))

vi.mock('@/lib/workspaces/policy', () => ({
  getOrganizationOwnerId: mockGetOrganizationOwnerId,
}))

import { getOrgInternalDomainEntry, resolveChatDeployAccess } from './chat-deploy-access'

describe('resolveChatDeployAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockResolvedValue([])
    mockGetOrganizationOwnerId.mockResolvedValue(null)
  })

  it('defaults to email auth with the creator email when access is omitted', async () => {
    mockLimit.mockResolvedValueOnce([{ email: 'creator@position2.com' }])

    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
    })

    expect(result).toEqual({
      authType: 'email',
      allowedEmails: ['creator@position2.com'],
    })
  })

  it('coerces public auth to email with creator email', async () => {
    mockLimit.mockResolvedValueOnce([{ email: 'creator@position2.com' }])

    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
      authType: 'public',
    })

    expect(result.authType).toBe('email')
    expect(result.allowedEmails).toEqual(['creator@position2.com'])
  })

  it('adds org domain when sharing with org via domain entry', async () => {
    mockLimit
      .mockResolvedValueOnce([{ email: 'creator@position2.com' }])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ email: 'owner@position2.com' }])
    mockGetOrganizationOwnerId.mockResolvedValue('owner-1')

    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
      allowedEmails: ['@position2.com'],
    })

    expect(result.allowedEmails).toEqual(['creator@position2.com', '@position2.com'])
  })

  it('adds org domain when shareWithOrg is true', async () => {
    mockLimit
      .mockResolvedValueOnce([{ email: 'creator@position2.com' }])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ email: 'owner@position2.com' }])
    mockGetOrganizationOwnerId.mockResolvedValue('owner-1')

    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
      shareWithOrg: true,
    })

    expect(result.allowedEmails).toEqual(['creator@position2.com', '@position2.com'])
  })

  it('preserves explicit password auth without email defaults', async () => {
    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
      authType: 'password',
    })

    expect(result).toEqual({
      authType: 'password',
      allowedEmails: [],
    })
  })

  it('preserves existing allowed emails when params omit them', async () => {
    mockLimit.mockResolvedValueOnce([{ email: 'creator@position2.com' }])

    const result = await resolveChatDeployAccess({
      userId: 'user-1',
      workspaceId: 'ws-1',
      existingAuthType: 'email',
      existingAllowedEmails: ['teammate@position2.com'],
    })

    expect(result.allowedEmails).toEqual(['creator@position2.com', 'teammate@position2.com'])
  })
})

describe('getOrgInternalDomainEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrganizationOwnerId.mockResolvedValue(null)
  })

  it('returns null when workspace has no organization', async () => {
    mockLimit.mockResolvedValueOnce([{ organizationId: null }])

    await expect(getOrgInternalDomainEntry('ws-1')).resolves.toBeNull()
  })

  it('returns @domain from organization owner email', async () => {
    mockLimit
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ email: 'owner@position2.com' }])
    mockGetOrganizationOwnerId.mockResolvedValue('owner-1')

    await expect(getOrgInternalDomainEntry('ws-1')).resolves.toBe('@position2.com')
  })
})
