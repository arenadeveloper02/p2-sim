/**
 * Run with: bun test .sandcastle/lib/wip-stability.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { computeWipStabilityHash, wipGrillAnswerKeys } from './wip-stability'

describe('wipGrillAnswerKeys', () => {
  test('drops operational resume comments without Q ids', () => {
    expect(
      wipGrillAnswerKeys([
        {
          id: 'a-1',
          source: 'resume',
          answer: '/upstream-sync resume\n\nRe-apply WIP and continue.',
        },
        { id: 'q-keep', source: 'pr-comment', answer: 'keep fork branding' },
      ])
    ).toEqual(['q-keep'])
  })

  test('keeps resume text that still names a grill question', () => {
    expect(
      wipGrillAnswerKeys([
        {
          id: 'a-2',
          source: 'resume',
          answer: '/upstream-sync resume\n\nQ1: take upstream oauth route.',
        },
      ])
    ).toEqual(['resume:Q1: take upstream oauth route.'])
  })
})

describe('computeWipStabilityHash', () => {
  test('is stable for grill + policy and ignores key order', () => {
    const a = computeWipStabilityHash({
      grillAnswerIds: ['b', 'a'],
      mergePolicyContents: '{"forkFirst":[]}',
    })
    const b = computeWipStabilityHash({
      grillAnswerIds: ['a', 'b'],
      mergePolicyContents: '{"forkFirst":[]}',
    })
    expect(a).toBe(b)
  })

  test('changes when merge-policy changes', () => {
    const a = computeWipStabilityHash({ grillAnswerIds: [], mergePolicyContents: '{}' })
    const b = computeWipStabilityHash({
      grillAnswerIds: [],
      mergePolicyContents: '{"forkFirst":["apps/"]}',
    })
    expect(a).not.toBe(b)
  })
})
