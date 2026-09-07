/**
 * @vitest-environment node
 */
import { member, workspace } from '@sim/db/schema'
import {
  dbChainMock,
  queueTableRows,
  resetDbChainMock,
  resetEnvFlagsMock,
  setEnvFlags,
} from '@sim/testing'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/lib/db/types'

const {
  mockAcquireOrganizationUserMutationLocks,
  mockGetUserOrganization,
  mockGetOrganizationSubscription,
  mockGetHighestPrioritySubscription,
  mockGetUserPermissionConfigForOrganization,
  mockGetUserPermissionConfig,
} = vi.hoisted(() => ({
  mockAcquireOrganizationUserMutationLocks: vi.fn(),
  mockGetUserOrganization: vi.fn(),
  mockGetOrganizationSubscription: vi.fn(),
  mockGetHighestPrioritySubscription: vi.fn(),
  mockGetUserPermissionConfigForOrganization: vi.fn(),
  mockGetUserPermissionConfig: vi.fn(),
}))

vi.mock('@/lib/permission-groups/resolve.server', () => ({
  getUserPermissionConfigForOrganization: mockGetUserPermissionConfigForOrganization,
  getUserPermissionConfig: mockGetUserPermissionConfig,
}))

vi.mock('@/lib/billing/organizations/membership', () => ({
  acquireOrganizationUserMutationLocks: mockAcquireOrganizationUserMutationLocks,
  getUserOrganization: mockGetUserOrganization,
}))

vi.mock('@/lib/billing/core/billing', () => ({
  getOrganizationSubscription: mockGetOrganizationSubscription,
}))

vi.mock('@/lib/billing/core/plan', () => ({
  getHighestPrioritySubscription: mockGetHighestPrioritySubscription,
}))

import {
  getOrganizationOwnerId,
  getWorkspaceCreationPolicy,
  getWorkspaceInvitePolicy,
  lockWorkspaceCreationContext,
  WORKSPACE_MODE,
  WorkspaceCreationCapabilityWithheldError,
  WorkspaceCreationContextChangedError,
} from '@/lib/workspaces/policy'

afterAll(resetDbChainMock)

afterAll(resetEnvFlagsMock)

describe('getOrganizationOwnerId', () => {
  it('uses the supplied transaction executor for the owner lookup', async () => {
    const limit = vi.fn().mockResolvedValue([{ userId: 'owner-from-transaction' }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const executor = { select } as unknown as DbOrTx

    await expect(getOrganizationOwnerId('org-1', executor)).resolves.toBe('owner-from-transaction')
    expect(select).toHaveBeenCalledWith({ userId: member.userId })
    expect(from).toHaveBeenCalledWith(member)
    expect(where).toHaveBeenCalledOnce()
    expect(limit).toHaveBeenCalledWith(1)
  })
})

describe('lockWorkspaceCreationContext', () => {
  it('locks the destination organization and user before rejecting a stale org-mode policy', async () => {
    vi.clearAllMocks()
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue(null)
    const tx = {} as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'user-1',
        organizationId: 'org-1',
        observedOrganizationId: 'org-1',
      })
    ).rejects.toBeInstanceOf(WorkspaceCreationContextChangedError)

    expect(mockAcquireOrganizationUserMutationLocks).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      organizationIds: ['org-1'],
    })
    expect(mockGetUserOrganization).toHaveBeenCalledWith('user-1', tx)
    expect(mockAcquireOrganizationUserMutationLocks.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetUserOrganization.mock.invocationCallOrder[0]
    )
  })

  it('uses the live owner after the org lock and row-locks the current entitlement', async () => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isBillingEnabled: true })
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'admin',
    })
    mockGetOrganizationSubscription.mockResolvedValue({
      id: 'sub-1',
      referenceId: 'org-1',
      plan: 'team_6000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'new-owner' }])
    const tx = dbChainMock.db as unknown as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'creator-1',
        organizationId: 'org-1',
        observedOrganizationId: 'org-1',
      })
    ).resolves.toEqual({ billedAccountUserId: 'new-owner' })

    expect(mockGetOrganizationSubscription).toHaveBeenCalledWith('org-1', {
      executor: tx,
      onError: 'throw',
      forUpdate: true,
    })
    expect(mockAcquireOrganizationUserMutationLocks.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetOrganizationSubscription.mock.invocationCallOrder[0]
    )
  })

  /**
   * The preflight in `getWorkspaceCreationPolicy` and the insert are separate
   * requests. A group that withheld creation in between has to be caught under
   * the lock, or the in-flight create lands a workspace that carries no
   * `permissionGroupWorkspace` row to bring it back under the regime.
   */
  it('rejects when the group withheld workspace creation after the preflight', async () => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isBillingEnabled: false })
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue({ organizationId: 'org-1', role: 'admin' })
    mockGetUserPermissionConfigForOrganization.mockResolvedValue({
      disableWorkspaceCreation: true,
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    const tx = dbChainMock.db as unknown as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'creator-1',
        organizationId: 'org-1',
        observedOrganizationId: 'org-1',
      })
    ).rejects.toBeInstanceOf(WorkspaceCreationCapabilityWithheldError)
    expect(mockGetUserPermissionConfigForOrganization).toHaveBeenCalledWith('org-1')
  })

  /**
   * A personal workspace is precisely the escape from a scoped group, so the
   * re-check reads the caller's membership organization even when the workspace
   * being inserted carries none — the same organization the preflight used.
   */
  it('rejects a personal workspace when the membership organization withheld creation', async () => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue({ organizationId: 'org-1', role: 'member' })
    mockGetUserPermissionConfigForOrganization.mockResolvedValue({
      disableWorkspaceCreation: true,
    })
    const tx = dbChainMock.db as unknown as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'creator-1',
        organizationId: null,
        observedOrganizationId: 'org-1',
      })
    ).rejects.toBeInstanceOf(WorkspaceCreationCapabilityWithheldError)
  })

  it('leaves an unaffiliated creator alone, with no group to read', async () => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue(null)
    const tx = dbChainMock.db as unknown as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'creator-1',
        organizationId: null,
        observedOrganizationId: null,
      })
    ).resolves.toEqual({ billedAccountUserId: 'creator-1' })
    expect(mockGetUserPermissionConfigForOrganization).not.toHaveBeenCalled()
  })

  it('rejects when the paid org entitlement disappeared before insertion', async () => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isBillingEnabled: true })
    mockAcquireOrganizationUserMutationLocks.mockResolvedValue(undefined)
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    })
    mockGetOrganizationSubscription.mockResolvedValue(null)
    const tx = dbChainMock.db as unknown as DbOrTx

    await expect(
      lockWorkspaceCreationContext(tx, {
        userId: 'creator-1',
        organizationId: 'org-1',
        observedOrganizationId: 'org-1',
      })
    ).rejects.toBeInstanceOf(WorkspaceCreationContextChangedError)
  })
})

describe('getWorkspaceCreationPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isBillingEnabled: true })
    mockGetUserOrganization.mockResolvedValue(null)
    mockGetOrganizationSubscription.mockResolvedValue(null)
    mockGetHighestPrioritySubscription.mockResolvedValue(null)
    mockGetUserPermissionConfigForOrganization.mockResolvedValue(null)
  })

  it('blocks a member whose permission group disables workspace creation', async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    mockGetUserPermissionConfigForOrganization.mockResolvedValue({
      disableWorkspaceCreation: true,
    })
    queueTableRows(member, [{ role: 'member' }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(false)
    expect(result.status).toBe(403)
    expect(result.blockedReasonCode).toBe('permission-group-denied')
    expect(mockGetUserPermissionConfigForOrganization).toHaveBeenCalledWith('org-1')
  })

  it('governs the personal workspace a scoped-group member would otherwise escape into', async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    mockGetUserPermissionConfigForOrganization.mockResolvedValue({
      disableWorkspaceCreation: true,
    })
    queueTableRows(member, [{ role: 'member' }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1', pinOrganization: true })

    expect(result.canCreate).toBe(false)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.PERSONAL)
    expect(result.blockedReasonCode).toBe('permission-group-denied')
  })

  /**
   * Creating a workspace names no workspace, so there is no workspace whose
   * group could govern it — and a member may be governed by different groups in
   * different workspaces, so there is no single scoped group to pick. The
   * decision is read from the organization's default group and from nothing
   * else, which is what `disableWorkspaceCreation`'s admin hint has to say.
   */
  it("reads workspace creation from the organization's default group and no workspace group", async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    mockGetUserPermissionConfigForOrganization.mockResolvedValue({
      disableWorkspaceCreation: true,
    })
    queueTableRows(member, [{ role: 'member' }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.blockedReasonCode).toBe('permission-group-denied')
    expect(mockGetUserPermissionConfigForOrganization).toHaveBeenCalledWith('org-1')
    expect(mockGetUserPermissionConfig).not.toHaveBeenCalled()
  })

  it('blocks users who do not belong to an organization', async () => {
    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(false)
    expect(result.organizationId).toBeNull()
    expect(result.reason).toContain('organization')
  })

  it('creates a personal org workspace for new users with no existing workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    // owner lookup → no personal workspace → org workspace count
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('org-1')
    expect(result.isPersonal).toBe(true)
    expect(result.billedAccountUserId).toBe('owner-1')
    expect(result.currentWorkspaceCount).toBe(0)
  })

  it('blocks free org admins once the org already has one workspace', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 1 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(false)
    expect(result.isPersonal).toBe(false)
    expect(result.maxWorkspaces).toBe(1)
    expect(result.currentWorkspaceCount).toBe(1)
  })

  it('allows a member of a free/lapsed org to create their first personal workspace', async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValue({
      id: 'sub-1',
      plan: 'team_6000',
      status: 'canceled',
      referenceId: 'org-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.isPersonal).toBe(true)
    expect(result.organizationId).toBe('org-1')
  })

  it('lets an owner of a lapsed organization create under their personal plan cap', async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValue({
      id: 'sub-1',
      plan: 'team_6000',
      status: 'canceled',
      referenceId: 'org-1',
    })
    mockGetHighestPrioritySubscription.mockResolvedValue({
      id: 'sub-2',
      plan: 'pro_6000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 2 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.maxWorkspaces).toBe(3)
    expect(result.observedOrganizationId).toBe('org-1')
  })

  it('allows pro org admins to create up to three workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'pro_6000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 2 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.isPersonal).toBe(false)
    expect(result.maxWorkspaces).toBe(3)
    expect(result.currentWorkspaceCount).toBe(2)
  })

  it('blocks non-admin org members from creating additional workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 1 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(false)
    expect(result.isPersonal).toBe(false)
    expect(result.reason).toContain('owners and admins')
  })

  it('allows max org admins to create up to ten workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'pro_25000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 5 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.maxWorkspaces).toBe(10)
    expect(result.currentWorkspaceCount).toBe(5)
  })

  // `isMaxTier` (not the old `isMax`) so team_25000 / enterprise get the Max cap.
  it('gives the team plan at the Max credit tier the same ten workspaces as Max', async () => {
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValue({
      id: 'sub-1',
      plan: 'team_25000',
      status: 'past_due',
    })
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'team_25000',
      status: 'past_due',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 5 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.maxWorkspaces).toBe(10)
  })

  it('gives an enterprise payer ten workspaces when the org subscription is not usable', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'owner',
      memberId: 'member-1',
    })
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'enterprise',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 5 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.maxWorkspaces).toBe(10)
  })

  it('leaves enterprise organization workspaces uncapped for org admins', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'owner',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'enterprise',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.maxWorkspaces).toBeNull()
  })

  it('blocks max org admins once they already have ten workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'pro_25000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 10 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(false)
    expect(result.maxWorkspaces).toBe(10)
    expect(result.currentWorkspaceCount).toBe(10)
  })

  it('allows unlimited workspaces when billing is disabled', async () => {
    setEnvFlags({ isBillingEnabled: false })
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [{ id: 'ws-personal' }])
    queueTableRows(workspace, [{ value: 9 }])

    const result = await getWorkspaceCreationPolicy({ userId: 'user-1' })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.maxWorkspaces).toBeNull()
    expect(result.currentWorkspaceCount).toBe(9)
    expect(mockGetHighestPrioritySubscription).not.toHaveBeenCalled()
  })

  it('without pinning, a null active org falls back to the caller membership org', async () => {
    setEnvFlags({ isBillingEnabled: false })
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'user-org',
      role: 'admin',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: null,
    })

    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('user-org')
  })

  it('pins to null still requires an organization in the org-first regime', async () => {
    setEnvFlags({ isBillingEnabled: false })
    mockGetUserOrganization.mockResolvedValue({
      organizationId: 'user-org',
      role: 'admin',
      memberId: 'member-1',
    })

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: null,
      pinOrganization: true,
    })

    expect(result.canCreate).toBe(false)
    expect(result.organizationId).toBeNull()
    expect(result.reason).toContain('organization')
  })

  it('allows org admins on a team plan to create organization workspaces', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'team_6000',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('org-1')
    expect(result.billedAccountUserId).toBe('owner-1')
    expect(result.isPersonal).toBe(true)
  })

  it('allows org admins to create organization workspaces when billing is disabled', async () => {
    setEnvFlags({ isBillingEnabled: false })
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'admin',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    })

    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('org-1')
    expect(result.billedAccountUserId).toBe('owner-1')
    expect(mockGetOrganizationSubscription).not.toHaveBeenCalled()
  })

  it('allows plain org members to create organization workspaces when billing is disabled', async () => {
    setEnvFlags({ isBillingEnabled: false })
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    })

    /**
     * Auto-joined users — instance-organization mode, or SSO organization
     * provisioning — land here as plain members. Refusing them would leave them
     * with no workspace at all, not merely a personal one.
     */
    expect(result.canCreate).toBe(true)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('org-1')
    expect(result.billedAccountUserId).toBe('owner-1')
  })

  it('still blocks non-admin org members when billing is enabled', async () => {
    mockGetUserOrganization.mockResolvedValueOnce({
      organizationId: 'org-1',
      role: 'member',
      memberId: 'member-1',
    })
    mockGetOrganizationSubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'enterprise',
      status: 'active',
    })
    queueTableRows(member, [{ userId: 'owner-1' }])
    queueTableRows(workspace, [])
    queueTableRows(workspace, [{ value: 0 }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    })

    expect(result.canCreate).toBe(false)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.reason).toContain('owners and admins')
  })

  it('blocks users without org membership from creating workspaces in the active org context', async () => {
    queueTableRows(member, [])
    queueTableRows(member, [{ userId: 'owner-1' }])

    const result = await getWorkspaceCreationPolicy({
      userId: 'external-user-1',
      activeOrganizationId: 'org-1',
    })

    expect(result.canCreate).toBe(false)
    expect(result.workspaceMode).toBe(WORKSPACE_MODE.ORGANIZATION)
    expect(result.organizationId).toBe('org-1')
    expect(result.billedAccountUserId).toBe('owner-1')
    expect(result.reason).toContain('owners and admins')
    expect(mockGetOrganizationSubscription).not.toHaveBeenCalled()
    expect(mockGetHighestPrioritySubscription).not.toHaveBeenCalled()
  })
})

describe('getWorkspaceInvitePolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isBillingEnabled: true })
    mockGetOrganizationSubscription.mockResolvedValue(null)
    mockGetHighestPrioritySubscription.mockResolvedValue(null)
  })

  const baseState = {
    workspaceMode: WORKSPACE_MODE.ORGANIZATION,
    organizationId: 'org-1',
    billedAccountUserId: 'owner-1',
    ownerId: 'owner-1',
  } as const

  it('allows invites unconditionally when billing is disabled', async () => {
    setEnvFlags({ isBillingEnabled: false })

    const result = await getWorkspaceInvitePolicy(baseState)

    expect(result.allowed).toBe(true)
    expect(result.upgradeRequired).toBe(false)
    expect(mockGetOrganizationSubscription).not.toHaveBeenCalled()
  })

  it('blocks free org workspaces with an upgrade prompt', async () => {
    const result = await getWorkspaceInvitePolicy(baseState)

    expect(result.allowed).toBe(false)
    expect(result.upgradeRequired).toBe(true)
  })

  it('allows team org workspaces without an invite-time seat gate', async () => {
    mockGetOrganizationSubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'team_6000',
      status: 'active',
    })

    const result = await getWorkspaceInvitePolicy(baseState)

    expect(result.allowed).toBe(true)
    expect(result.requiresSeat).toBe(false)
    expect(result.organizationId).toBe('org-1')
  })

  it('keeps the fixed-seat gate for enterprise org workspaces', async () => {
    mockGetOrganizationSubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'enterprise',
      status: 'active',
    })

    const result = await getWorkspaceInvitePolicy(baseState)

    expect(result.allowed).toBe(true)
    expect(result.requiresSeat).toBe(true)
  })

  it('blocks org workspaces whose organization has no usable subscription', async () => {
    mockGetOrganizationSubscription.mockResolvedValueOnce(null)

    const result = await getWorkspaceInvitePolicy(baseState)

    expect(result.allowed).toBe(false)
    expect(result.upgradeRequired).toBe(true)
  })

  it('blocks org workspaces without an organization id', async () => {
    const result = await getWorkspaceInvitePolicy({
      ...baseState,
      organizationId: null,
    })

    expect(result.allowed).toBe(false)
    expect(result.upgradeRequired).toBe(true)
  })

  it('blocks grandfathered workspaces (org-first invite regime)', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValueOnce({
      id: 'sub-1',
      plan: 'team_6000',
      status: 'active',
    })

    const result = await getWorkspaceInvitePolicy({
      ...baseState,
      workspaceMode: WORKSPACE_MODE.GRANDFATHERED_SHARED,
    })

    expect(result.allowed).toBe(false)
    expect(result.upgradeRequired).toBe(true)
  })

  it('blocks legacy non-organization workspaces', async () => {
    mockGetHighestPrioritySubscription.mockResolvedValueOnce(null)

    const result = await getWorkspaceInvitePolicy({
      ...baseState,
      workspaceMode: WORKSPACE_MODE.GRANDFATHERED_SHARED,
      organizationId: null,
    })

    expect(result.allowed).toBe(false)
    expect(result.upgradeRequired).toBe(true)
  })
})
