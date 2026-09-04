/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyGenerateWarningsToStoredBrief,
  collectGenerateWarnings,
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
      })
    ).toEqual([])
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
