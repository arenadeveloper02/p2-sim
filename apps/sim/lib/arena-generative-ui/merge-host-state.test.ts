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

  it('does not concatenate when the incoming list already includes existing ids', () => {
    expect(
      mergeHostState(
        { articles: [{ id: '1' }, { id: '2' }] },
        { articles: [{ id: '1' }, { id: '2' }, { id: '3' }] },
        ['articles']
      )
    ).toEqual({
      articles: [{ id: '1' }, { id: '2' }, { id: '3' }],
    })
  })

  it('does not rename the selected parent when dummy create setState includes form fields', () => {
    expect(
      mergeHostState(
        {
          projects: [{ id: 'p1', name: 'Alpha' }],
          tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }],
          selectedId: 'p1',
          selected: { id: 'p1', name: 'Alpha' },
        },
        { tasks: [{ id: 't3', name: 'Review' }], name: 'Review', creating: false },
        ['tasks']
      )
    ).toEqual({
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [
        { id: 't1', name: 'Ship', projectId: 'p1' },
        { id: 't3', name: 'Review', projectId: 'p1' },
      ],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
      name: 'Review',
      creating: false,
    })
  })

  it('appends a dummy create row and stamps the selected parent id', () => {
    expect(
      mergeHostState(
        {
          tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }],
          selectedId: 'p1',
          selected: { id: 'p1', name: 'Alpha' },
        },
        { tasks: [{ id: 't3', name: 'Review' }] },
        ['tasks']
      )
    ).toEqual({
      tasks: [
        { id: 't1', name: 'Ship', projectId: 'p1' },
        { id: 't3', name: 'Review', projectId: 'p1' },
      ],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
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

  it('removes the selected collection item on dummy delete', () => {
    expect(
      mergeHostState(
        {
          todos: [
            { id: 'a', title: 'Milk' },
            { id: 'b', title: 'Bread' },
          ],
          selectedId: 'a',
          selected: { id: 'a', title: 'Milk' },
          content: 'Milk',
        },
        { deleted: true, title: 'Milk' }
      )
    ).toEqual({
      todos: [{ id: 'b', title: 'Bread' }],
      title: 'Milk',
    })
  })

  it('completes a Repeat row from action values while a parent is selected', () => {
    expect(
      mergeHostState(
        {
          projects: [{ id: 'p1', name: 'Alpha' }],
          tasks: [{ id: 't1', name: 'Ship', projectId: 'p1', done: false }],
          selectedId: 'p1',
          selected: { id: 'p1', name: 'Alpha' },
        },
        { id: 't1', name: 'Ship', done: true, index: 0 }
      )
    ).toEqual({
      projects: [{ id: 'p1', name: 'Alpha' }],
      tasks: [{ id: 't1', name: 'Ship', projectId: 'p1', done: true }],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
      id: 't1',
      name: 'Ship',
      done: true,
      index: 0,
    })
  })

  it('writes dummy complete fields onto the selected collection item', () => {
    expect(
      mergeHostState(
        {
          todos: [
            { id: 'a', title: 'Milk', done: false },
            { id: 'b', title: 'Bread', done: false },
          ],
          selectedId: 'a',
          selected: { id: 'a', title: 'Milk', done: false },
        },
        { title: 'Milk', done: true }
      )
    ).toEqual({
      todos: [
        { id: 'a', title: 'Milk', done: true },
        { id: 'b', title: 'Bread', done: false },
      ],
      selectedId: 'a',
      selected: { id: 'a', title: 'Milk', done: true },
      title: 'Milk',
      done: true,
    })
  })

  it('stamps projectId onto a created child row when a parent is selected', () => {
    expect(
      mergeHostState(
        {
          tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }],
          selectedId: 'p1',
          selected: { id: 'p1', name: 'Alpha' },
        },
        { tasks: [{ id: 't1', name: 'Ship', projectId: 'p1' }, { id: 't3', name: 'Review' }] }
      )
    ).toEqual({
      tasks: [
        { id: 't1', name: 'Ship', projectId: 'p1' },
        { id: 't3', name: 'Review', projectId: 'p1' },
      ],
      selectedId: 'p1',
      selected: { id: 'p1', name: 'Alpha' },
    })
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
