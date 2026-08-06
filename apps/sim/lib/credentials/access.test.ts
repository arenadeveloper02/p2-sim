/**
 * @vitest-environment node
 */
import { credential, credentialMember, workspace } from '@sim/db/schema'
import { dbChainMockFns, queueTableRows, resetDbChainMock } from '@sim/testing'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckWorkspaceAccess } = vi.hoisted(() => ({
  mockCheckWorkspaceAccess: vi.fn(),
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: mockCheckWorkspaceAccess,
}))

import {
  ensureBilledAccountCredentialMembership,
  getCredentialActorContext,
} from '@/lib/credentials/access'

afterAll(resetDbChainMock)

const workspaceAdminAccess = {
  hasAccess: true,
  canWrite: true,
  canAdmin: true,
}
const noWorkspaceAccess = {
  hasAccess: false,
  canWrite: false,
  canAdmin: false,
}

describe('ensureBilledAccountCredentialMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('skips non-org workspaces', async () => {
    queueTableRows(workspace, [{ organizationId: null, billedAccountUserId: 'billed-1' }])

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'member-1',
    })

    expect(result).toBe(false)
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })

  it('skips when the connector is the billed account user', async () => {
    queueTableRows(workspace, [{ organizationId: 'org-1', billedAccountUserId: 'owner-1' }])

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'owner-1',
    })

    expect(result).toBe(false)
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })

  it('adds the billed account user as a credential member for org workspaces', async () => {
    queueTableRows(workspace, [{ organizationId: 'org-1', billedAccountUserId: 'billed-1' }])

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'member-1',
    })

    expect(result).toBe(true)
    expect(dbChainMockFns.insert).toHaveBeenCalled()
    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        userId: 'billed-1',
        role: 'member',
        status: 'active',
        invitedBy: 'member-1',
      })
    )
    expect(dbChainMockFns.onConflictDoUpdate).toHaveBeenCalled()
  })
})

describe('getCredentialActorContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('treats an explicit credential admin membership as admin', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    queueTableRows(credentialMember, [{ role: 'admin' }])
    mockCheckWorkspaceAccess.mockResolvedValue({
      hasAccess: true,
      canWrite: true,
      canAdmin: false,
    })

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

    const ctx = await getCredentialActorContext('c1', 'reader-user')

    expect(ctx.isAdmin).toBe(false)
  })

  it('returns empty context when the credential does not exist', async () => {
    const ctx = await getCredentialActorContext('missing', 'user1')

    expect(ctx.credential).toBeNull()
    expect(ctx.isAdmin).toBe(false)
    expect(mockCheckWorkspaceAccess).not.toHaveBeenCalled()
  })

  it('exposes workspace access flags from checkWorkspaceAccess', async () => {
    queueTableRows(credential, [{ id: 'c1', workspaceId: 'ws', type: 'oauth' }])
    mockCheckWorkspaceAccess.mockResolvedValue(noWorkspaceAccess)

    const ctx = await getCredentialActorContext('c1', 'outsider')

    expect(ctx.hasWorkspaceAccess).toBe(false)
    expect(ctx.canWriteWorkspace).toBe(false)
    expect(ctx.isAdmin).toBe(false)
  })
})
