/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isLocalCopilotVertexConfigured,
  listLocalCopilotVertexSlots,
  resetLocalCopilotVertexSlotRotation,
  resolveLocalCopilotVertexSlot,
} from '@/local-copilot/lib/providers/vertex-auth'

const SA = (email: string, projectId: string) =>
  JSON.stringify({
    type: 'service_account',
    client_email: email,
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
    project_id: projectId,
  })

const ENV_KEYS = [
  'VERTEX_PROJECT',
  'VERTEX_PROJECT_1',
  'VERTEX_PROJECT_2',
  'VERTEX_LOCATION',
  'VERTEX_LOCATION_1',
  'VERTEX_LOCATION_2',
  'VERTEX_SERVICE_ACCOUNT_JSON',
  'VERTEX_SERVICE_ACCOUNT_JSON_1',
  'VERTEX_SERVICE_ACCOUNT_JSON_2',
  'GCS_CREDENTIALS_JSON',
] as const

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

function clearVertexEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

describe('Vertex Local Copilot slot rotation', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
    }
    clearVertexEnv()
    resetLocalCopilotVertexSlotRotation()
  })

  afterEach(() => {
    clearVertexEnv()
    for (const key of ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetLocalCopilotVertexSlotRotation()
  })

  it('round-robins three slots with distinct project, location, and SA', () => {
    process.env.VERTEX_PROJECT = 'proj-a'
    process.env.VERTEX_LOCATION = 'global'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON = SA('a@x.iam.gserviceaccount.com', 'proj-a')

    process.env.VERTEX_PROJECT_1 = 'proj-b'
    process.env.VERTEX_LOCATION_1 = 'us'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON_1 = SA('b@x.iam.gserviceaccount.com', 'proj-b')

    process.env.VERTEX_PROJECT_2 = 'proj-c'
    process.env.VERTEX_LOCATION_2 = 'eu'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON_2 = SA('c@x.iam.gserviceaccount.com', 'proj-c')

    const slots = listLocalCopilotVertexSlots()
    expect(slots).toHaveLength(3)
    expect(slots[0]).toMatchObject({
      slot: 0,
      project: 'proj-a',
      location: 'global',
      credentials: { client_email: 'a@x.iam.gserviceaccount.com' },
    })
    expect(slots[1]).toMatchObject({
      slot: 1,
      project: 'proj-b',
      location: 'us',
      credentials: { client_email: 'b@x.iam.gserviceaccount.com' },
    })
    expect(slots[2]).toMatchObject({
      slot: 2,
      project: 'proj-c',
      location: 'eu',
      credentials: { client_email: 'c@x.iam.gserviceaccount.com' },
    })

    expect(resolveLocalCopilotVertexSlot().project).toBe('proj-a')
    expect(resolveLocalCopilotVertexSlot().project).toBe('proj-b')
    expect(resolveLocalCopilotVertexSlot().project).toBe('proj-c')
    expect(resolveLocalCopilotVertexSlot().project).toBe('proj-a')
  })

  it('falls back to primary location and SA when slot-specific ones are unset', () => {
    process.env.VERTEX_PROJECT = 'proj-a'
    process.env.VERTEX_LOCATION = 'us'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON = SA('shared@x.iam.gserviceaccount.com', 'proj-a')
    process.env.VERTEX_PROJECT_1 = 'proj-b'

    const slots = listLocalCopilotVertexSlots()
    expect(slots).toHaveLength(2)
    expect(slots[1]).toMatchObject({
      slot: 1,
      project: 'proj-b',
      location: 'us',
      credentials: { client_email: 'shared@x.iam.gserviceaccount.com' },
    })
  })

  it('dedupes identical project + SA slots so the 429 ladder stays short', () => {
    process.env.VERTEX_PROJECT = 'same-proj'
    process.env.VERTEX_LOCATION = 'global'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON = SA('shared@x.iam.gserviceaccount.com', 'same-proj')
    process.env.VERTEX_PROJECT_1 = 'same-proj'
    process.env.VERTEX_LOCATION_1 = 'global'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON_1 = SA('shared@x.iam.gserviceaccount.com', 'same-proj')
    process.env.VERTEX_PROJECT_2 = 'same-proj'
    process.env.VERTEX_LOCATION_2 = 'global'
    process.env.VERTEX_SERVICE_ACCOUNT_JSON_2 = SA('shared@x.iam.gserviceaccount.com', 'same-proj')

    expect(listLocalCopilotVertexSlots()).toHaveLength(1)
  })

  it('reports not configured when nothing is set', () => {
    expect(isLocalCopilotVertexConfigured()).toBe(false)
  })
})
