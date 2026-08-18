/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateAnthropicMessage } = vi.hoisted(() => ({
  mockCreateAnthropicMessage: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {},
}))

vi.mock('@/lib/anthropic/create-message', () => ({
  createAnthropicMessage: mockCreateAnthropicMessage,
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: () => 'test-key',
}))

import {
  editScopePageIndex,
  MAX_SCOPED_EDIT_PAGES,
  parseArenaGenerativeEditScope,
  planArenaGenerativeEditScope,
  unscopedPageIndex,
} from '@/lib/arena-generative-ui/edit-scope'
import {
  multiPageApiBindings,
  multiPageManifest,
} from '@/lib/arena-generative-ui/multi-page-app.fixture'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

function textMessage(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

const SCOPED = {
  mode: 'pages',
  pages: ['results'],
  pageSetStable: true,
  touchesActions: false,
  touchesTheme: false,
}

describe('parseArenaGenerativeEditScope', () => {
  const options = { manifest: multiPageManifest }

  it('keeps a narrow scope of known pages', () => {
    const scope = parseArenaGenerativeEditScope(SCOPED, options)

    expect(scope).toEqual({
      mode: 'pages',
      pages: ['results'],
      pageSetStable: true,
      touchesActions: false,
      touchesTheme: false,
    })
  })

  it('drops page paths that are not in the manifest', () => {
    const scope = parseArenaGenerativeEditScope(
      { ...SCOPED, pages: ['results', 'invented-page'] },
      options
    )

    expect(scope?.pages).toEqual(['results'])
  })

  it('falls back to global when every listed path is unknown', () => {
    const scope = parseArenaGenerativeEditScope({ ...SCOPED, pages: ['nope'] }, options)

    expect(scope?.mode).toBe('global')
    expect(scope?.pages).toEqual([])
  })

  it('falls back to global when the scope covers the whole app', () => {
    const scope = parseArenaGenerativeEditScope(
      { ...SCOPED, pages: ['home', 'results', 'dashboard', 'settings'] },
      options
    )

    expect(scope?.mode).toBe('global')
  })

  it(`falls back to global past ${MAX_SCOPED_EDIT_PAGES} pages, even with pages left over`, () => {
    const fivePages = {
      ...multiPageManifest,
      pages: { ...multiPageManifest.pages, archive: multiPageManifest.pages.settings },
    }
    const scope = parseArenaGenerativeEditScope(
      { ...SCOPED, pages: ['home', 'results', 'dashboard', 'settings'] },
      { manifest: fivePages }
    )

    expect(scope?.mode).toBe('global')
  })

  it('preserves pageSetStable and the touches flags when collapsing to global', () => {
    const scope = parseArenaGenerativeEditScope(
      { mode: 'global', pages: [], pageSetStable: false, touchesActions: true, touchesTheme: true },
      options
    )

    expect(scope).toEqual({
      mode: 'global',
      pages: [],
      pageSetStable: false,
      touchesActions: true,
      touchesTheme: true,
    })
  })

  it('rejects a malformed reply', () => {
    expect(parseArenaGenerativeEditScope({ mode: 'sideways' }, options)).toBeNull()
    expect(parseArenaGenerativeEditScope({ pages: ['home'] }, options)).toBeNull()
    expect(parseArenaGenerativeEditScope(null, options)).toBeNull()
  })

  it('rejects a page path that is not kebab-case', () => {
    expect(parseArenaGenerativeEditScope({ ...SCOPED, pages: ['Not Kebab'] }, options)).toBeNull()
  })
})

describe('editScopePageIndex', () => {
  it('describes each page by component types and onLoad without any spec JSON', () => {
    const index = editScopePageIndex(multiPageManifest)
    const dashboard = index.find((page) => page.path === 'dashboard')

    expect(dashboard).toMatchObject({
      path: 'dashboard',
      title: 'Operations',
      onLoad: ['load_dashboard'],
    })
    expect(dashboard?.components).toContain('Table')
    expect(JSON.stringify(index)).not.toContain('elements')
  })

  it('reports nav targets so the generator can keep cross-page links valid', () => {
    const home = editScopePageIndex(multiPageManifest).find((page) => page.path === 'home')

    expect(home?.navigatesTo).toEqual(
      expect.arrayContaining(['home', 'results', 'dashboard', 'settings'])
    )
  })
})

describe('unscopedPageIndex', () => {
  it('excludes the scoped pages', () => {
    const paths = unscopedPageIndex(multiPageManifest, ['results']).map((page) => page.path)

    expect(paths).toEqual(['home', 'dashboard', 'settings'])
  })
})

describe('planArenaGenerativeEditScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips the call entirely on a manifest too small to be worth scoping', async () => {
    const scope = await planArenaGenerativeEditScope({
      editInstructions: 'Center the search field.',
      manifest: twoPageManifest,
      apiBindings: twoPageApiBindings,
    })

    expect(scope).toBeNull()
    expect(mockCreateAnthropicMessage).not.toHaveBeenCalled()
  })

  it('returns null for empty instructions', async () => {
    const scope = await planArenaGenerativeEditScope({
      editInstructions: '   ',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    expect(scope).toBeNull()
    expect(mockCreateAnthropicMessage).not.toHaveBeenCalled()
  })

  it('sends the page index and no spec JSON, on a small deterministic budget', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(SCOPED)))

    await planArenaGenerativeEditScope({
      editInstructions: 'Show the score as a Stat on results.',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    const [, options] = mockCreateAnthropicMessage.mock.calls[0]
    const payload = options.messages[0].content as string
    expect(options.max_tokens).toBeLessThanOrEqual(1_024)
    expect(options.temperature).toBe(0)
    expect(payload).toContain('"path": "dashboard"')
    expect(payload).toContain('load_leads')
    expect(payload).not.toContain('"elements"')
  })

  it('parses a scoped reply', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage(JSON.stringify(SCOPED)))

    const scope = await planArenaGenerativeEditScope({
      editInstructions: 'Show the score as a Stat on results.',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    expect(scope?.mode).toBe('pages')
    expect(scope?.pages).toEqual(['results'])
  })

  it('repairs one malformed reply before giving up', async () => {
    mockCreateAnthropicMessage
      .mockResolvedValueOnce(textMessage('not json at all'))
      .mockResolvedValueOnce(textMessage(JSON.stringify(SCOPED)))

    const scope = await planArenaGenerativeEditScope({
      editInstructions: 'Show the score as a Stat on results.',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    expect(mockCreateAnthropicMessage).toHaveBeenCalledTimes(2)
    expect(scope?.pages).toEqual(['results'])
  })

  it('returns null when every attempt is unusable', async () => {
    mockCreateAnthropicMessage.mockResolvedValue(textMessage('still not json'))

    const scope = await planArenaGenerativeEditScope({
      editInstructions: 'Show the score as a Stat on results.',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    expect(scope).toBeNull()
  })

  it('returns null when the call throws', async () => {
    mockCreateAnthropicMessage.mockRejectedValue(new Error('network down'))

    const scope = await planArenaGenerativeEditScope({
      editInstructions: 'Show the score as a Stat on results.',
      manifest: multiPageManifest,
      apiBindings: multiPageApiBindings,
    })

    expect(scope).toBeNull()
  })
})
