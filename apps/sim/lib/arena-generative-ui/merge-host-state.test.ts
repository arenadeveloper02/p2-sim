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

  it('appends chatTurns and seeds the first pair from prior content', () => {
    const first = mergeHostState(
      { content: 'Earlier reply' },
      {
        chatTurns: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: '' },
        ],
      },
      ['chatTurns']
    )
    expect(first.chatTurns).toEqual([
      { role: 'assistant', content: 'Earlier reply' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '' },
    ])

    const second = mergeHostState(
      first,
      {
        chatTurns: [
          { role: 'user', content: 'Again' },
          { role: 'assistant', content: '' },
        ],
      },
      ['chatTurns']
    )
    expect(second.chatTurns).toHaveLength(5)
    expect((second.chatTurns as Array<{ content: string }>)[3].content).toBe('Again')
  })

  it('drops keys whose patch value is undefined so leftover selection does not linger', () => {
    expect(
      mergeHostState(
        {
          content: '# Article',
          coverage_gaps: ['A'],
          history: [{ id: '1' }],
          selectedId: 'run_1',
        },
        { history: undefined, selectedId: undefined }
      )
    ).toEqual({
      content: '# Article',
      coverage_gaps: ['A'],
    })
  })

  it('patches the last assistant turn without replacing earlier turns', () => {
    const current = {
      chatTurns: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: '' },
      ],
    }
    const merged = mergeHostState(current, {
      content: 'Hel',
      __chatLastAssistant: 'Hel',
    })
    expect(merged.content).toBe('Hel')
    expect(merged.__chatLastAssistant).toBeUndefined()
    expect(merged.chatTurns).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hel' },
    ])
  })
})
