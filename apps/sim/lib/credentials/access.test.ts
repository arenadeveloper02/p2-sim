/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLimit, mockOnConflictDoUpdate, mockInsertValues, mockInsert } = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const mockInsertValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
  return { mockLimit, mockOnConflictDoUpdate, mockInsertValues, mockInsert }
})

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockLimit,
        })),
      })),
    })),
    insert: mockInsert,
  },
}))

import { ensureBilledAccountCredentialMembership } from '@/lib/credentials/access'

describe('ensureBilledAccountCredentialMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConflictDoUpdate.mockResolvedValue(undefined)
    mockInsertValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
    mockInsert.mockReturnValue({ values: mockInsertValues })
  })

  it('skips non-org workspaces', async () => {
    mockLimit.mockResolvedValueOnce([{ organizationId: null, billedAccountUserId: 'billed-1' }])

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'member-1',
    })

    expect(result).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('skips when the connector is the billed account user', async () => {
    mockLimit.mockResolvedValueOnce([{ organizationId: 'org-1', billedAccountUserId: 'owner-1' }])

    const result = await ensureBilledAccountCredentialMembership({
      credentialId: 'cred-1',
      workspaceId: 'ws-1',
      invitedBy: 'owner-1',
    })

    expect(result).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('adds the billed account user as a credential member for org workspaces', async () => {
    mockLimit.mockResolvedValueOnce([{ organizationId: 'org-1', billedAccountUserId: 'billed-1' }])

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
