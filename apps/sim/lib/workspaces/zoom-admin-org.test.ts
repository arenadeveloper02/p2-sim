/**
 * @vitest-environment node
 */
import { createEnvMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockZoomAdminOrgIds } = vi.hoisted(() => ({
  mockZoomAdminOrgIds: { value: undefined as string | undefined },
}))

vi.mock('@/lib/core/config/env', () => {
  const base = createEnvMock()
  return {
    ...base,
    env: new Proxy(base.env, {
      get(target, prop, receiver) {
        if (prop === 'ZOOM_ADMIN_ORG_IDS') return mockZoomAdminOrgIds.value
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

import {
  isZoomAdminEnabledForOrganization,
  listCustomOAuthAppKeysForOrganization,
} from '@/lib/workspaces/zoom-admin-org'

describe('zoom-admin-org', () => {
  beforeEach(() => {
    mockZoomAdminOrgIds.value = undefined
  })

  it('denies all orgs when env is unset', () => {
    expect(isZoomAdminEnabledForOrganization('org-1')).toBe(false)
    expect(listCustomOAuthAppKeysForOrganization('org-1')).not.toContain('zoom-admin')
  })

  it('allows only listed orgs', () => {
    mockZoomAdminOrgIds.value = '["org-a"]'
    expect(isZoomAdminEnabledForOrganization('org-a')).toBe(true)
    expect(isZoomAdminEnabledForOrganization('org-b')).toBe(false)
    expect(listCustomOAuthAppKeysForOrganization('org-a')).toContain('zoom-admin')
    expect(listCustomOAuthAppKeysForOrganization('org-b')).not.toContain('zoom-admin')
  })
})
