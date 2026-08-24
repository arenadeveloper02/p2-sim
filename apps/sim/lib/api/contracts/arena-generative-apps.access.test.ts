/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  createDeployedAppBodySchema,
  getGenerativeAppStatusContract,
  updateDeployedAppBodySchema,
} from '@/lib/api/contracts/arena-generative-apps'

const createBody = {
  workflowId: 'wf-1',
  draftId: 'draft-1',
  identifier: 'orders-app',
  title: 'Orders',
}

describe('generative app access defaults', () => {
  /**
   * Generated apps are served to Arena users the way deployed chats are, so a
   * caller that says nothing about access must get the gated behaviour rather
   * than an app anyone can open by guessing its URL.
   */
  it('requires an Arena emailId when the deploy omits the flag', () => {
    expect(createDeployedAppBodySchema.parse(createBody).requireArenaEmailId).toBe(true)
  })

  it('still lets a caller opt out explicitly', () => {
    const parsed = createDeployedAppBodySchema.parse({
      ...createBody,
      requireArenaEmailId: false,
    })
    expect(parsed.requireArenaEmailId).toBe(false)
  })

  /**
   * PATCH is a partial update and the route resolves every field as
   * `body.x ?? stored.x`. A create default surviving `.partial()` would make an
   * unrelated edit — renaming the app — silently rewrite its access settings:
   * downgrading `email` to `public`, emptying the allowlist, and flipping the
   * Arena gate. Omitted access fields must parse to undefined.
   */
  it('leaves access settings untouched on an update that omits them', () => {
    const parsed = updateDeployedAppBodySchema.parse({ title: 'Renamed' })

    expect(parsed.requireArenaEmailId).toBe(undefined)
    expect(parsed.authType).toBe(undefined)
    expect(parsed.allowedEmails).toBe(undefined)
  })

  it('still applies access settings the update does send', () => {
    const parsed = updateDeployedAppBodySchema.parse({
      authType: 'email',
      allowedEmails: ['@example.com'],
      requireArenaEmailId: false,
    })

    expect(parsed.authType).toBe('email')
    expect(parsed.allowedEmails).toEqual(['@example.com'])
    expect(parsed.requireArenaEmailId).toBe(false)
  })

  it('returns description, department, and allowlist so Deploy can hydrate', () => {
    const parsed = getGenerativeAppStatusContract.response.schema.parse({
      isDeployed: true,
      deployment: {
        id: 'app-1',
        identifier: 'orders-app',
        title: 'Orders',
        description: 'Track orders',
        department: 'sales',
        authType: 'email',
        allowedEmails: ['ada@example.com'],
        requireArenaEmailId: true,
      },
    })

    expect(parsed.deployment).toMatchObject({
      description: 'Track orders',
      department: 'sales',
      authType: 'email',
      allowedEmails: ['ada@example.com'],
    })
  })
})
