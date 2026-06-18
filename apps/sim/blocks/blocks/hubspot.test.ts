/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateSubBlockCondition } from '@/lib/workflows/subblocks/visibility'
import { WORKSPACE_ID_CONDITION_KEY } from '@/lib/workspaces/is-admin-workspace'

const { mockIsAdminWorkspace } = vi.hoisted(() => ({
  mockIsAdminWorkspace: vi.fn(() => false),
}))

vi.mock('@/lib/workspaces/is-admin-workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspaces/is-admin-workspace')>()
  return {
    ...actual,
    isAdminWorkspace: mockIsAdminWorkspace,
  }
})

import { HubSpotBlock } from '@/blocks/blocks/hubspot'

describe('HubSpotBlock admin workspace auth fields', () => {
  const accountsSubBlock = HubSpotBlock.subBlocks.find((subBlock) => subBlock.id === 'accounts')
  const credentialSubBlock = HubSpotBlock.subBlocks.find((subBlock) => subBlock.id === 'credential')

  if (!accountsSubBlock?.condition || !credentialSubBlock?.condition) {
    throw new Error('HubspotBlock auth subblocks are missing conditions')
  }

  const baseValues = { operation: 'get_contacts' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAdminWorkspace.mockReturnValue(false)
  })

  it('shows Accounts and hides HubSpot Account OAuth in admin workspaces', () => {
    mockIsAdminWorkspace.mockReturnValue(true)
    const workspaceId = 'ws-admin'

    expect(evaluateSubBlockCondition(accountsSubBlock.condition, baseValues, workspaceId)).toBe(
      true
    )
    expect(evaluateSubBlockCondition(credentialSubBlock.condition, baseValues, workspaceId)).toBe(
      false
    )
    expect(mockIsAdminWorkspace).toHaveBeenCalledWith(workspaceId)
  })

  it('hides Accounts and shows HubSpot Account OAuth outside admin workspaces', () => {
    const workspaceId = 'ws-normal'

    expect(evaluateSubBlockCondition(accountsSubBlock.condition, baseValues, workspaceId)).toBe(
      false
    )
    expect(evaluateSubBlockCondition(credentialSubBlock.condition, baseValues, workspaceId)).toBe(
      true
    )
    expect(mockIsAdminWorkspace).toHaveBeenCalledWith(workspaceId)
  })

  it('resolves admin workspace from injected condition values during serialization', () => {
    mockIsAdminWorkspace.mockReturnValue(true)
    const values = {
      ...baseValues,
      [WORKSPACE_ID_CONDITION_KEY]: 'ws-admin-serializer',
    }

    expect(evaluateSubBlockCondition(accountsSubBlock.condition, values)).toBe(true)
    expect(evaluateSubBlockCondition(credentialSubBlock.condition, values)).toBe(false)
    expect(mockIsAdminWorkspace).toHaveBeenCalledWith('ws-admin-serializer')
  })
})
