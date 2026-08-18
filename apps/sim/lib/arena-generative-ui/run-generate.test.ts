/**
 * @vitest-environment node
 */
import { generativeAppDraft } from '@sim/db/schema'
import { queueTableRows, resetDbChainMock } from '@sim/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGenerateManifest, mockPersistDraft } = vi.hoisted(() => ({
  mockGenerateManifest: vi.fn(),
  mockPersistDraft: vi.fn(),
}))

vi.mock('@/lib/arena-generative-ui/generate-manifest', () => ({
  generateArenaGenerativeManifest: mockGenerateManifest,
}))

vi.mock('@/lib/arena-generative-ui/persist-draft', () => ({
  persistGenerativeAppDraft: mockPersistDraft,
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
      expect.objectContaining({ draftId: 'draft-1', brief: undefined })
    )
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
})
