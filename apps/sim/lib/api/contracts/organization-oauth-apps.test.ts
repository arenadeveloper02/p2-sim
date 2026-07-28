/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { upsertOrganizationOAuthAppBodySchema } from '@/lib/api/contracts/organization-oauth-apps'

describe('upsertOrganizationOAuthAppBodySchema', () => {
  it('requires allowedWorkspaceIds for zoom-admin', () => {
    const result = upsertOrganizationOAuthAppBodySchema.safeParse({
      appKey: 'zoom-admin',
      clientId: 'client',
      clientSecret: 'secret',
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty allowedWorkspaceIds for zoom-admin', () => {
    const result = upsertOrganizationOAuthAppBodySchema.safeParse({
      appKey: 'zoom-admin',
      clientId: 'client',
      clientSecret: 'secret',
      allowedWorkspaceIds: [],
    })
    expect(result.success).toBe(true)
  })

  it('accepts zoom without allowedWorkspaceIds', () => {
    const result = upsertOrganizationOAuthAppBodySchema.safeParse({
      appKey: 'zoom',
      clientId: 'client',
      clientSecret: 'secret',
    })
    expect(result.success).toBe(true)
  })

  it('accepts zoom-admin with workspace allowlist', () => {
    const result = upsertOrganizationOAuthAppBodySchema.safeParse({
      appKey: 'zoom-admin',
      clientId: 'client',
      clientSecret: 'secret',
      allowedWorkspaceIds: ['ws-1', 'ws-2'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.allowedWorkspaceIds).toEqual(['ws-1', 'ws-2'])
    }
  })
})
