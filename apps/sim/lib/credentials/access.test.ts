import { credential, credentialMember } from '@sim/db/schema'
import { queueTableRows, resetDbChainMock } from '@sim/testing'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckWorkspaceAccess } = vi.hoisted(() => ({
  mockCheckWorkspaceAccess: vi.fn(),
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: mockCheckWorkspaceAccess,
}))

import { getCredentialActorContext } from '@/lib/credentials/access'

afterAll(resetDbChainMock)

const workspaceAdminAccess = { hasAccess: true, canWrite: true, canAdmin: true }
const noWorkspaceAccess = { hasAccess: false, canWrite: false, canAdmin: false }

describe('getCredentialActorContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('treats an explicit credential admin membership as admin', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    queueTableRows(credentialMember, [{ role: 'admin' }])
    mockCheckWorkspaceAccess.mockResolvedValue({ hasAccess: true, canWrite: true, canAdmin: false })

    const ctx = await getCredentialActorContext('c1', 'user1')

    expect(ctx.isAdmin).toBe(true)
  })

  it('derives credential admin from workspace admin for shared credentials', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    mockCheckWorkspaceAccess.mockResolvedValue(workspaceAdminAccess)

    const ctx = await getCredentialActorContext('c1', 'admin-user')

    expect(ctx.isAdmin).toBe(true)
  })

  it('does not derive credential admin on personal env credentials', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'env_personal' }])
    mockCheckWorkspaceAccess.mockResolvedValue(workspaceAdminAccess)

    const ctx = await getCredentialActorContext('c1', 'admin-user')

    expect(ctx.isAdmin).toBe(false)
  })

  it('is not admin for a non-admin without membership', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    mockCheckWorkspaceAccess.mockResolvedValue({
      hasAccess: true,
      canWrite: false,
      canAdmin: false,
    })

    expect(result).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns empty context when the credential does not exist', async () => {
    const ctx = await getCredentialActorContext('missing', 'user1')

    expect(result).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('exposes workspace access flags from checkWorkspaceAccess', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    mockCheckWorkspaceAccess.mockResolvedValue(noWorkspaceAccess)

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'member-1',
    })

    expect(result).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        userId: 'billed-1',
        role: 'member',
        status: 'active',
        invitedBy: 'member-1',
      })
    )
    expect(mockOnConflictDoUpdate).toHaveBeenCalled()
  })
})
