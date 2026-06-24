/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  findCorruptedWorkflowRoomKeys,
  healCorruptedWorkflowRoomKeys,
  parseWorkflowIdFromUsersKey,
  workflowMetaKey,
  workflowUsersKey,
} from '@/rooms/workflow-room-keys'

describe('workflow-room-keys', () => {
  it('builds canonical workflow room keys', () => {
    expect(workflowUsersKey('wf-1')).toBe('workflow:wf-1:users')
    expect(workflowMetaKey('wf-1')).toBe('workflow:wf-1:meta')
  })

  it('parses workflow ids from users keys', () => {
    expect(parseWorkflowIdFromUsersKey('workflow:8c2dbc36-584c-48e7-9e79-884f9c72ea8a:users')).toBe(
      '8c2dbc36-584c-48e7-9e79-884f9c72ea8a'
    )
    expect(parseWorkflowIdFromUsersKey('workflow:wf-1:meta')).toBeNull()
  })

  it('detects corrupted string users keys', async () => {
    const redis = {
      type: async (key: string) => {
        if (key.endsWith(':users')) return 'string'
        if (key.endsWith(':meta')) return 'none'
        return 'none'
      },
      get: async () => '{"legacy":true}',
    }

    const corrupted = await findCorruptedWorkflowRoomKeys(redis, 'wf-1')
    expect(corrupted).toHaveLength(1)
    expect(corrupted[0]).toMatchObject({
      key: 'workflow:wf-1:users',
      workflowId: 'wf-1',
      actualType: 'string',
      preview: '{"legacy":true}',
    })
  })

  it('heals corrupted keys by deleting them', async () => {
    const deleted: string[] = []
    const redis = {
      type: async (key: string) => (key.endsWith(':users') ? 'string' : 'hash'),
      get: async () => 'bad-value',
      del: async (keys: string | string[]) => {
        deleted.push(...(Array.isArray(keys) ? keys : [keys]))
        return deleted.length
      },
    }

    const result = await healCorruptedWorkflowRoomKeys(redis, 'wf-1')
    expect(result.healed).toBe(true)
    expect(result.deletedKeys).toEqual(['workflow:wf-1:users'])
    expect(deleted).toEqual(['workflow:wf-1:users'])
  })

  it('no-ops when keys are healthy hashes', async () => {
    const redis = {
      type: async () => 'hash',
      del: async () => {
        throw new Error('should not delete')
      },
    }

    const result = await healCorruptedWorkflowRoomKeys(redis, 'wf-1')
    expect(result.healed).toBe(false)
    expect(result.deletedKeys).toEqual([])
  })
})
