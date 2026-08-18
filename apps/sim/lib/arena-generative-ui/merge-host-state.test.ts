/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { MAX_APPENDED_ITEMS, mergeHostState } from '@/lib/arena-generative-ui/merge-host-state'

describe('mergeHostState', () => {
  it('replaces keys that are not listed for append', () => {
    expect(
      mergeHostState({ articles: [{ id: '1' }], count: 1 }, { articles: [{ id: '2' }], count: 2 })
    ).toEqual({ articles: [{ id: '2' }], count: 2 })
  })

  it('concatenates listed arrays and leaves other keys replacing', () => {
    expect(
      mergeHostState(
        { articles: [{ id: '1' }], count: 1 },
        { articles: [{ id: '2' }], count: 2, hasMore: true },
        ['articles']
      )
    ).toEqual({
      articles: [{ id: '1' }, { id: '2' }],
      count: 2,
      hasMore: true,
    })
  })

  it('replaces when the current value is not yet an array', () => {
    expect(mergeHostState({}, { articles: [{ id: '1' }] }, ['articles'])).toEqual({
      articles: [{ id: '1' }],
    })
  })

  it('caps concatenated length and turns hasMore off', () => {
    const current = {
      articles: Array.from({ length: MAX_APPENDED_ITEMS - 1 }, (_, index) => ({ id: index })),
    }
    const merged = mergeHostState(
      current,
      { articles: [{ id: 'new' }, { id: 'overflow' }], hasMore: true },
      ['articles']
    )
    expect((merged.articles as unknown[]).length).toBe(MAX_APPENDED_ITEMS)
    expect(merged.hasMore).toBe(false)
  })
})
