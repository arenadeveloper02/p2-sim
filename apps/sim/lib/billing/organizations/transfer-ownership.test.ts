/**
 * @vitest-environment node
 */
import { member, organization, workspace } from '@sim/db/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}))

vi.mock('@sim/db', () => ({
  db: {
    transaction: transactionMock,
  },
}))

vi.mock('@sim/utils/id', () => ({
  generateId: vi.fn(() => 'generated-id'),
  generateShortId: vi.fn(() => 'short-id'),
}))

vi.mock('@/lib/billing/core/usage', () => ({
  syncUsageLimitsFromSubscription: vi.fn(),
}))

vi.mock('@/lib/billing/validation/seat-management', () => ({
  validateSeatAvailability: vi.fn(),
}))

vi.mock('@/lib/core/outbox/service', () => ({
  enqueueOutboxEvent: vi.fn(),
}))

vi.mock('@/lib/credentials/access', () => ({
  revokeWorkspaceCredentialMembershipsTx: vi.fn(),
}))

vi.mock('@/lib/workspaces/utils', () => ({
  reassignWorkflowOwnershipForWorkspaceMemberRemovalTx: vi.fn(),
  WorkspaceBillingAccountRemovalError: class WorkspaceBillingAccountRemovalError extends Error {},
  WORKSPACE_BILLING_ACCOUNT_REMOVAL_ERROR: 'workspace-billing-account-removal',
}))

import { transferOrganizationOwnership } from '@/lib/billing/organizations/membership'

type SelectResult = unknown

function createSelectChain(result: SelectResult) {
  const limit = vi.fn().mockResolvedValue(result)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })

  return { from, where, limit }
}

function createUpdateChain(returningResult: SelectResult = []) {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })

  return { set, where, returning }
}

function createInsertChain() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate, onConflictDoNothing })

  return { values, onConflictDoUpdate, onConflictDoNothing }
}

describe('transferOrganizationOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates organization metadata originalUserId and all org workspace billing accounts', async () => {
    const currentOwnerMemberSelect = createSelectChain([{ id: 'member-old', role: 'owner' }])
    const newOwnerMemberSelect = createSelectChain([{ id: 'member-new', role: 'admin' }])
    const orgMetadataSelect = createSelectChain([
      {
        metadata: {
          createdForTeamPlan: true,
          originalUserId: 'owner-old',
        },
      },
    ])
    const oldStatsSelect = createSelectChain([])
    const orgSubSelect = createSelectChain([])

    const memberUpdate = createUpdateChain()
    const organizationUpdate = createUpdateChain()
    const workspaceBilledUpdate = createUpdateChain([{ id: 'workspace-1' }, { id: 'workspace-2' }])
    const workspaceOwnerUpdate = createUpdateChain([{ id: 'workspace-1' }])
    const permissionsInsert = createInsertChain()

    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(currentOwnerMemberSelect)
        .mockReturnValueOnce(newOwnerMemberSelect)
        .mockReturnValueOnce(orgMetadataSelect)
        .mockReturnValueOnce(oldStatsSelect)
        .mockReturnValueOnce(orgSubSelect),
      update: vi
        .fn()
        .mockReturnValueOnce(memberUpdate)
        .mockReturnValueOnce(memberUpdate)
        .mockReturnValueOnce(organizationUpdate)
        .mockReturnValueOnce(workspaceBilledUpdate)
        .mockReturnValueOnce(workspaceOwnerUpdate),
      insert: vi.fn().mockReturnValue(permissionsInsert),
      execute: vi.fn(),
    }

    transactionMock.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx))

    const result = await transferOrganizationOwnership({
      organizationId: 'org-1',
      currentOwnerUserId: 'owner-old',
      newOwnerUserId: 'owner-new',
    })

    expect(result.success).toBe(true)
    expect(result.billedAccountReassigned).toBe(2)
    expect(result.workspacesReassigned).toBe(1)

    expect(tx.update).toHaveBeenCalledWith(member)
    expect(tx.update).toHaveBeenCalledWith(organization)
    expect(tx.update).toHaveBeenCalledWith(workspace)

    expect(organizationUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          createdForTeamPlan: true,
          originalUserId: 'owner-new',
        },
      })
    )

    expect(workspaceBilledUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        billedAccountUserId: 'owner-new',
      })
    )
  })

  it('reassigns billed accounts even when they no longer match the departing owner', async () => {
    const currentOwnerMemberSelect = createSelectChain([{ id: 'member-old', role: 'owner' }])
    const newOwnerMemberSelect = createSelectChain([{ id: 'member-new', role: 'member' }])
    const orgMetadataSelect = createSelectChain([{ metadata: { source: 'manual' } }])
    const oldStatsSelect = createSelectChain([])
    const orgSubSelect = createSelectChain([])

    const memberUpdate = createUpdateChain()
    const workspaceBilledUpdate = createUpdateChain([{ id: 'workspace-stale-billing' }])
    const workspaceOwnerUpdate = createUpdateChain([])
    const permissionsInsert = createInsertChain()

    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(currentOwnerMemberSelect)
        .mockReturnValueOnce(newOwnerMemberSelect)
        .mockReturnValueOnce(orgMetadataSelect)
        .mockReturnValueOnce(oldStatsSelect)
        .mockReturnValueOnce(orgSubSelect),
      update: vi
        .fn()
        .mockReturnValueOnce(memberUpdate)
        .mockReturnValueOnce(memberUpdate)
        .mockReturnValueOnce(workspaceBilledUpdate)
        .mockReturnValueOnce(workspaceOwnerUpdate),
      insert: vi.fn().mockReturnValue(permissionsInsert),
      execute: vi.fn(),
    }

    transactionMock.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx))

    const result = await transferOrganizationOwnership({
      organizationId: 'org-1',
      currentOwnerUserId: 'owner-old',
      newOwnerUserId: 'owner-new',
    })

    expect(result.success).toBe(true)
    expect(result.billedAccountReassigned).toBe(1)
    expect(tx.update).not.toHaveBeenCalledWith(organization)
    expect(workspaceBilledUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        billedAccountUserId: 'owner-new',
      })
    )
  })
})
