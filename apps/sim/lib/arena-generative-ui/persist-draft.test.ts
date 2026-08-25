/**
 * @vitest-environment node
 */
import { generativeAppDraft } from '@sim/db/schema'
import { dbChainMockFns, queueTableRows, resetDbChainMock } from '@sim/testing/mocks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistGenerativeAppDraft } from '@/lib/arena-generative-ui/persist-draft'
import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

const BASE_INPUT = {
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  userId: 'user-1',
  title: 'Lead qualifier',
  entryPath: 'home',
  manifest: twoPageManifest,
  apiBindings: twoPageApiBindings,
}

describe('persistGenerativeAppDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('stores the brief when creating a draft', async () => {
    await persistGenerativeAppDraft({ ...BASE_INPUT, brief: 'Team directory.' })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ brief: 'Team directory.', revision: 1 })
    )
  })

  it('writes an explicit null when a draft is created without a brief', async () => {
    await persistGenerativeAppDraft(BASE_INPUT)

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ brief: null, structuredBrief: null })
    )
  })

  it('leaves the stored brief untouched when appending an edit revision', async () => {
    queueTableRows(generativeAppDraft, [{ id: 'draft-1', revision: 1 }])

    const result = await persistGenerativeAppDraft({ ...BASE_INPUT, draftId: 'draft-1' })

    expect(result.revision).toBe(2)
    const updated = dbChainMockFns.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updated).toMatchObject({ revision: 2, title: 'Lead qualifier' })
    expect(updated).not.toHaveProperty('brief')
    expect(updated).not.toHaveProperty('structuredBrief')
  })

  it('stores the structured brief when creating a draft', async () => {
    const structuredBrief = {
      title: 'Orders',
      purpose: 'Browse orders',
      audience: 'Ops',
      archetype: 'list-detail' as const,
      entryPath: 'home',
      pages: [{ path: 'home', title: 'Orders', purpose: 'List', data: 'onLoad load_orders' }],
      actions: [],
    }
    await persistGenerativeAppDraft({ ...BASE_INPUT, structuredBrief })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ structuredBrief, revision: 1 })
    )
  })
})
