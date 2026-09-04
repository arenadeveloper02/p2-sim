/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyGenerateNotesToStoredBrief,
  applyGenerateWarningsToStoredBrief,
  collectAdoptedChanges,
  collectGenerateWarnings,
  parseStoredAdoptedChanges,
  parseStoredGenerateWarnings,
} from '@/lib/arena-generative-ui/generate-warnings'

describe('collectGenerateWarnings', () => {
  it('returns an empty list when every stage ran', () => {
    expect(collectGenerateWarnings({})).toEqual([])
  })

  it('records each fail-open skip from a generate', () => {
    expect(
      collectGenerateWarnings({
        intentError: 'haiku down',
        plannerError: 'not a valid structured brief',
        droppedActions: [{ id: 'load_order', apiKey: 'get_order' }],
        visualBriefError: 'vision timeout',
        criticSkipped: true,
      })
    ).toEqual([
      {
        code: 'intent-skipped',
        message: 'Intent skipped (haiku down); planner inferred from prose.',
      },
      {
        code: 'planner-failed',
        message: 'Planner failed (not a valid structured brief); generated from the prose brief.',
      },
      {
        code: 'actions-dropped',
        message:
          'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
      },
      {
        code: 'visual-skipped',
        message: 'Visual skipped (vision timeout); planned from prose.',
      },
      {
        code: 'critic-skipped',
        message: 'UI critic: skipped (unavailable)',
      },
    ])
  })

  it('keeps stored intent and planner skips on a preserve edit', () => {
    expect(
      collectGenerateWarnings({
        isPreserveEdit: true,
        criticSkipped: true,
        existing: [
          {
            code: 'planner-failed',
            message: 'Planner failed (not a valid structured brief); generated from the prose brief.',
          },
          {
            code: 'actions-dropped',
            message:
              'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
          },
          {
            code: 'critic-skipped',
            message: 'UI critic: skipped (unavailable)',
          },
        ],
      })
    ).toEqual([
      {
        code: 'planner-failed',
        message: 'Planner failed (not a valid structured brief); generated from the prose brief.',
      },
      {
        code: 'actions-dropped',
        message:
          'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
      },
      {
        code: 'critic-skipped',
        message: 'UI critic: skipped (unavailable)',
      },
    ])
  })

  it('does not re-emit this-run intent or planner errors on a preserve edit', () => {
    expect(
      collectGenerateWarnings({
        isPreserveEdit: true,
        intentError: 'should not appear',
        plannerError: 'should not appear',
        droppedActions: [{ id: 'ghost', apiKey: 'invented' }],
        uncoordinatedPages: ['home'],
      })
    ).toEqual([])
  })

  it('records Workspace pages that have regions but no interaction', () => {
    expect(
      collectGenerateWarnings({
        uncoordinatedPages: ['home'],
      })
    ).toEqual([
      {
        code: 'uncoordinated-regions',
        message:
          'Planner left page(s) home without pages[].interaction — Workspace regions are uncoordinated. Name selection, inspect, or execution.',
      },
    ])
  })

  it('keeps a stored uncoordinated-regions note on a preserve edit', () => {
    expect(
      collectGenerateWarnings({
        isPreserveEdit: true,
        criticSkipped: true,
        existing: [
          {
            code: 'uncoordinated-regions',
            message:
              'Planner left page(s) home without pages[].interaction — Workspace regions are uncoordinated. Name selection, inspect, or execution.',
          },
        ],
      })
    ).toEqual([
      {
        code: 'uncoordinated-regions',
        message:
          'Planner left page(s) home without pages[].interaction — Workspace regions are uncoordinated. Name selection, inspect, or execution.',
      },
      {
        code: 'critic-skipped',
        message: 'UI critic: skipped (unavailable)',
      },
    ])
  })

  it('records invented planner actions that were stripped', () => {
    expect(
      collectGenerateWarnings({
        droppedActions: [{ id: 'load_order', apiKey: 'get_order' }],
      })
    ).toEqual([
      {
        code: 'actions-dropped',
        message:
          'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
      },
    ])
  })

  it('keeps a stored actions-dropped note on a preserve edit', () => {
    expect(
      collectGenerateWarnings({
        isPreserveEdit: true,
        criticSkipped: true,
        existing: [
          {
            code: 'actions-dropped',
            message:
              'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
          },
        ],
      })
    ).toEqual([
      {
        code: 'actions-dropped',
        message:
          'Planner dropped action(s) load_order (apiKey "get_order") — not a declared binding. Add the API or remap the CTA.',
      },
      {
        code: 'critic-skipped',
        message: 'UI critic: skipped (unavailable)',
      },
    ])
  })
})

describe('parseStoredGenerateWarnings', () => {
  it('reads nested generateWarnings on stored jsonb', () => {
    expect(
      parseStoredGenerateWarnings({
        title: 'Orders',
        generateWarnings: [
          {
            code: 'planner-failed',
            message: 'Planner failed (bad json); generated from the prose brief.',
          },
        ],
      })
    ).toEqual([
      {
        code: 'planner-failed',
        message: 'Planner failed (bad json); generated from the prose brief.',
      },
    ])
  })

  it('returns an empty list when none were stored', () => {
    expect(parseStoredGenerateWarnings({ title: 'Orders' })).toEqual([])
    expect(parseStoredGenerateWarnings(null)).toEqual([])
    expect(parseStoredGenerateWarnings({ generateWarnings: [{ code: 'nope', message: 'x' }] })).toEqual(
      []
    )
  })
})

describe('collectAdoptedChanges', () => {
  const extraPrimary = {
    code: 'extra-primary' as const,
    asked: 'Section "hero" on page "home" had more than one primary action (a, b).',
    adopted: 'Kept "a" as primary; changed "b" to a secondary Button.',
  }

  it('replaces adopted changes on a generate', () => {
    expect(collectAdoptedChanges({ current: [extraPrimary] })).toEqual([extraPrimary])
  })

  it('keeps stored adopted changes on a preserve edit', () => {
    expect(
      collectAdoptedChanges({
        isPreserveEdit: true,
        existing: [extraPrimary],
        current: [],
      })
    ).toEqual([extraPrimary])
  })
})

describe('parseStoredAdoptedChanges', () => {
  it('reads nested adoptedChanges on stored jsonb', () => {
    expect(
      parseStoredAdoptedChanges({
        title: 'Orders',
        adoptedChanges: [
          {
            code: 'extra-primary',
            asked: 'Section "hero" on page "home" had more than one primary action (a, b).',
            adopted: 'Kept "a" as primary; changed "b" to a secondary Button.',
          },
        ],
      })
    ).toHaveLength(1)
  })
})

describe('applyGenerateNotesToStoredBrief', () => {
  it('nests adopted changes beside generate warnings', () => {
    expect(
      applyGenerateNotesToStoredBrief({ title: 'Orders' }, {
        adoptedChanges: [
          {
            code: 'extra-primary',
            asked: 'Section "hero" on page "home" had more than one primary action (a, b).',
            adopted: 'Kept "a" as primary; changed "b" to a secondary Button.',
          },
        ],
      })
    ).toEqual({
      title: 'Orders',
      adoptedChanges: [
        {
          code: 'extra-primary',
          asked: 'Section "hero" on page "home" had more than one primary action (a, b).',
          adopted: 'Kept "a" as primary; changed "b" to a secondary Button.',
        },
      ],
    })
  })
})

describe('applyGenerateWarningsToStoredBrief', () => {
  it('leaves the packed object unchanged when warnings are omitted', () => {
    expect(applyGenerateWarningsToStoredBrief({ title: 'Orders' }, undefined)).toEqual({
      title: 'Orders',
    })
    expect(applyGenerateWarningsToStoredBrief(null, undefined)).toBeNull()
  })

  it('nests warnings on an otherwise empty pack', () => {
    expect(
      applyGenerateWarningsToStoredBrief(null, [
        { code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' },
      ])
    ).toEqual({
      generateWarnings: [{ code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' }],
    })
  })

  it('clears stored warnings when the latest run had none', () => {
    expect(
      applyGenerateWarningsToStoredBrief(
        {
          title: 'Orders',
          generateWarnings: [{ code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' }],
        },
        []
      )
    ).toEqual({ title: 'Orders' })
    expect(
      applyGenerateWarningsToStoredBrief(
        { generateWarnings: [{ code: 'critic-skipped', message: 'UI critic: skipped (unavailable)' }] },
        []
      )
    ).toBeNull()
  })
})
