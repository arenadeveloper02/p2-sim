/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { arenaGenerativeManifestSchema } from '@/lib/api/contracts/arena-generative-apps'

const homePage = {
  title: 'Home',
  path: 'home',
  spec: { root: 'page', elements: {} },
}

describe('generative app manifest wire schema', () => {
  it('accepts dummy/local actions that omit apiKey', () => {
    const parsed = arenaGenerativeManifestSchema.parse({
      entryPath: 'home',
      pages: { home: homePage },
      actions: {
        'export-results': {
          onSuccess: { setState: { exported: true } },
        },
      },
    })

    expect(parsed.actions['export-results'].apiKey).toBeUndefined()
  })

  it('treats empty and null apiKey as omitted', () => {
    const parsed = arenaGenerativeManifestSchema.parse({
      entryPath: 'home',
      pages: { home: homePage },
      actions: {
        seed: { apiKey: '' },
        local: { apiKey: null },
      },
    })

    expect(parsed.actions.seed.apiKey).toBeUndefined()
    expect(parsed.actions.local.apiKey).toBeUndefined()
  })

  it('still accepts bound actions that declare apiKey', () => {
    const parsed = arenaGenerativeManifestSchema.parse({
      entryPath: 'home',
      pages: { home: homePage },
      actions: {
        submit_lead: { apiKey: 'qualify_lead' },
      },
    })

    expect(parsed.actions.submit_lead.apiKey).toBe('qualify_lead')
  })
})
