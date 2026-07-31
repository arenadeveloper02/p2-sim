/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetScheduleExecutionActorUserId, mockGetWorkspaceOwnerId, mockDbSelect } = vi.hoisted(
  () => ({
    mockGetScheduleExecutionActorUserId: vi.fn(),
    mockGetWorkspaceOwnerId: vi.fn(),
    mockDbSelect: vi.fn(),
  })
)

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('@/lib/workspaces/utils', () => ({
  getScheduleExecutionActorUserId: mockGetScheduleExecutionActorUserId,
  getWorkspaceOwnerId: mockGetWorkspaceOwnerId,
}))

import { resolveExecutionActor } from '@/lib/execution/actor-resolution'

describe('resolveExecutionActor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetScheduleExecutionActorUserId.mockResolvedValue('schedule-owner-1')
    mockGetWorkspaceOwnerId.mockResolvedValue('workspace-owner-1')
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ createdBy: 'deployer-1' }]),
          }),
        }),
      }),
    })
  })

  it('marks workspace API keys with api_key actor type and key id', async () => {
    const actor = await resolveExecutionActor({
      triggerType: 'api',
      workspaceId: 'workspace-1',
      authenticatedUserId: 'key-owner-1',
      apiKeyId: 'key-1',
      apiKeyType: 'workspace',
    })

    expect(actor).toEqual({
      actorUserId: 'key-owner-1',
      actorType: 'api_key',
      apiKeyId: 'key-1',
    })
  })

  it('resolves schedule actors via schedule helper', async () => {
    const actor = await resolveExecutionActor({
      triggerType: 'schedule',
      workspaceId: 'workspace-1',
      workflowUserId: 'creator-1',
      authenticatedUserId: 'unknown',
    })

    expect(actor).toEqual({
      actorUserId: 'schedule-owner-1',
      actorType: 'schedule',
    })
    expect(mockGetScheduleExecutionActorUserId).toHaveBeenCalledWith('workspace-1', 'creator-1')
  })

  it('resolves webhook actors from deployment deployer when webhook id is known', async () => {
    const actor = await resolveExecutionActor({
      triggerType: 'webhook',
      workspaceId: 'workspace-1',
      workflowUserId: 'creator-1',
      authenticatedUserId: 'creator-1',
      webhookId: 'webhook-1',
    })

    expect(actor).toEqual({
      actorUserId: 'deployer-1',
      actorType: 'webhook',
    })
  })
})
