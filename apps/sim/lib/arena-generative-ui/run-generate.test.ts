/**
 * @vitest-environment node
 */
import { generativeAppDraft } from '@sim/db/schema'
import { queueTableRows, resetDbChainMock } from '@sim/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGenerateManifest, mockPersistDraft, mockRefreshSchemas, mockResolveScreenshots, mockInterpretVisual } =
  vi.hoisted(() => ({
    mockGenerateManifest: vi.fn(),
    mockPersistDraft: vi.fn(),
    mockRefreshSchemas: vi.fn(async (bindings: unknown) => bindings),
    mockResolveScreenshots: vi.fn(),
    mockInterpretVisual: vi.fn(),
  }))

vi.mock('@/lib/arena-generative-ui/generate-manifest', () => ({
  generateArenaGenerativeManifest: mockGenerateManifest,
}))

vi.mock('@/lib/arena-generative-ui/persist-draft', () => ({
  persistGenerativeAppDraft: mockPersistDraft,
}))

vi.mock('@/lib/arena-generative-ui/refresh-binding-schemas', () => ({
  refreshWorkflowBindingOutputSchemas: mockRefreshSchemas,
}))

vi.mock('@/lib/arena-generative-ui/visual-reference', () => ({
  resolveArenaGenerativeScreenshots: mockResolveScreenshots,
  screenshotResolveErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Failed to read screenshots',
}))

vi.mock('@/lib/arena-generative-ui/interpret-visual-brief', () => ({
  interpretArenaGenerativeVisualBrief: mockInterpretVisual,
}))

import { runArenaGenerativeUi } from '@/lib/arena-generative-ui/run-generate'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

const BASE_BODY = {
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
}

function queueDraft(overrides: Record<string, unknown> = {}) {
  queueTableRows(generativeAppDraft, [
    {
      id: 'draft-1',
      workflowId: 'wf-1',
      manifest: twoPageManifest,
      apiBindings: twoPageApiBindings,
      brief: 'Lead qualifier with a results page.',
      ...overrides,
    },
  ])
}

describe('runArenaGenerativeUi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockGenerateManifest.mockResolvedValue({
      success: true,
      title: 'Lead qualifier',
      content: 'ok',
      manifest: twoPageManifest,
    })
    mockPersistDraft.mockResolvedValue({ draftId: 'draft-1', revisionId: 'rev-2', revision: 2 })
  })

  it('stores the brief on generate so a later edit can send it as context', async () => {
    const result = await runArenaGenerativeUi({
      body: { ...BASE_BODY, userInput: 'Team directory.' },
      userId: 'user-1',
      requireExistingDraft: false,
    })

    expect(result.success).toBe(true)
    expect(mockPersistDraft).toHaveBeenCalledWith(
      expect.objectContaining({ brief: 'Team directory.', draftId: undefined })
    )
  })

  it('stores the planned structured brief on generate', async () => {
    const plannedBrief = {
      title: 'Orders',
      purpose: 'Browse orders',
      audience: 'Ops',
      archetype: 'collection' as const,
      entryPath: 'home',
      pages: [{ path: 'home', title: 'Orders', purpose: 'List' }],
      actions: [],
    }
    mockGenerateManifest.mockResolvedValueOnce({
      success: true,
      title: 'Lead qualifier',
      content: 'ok',
      manifest: twoPageManifest,
      plannedBrief,
    })

    await runArenaGenerativeUi({
      body: { ...BASE_BODY, userInput: 'Team directory.' },
      userId: 'user-1',
      requireExistingDraft: false,
    })

    expect(mockPersistDraft).toHaveBeenCalledWith(
      expect.objectContaining({ structuredBrief: plannedBrief })
    )
  })

  it('sends only the edit delta as the request and the stored brief as context', async () => {
    queueDraft()

    await runArenaGenerativeUi({
      body: {
        ...BASE_BODY,
        existingDraftId: 'draft-1',
        editInstructions: 'Centre the search row.',
      },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(mockGenerateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        userInput: 'Centre the search row.',
        existingBrief: 'Lead qualifier with a results page.',
        existingManifest: twoPageManifest,
      })
    )
  })

  it('sends the stored structured brief on edit', async () => {
    const structuredBrief = {
      title: 'Orders',
      purpose: 'Browse orders',
      audience: 'Ops',
      archetype: 'collection',
      entryPath: 'home',
      pages: [
        { path: 'home', title: 'Orders', purpose: 'List', data: 'onLoad load_orders into orders' },
        { path: 'detail', title: 'Order', purpose: 'Record', data: 'onLoad load_order from ?id' },
      ],
      actions: [],
    }
    queueDraft({ structuredBrief })

    await runArenaGenerativeUi({
      body: {
        ...BASE_BODY,
        existingDraftId: 'draft-1',
        editInstructions: 'Centre the search row.',
      },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(mockGenerateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        existingStructuredBrief: expect.objectContaining({ archetype: 'collection' }),
      })
    )
  })

  it('never sends the edit delta as a replacement brief', async () => {
    queueDraft()

    await runArenaGenerativeUi({
      body: {
        ...BASE_BODY,
        existingDraftId: 'draft-1',
        editInstructions: 'Centre the search row.',
      },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(mockPersistDraft).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft-1', brief: undefined, structuredBrief: undefined })
    )
  })

  it('persists a new brief and structured brief when the generator replanned', async () => {
    queueDraft()
    const plannedBrief = {
      title: 'Operations',
      purpose: 'Weekly ops',
      audience: 'Ops',
      archetype: 'dashboard' as const,
      entryPath: 'home',
      pages: [{ path: 'home', title: 'Operations', purpose: 'KPIs' }],
      actions: [],
    }
    mockGenerateManifest.mockResolvedValueOnce({
      success: true,
      title: 'Operations',
      content: 'ok',
      manifest: twoPageManifest,
      plannedBrief,
      editScope: { mode: 'replan', pages: [] },
    })

    await runArenaGenerativeUi({
      body: {
        ...BASE_BODY,
        existingDraftId: 'draft-1',
        editInstructions: 'Turn this into a dashboard of weekly ops.',
      },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(mockPersistDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        structuredBrief: plannedBrief,
        brief: expect.stringContaining('Turn this into a dashboard'),
      })
    )
    const persistedBrief = mockPersistDraft.mock.calls[0]?.[0].brief as string
    expect(persistedBrief).toContain('Lead qualifier with a results page.')
  })

  it('tolerates a draft saved before the brief column existed', async () => {
    queueDraft({ brief: null })

    await runArenaGenerativeUi({
      body: { ...BASE_BODY, existingDraftId: 'draft-1', editInstructions: 'Add a Back link.' },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(mockGenerateManifest).toHaveBeenCalledWith(
      expect.objectContaining({ existingBrief: undefined, userInput: 'Add a Back link.' })
    )
    expect(mockGenerateManifest.mock.calls[0]?.[0]).not.toHaveProperty('existingStructuredBrief')
  })

  it('rejects an edit with no requested changes', async () => {
    queueDraft()

    const result = await runArenaGenerativeUi({
      body: { ...BASE_BODY, existingDraftId: 'draft-1', editInstructions: '   ' },
      userId: 'user-1',
      requireExistingDraft: true,
    })

    expect(result).toEqual({ success: false, error: 'editInstructions is required' })
    expect(mockGenerateManifest).not.toHaveBeenCalled()
  })

  it('refreshes workflow outputSchema before generate and persist', async () => {
    const refreshed = [
      {
        ...twoPageApiBindings[0],
        outputSchema: [
          { name: 'items', type: 'array' },
          { name: 'items[].keyword', type: 'string' },
        ],
      },
    ]
    mockRefreshSchemas.mockResolvedValueOnce(refreshed)

    await runArenaGenerativeUi({
      body: { ...BASE_BODY, userInput: 'Team directory.', apiBindings: twoPageApiBindings },
      userId: 'user-1',
      requireExistingDraft: false,
    })

    expect(mockRefreshSchemas).toHaveBeenCalledWith(twoPageApiBindings)
    expect(mockGenerateManifest).toHaveBeenCalledWith(
      expect.objectContaining({ apiBindings: refreshed })
    )
    expect(mockPersistDraft).toHaveBeenCalledWith(
      expect.objectContaining({ apiBindings: refreshed })
    )
  })

  it('interprets screenshots and passes the visual brief into generate', async () => {
    const visualBrief = {
      screens: [{ purpose: 'Lead form', visibleCopy: ['Submit'], fields: [], ctas: ['Submit'] }],
      layout: {},
      catalogMapping: [],
      unrepresentable: [],
    }
    mockResolveScreenshots.mockResolvedValueOnce([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aa' } },
    ])
    mockInterpretVisual.mockResolvedValueOnce({ brief: visualBrief })

    await runArenaGenerativeUi({
      body: {
        ...BASE_BODY,
        screenshots: [{ name: 'home.png', key: 'uploads/home.png', size: 12 }],
      },
      userId: 'user-1',
      requireExistingDraft: false,
    })

    expect(mockInterpretVisual).toHaveBeenCalled()
    expect(mockGenerateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        visualBrief,
        userInput: expect.stringContaining('matches the uploaded screenshot'),
      })
    )
    expect(mockPersistDraft).toHaveBeenCalledWith(expect.objectContaining({ visualBrief }))
  })
})
