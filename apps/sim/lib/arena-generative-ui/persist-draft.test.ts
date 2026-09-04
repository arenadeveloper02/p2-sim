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

  it('overwrites the structured brief when a re-plan supplies one', async () => {
    queueTableRows(generativeAppDraft, [{ id: 'draft-1', revision: 1 }])
    const structuredBrief = {
      title: 'Operations',
      purpose: 'Weekly ops',
      audience: 'Ops',
      archetype: 'dashboard' as const,
      entryPath: 'home',
      pages: [
        { path: 'home', title: 'Operations', purpose: 'KPIs', data: 'onLoad load_dashboard' },
      ],
      actions: [],
    }

    await persistGenerativeAppDraft({
      ...BASE_INPUT,
      draftId: 'draft-1',
      brief: 'Turn this into a dashboard.',
      structuredBrief,
    })

    const updated = dbChainMockFns.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updated).toMatchObject({
      revision: 2,
      brief: 'Turn this into a dashboard.',
      structuredBrief: expect.objectContaining({ title: 'Operations', archetype: 'dashboard' }),
    })
  })

  it('stores the structured brief when creating a draft', async () => {
    const structuredBrief = {
      title: 'Orders',
      purpose: 'Browse orders',
      audience: 'Ops',
      archetype: 'collection' as const,
      entryPath: 'home',
      pages: [{ path: 'home', title: 'Orders', purpose: 'List', data: 'onLoad load_orders' }],
      actions: [],
    }
    await persistGenerativeAppDraft({ ...BASE_INPUT, structuredBrief })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredBrief: expect.objectContaining({ title: 'Orders', archetype: 'collection' }),
        revision: 1,
      })
    )
  })

  it('nests a visual brief on the stored structured-brief jsonb', async () => {
    const visualBrief = {
      screens: [
        {
          purpose: 'Lead form',
          visibleCopy: ['Submit'],
          fields: [],
          ctas: ['Submit'],
          regions: [],
        },
      ],
      layout: { density: 'comfortable' as const },
      catalogMapping: [],
      unrepresentable: [],
    }
    await persistGenerativeAppDraft({ ...BASE_INPUT, visualBrief })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredBrief: expect.objectContaining({ visualBrief }),
      })
    )
  })

  it('nests generate warnings on the stored structured-brief jsonb', async () => {
    await persistGenerativeAppDraft({
      ...BASE_INPUT,
      generateWarnings: [
        {
          code: 'planner-failed',
          message: 'Planner failed (bad json); generated from the prose brief.',
        },
      ],
    })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredBrief: {
          generateWarnings: [
            {
              code: 'planner-failed',
              message: 'Planner failed (bad json); generated from the prose brief.',
            },
          ],
        },
      })
    )
  })

  it('merges generate warnings into the stored jsonb on an ordinary edit', async () => {
    queueTableRows(generativeAppDraft, [
      {
        id: 'draft-1',
        revision: 1,
        structuredBrief: { title: 'Orders', archetype: 'collection' },
      },
    ])

    await persistGenerativeAppDraft({
      ...BASE_INPUT,
      draftId: 'draft-1',
      generateWarnings: [
        { code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' },
      ],
    })

    const updated = dbChainMockFns.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updated.structuredBrief).toEqual({
      title: 'Orders',
      archetype: 'collection',
      generateWarnings: [{ code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' }],
    })
  })
})
