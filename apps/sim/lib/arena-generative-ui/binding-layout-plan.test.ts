/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  actionHiddenInputsFrom,
  actionHostKeysFrom,
  actionStateFromPlan,
  hostStateRoot,
  isActionControlPending,
  isBoundPathPending,
  layoutPlanForBinding,
  resultLayoutFromPlan,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

function workflowBinding(
  overrides: Partial<ArenaGenerativeApiBinding> = {}
): ArenaGenerativeApiBinding {
  return {
    key: 'run',
    label: 'Run',
    kind: 'workflow',
    workflowId: 'wf-1',
    ...overrides,
  }
}

describe('layoutPlanForBinding', () => {
  it('ignores nameless outputSchema rows instead of throwing', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        outputSchema: [
          { type: 'object' },
          { name: undefined },
          { name: '', type: 'string' },
        ] as Array<{
          name: string
          type: string
        }>,
      })
    )
    expect(plan.kind).toBe('prose')
    expect(plan.hostKeys).toEqual(['content'])
    expect(plan.collections).toEqual([])
  })

  it('treats a chat-only binding with garbage outputSchema as prose or stream', () => {
    const prose = layoutPlanForBinding(
      workflowBinding({
        chatProtocol: { input: true, conversationId: true, files: true },
        outputSchema: [{ type: 'object' }, { name: undefined }] as Array<{
          name: string
          type: string
        }>,
      })
    )
    expect(prose.kind).toBe('prose')
    expect(prose.chatProtocol).toEqual({
      input: true,
      conversationId: true,
      files: true,
    })

    const streamed = layoutPlanForBinding(
      workflowBinding({
        stream: true,
        chatProtocol: { input: true },
        outputSchema: [{ type: 'object' }] as Array<{ name: string; type: string }>,
      })
    )
    expect(streamed.kind).toBe('stream')
  })

  it('treats a missing outputSchema as prose DataText on content', () => {
    const plan = layoutPlanForBinding(workflowBinding())
    expect(plan.kind).toBe('prose')
    expect(plan.hostKeys).toEqual(['content'])
    expect(plan.collections).toEqual([])
    expect(resultLayoutFromPlan(plan)).toContain('do not invent Table columns')
  })

  it('treats stream without structured fields as streamed prose', () => {
    const plan = layoutPlanForBinding(workflowBinding({ stream: true, outputHint: '# Title' }))
    expect(plan.kind).toBe('stream')
    expect(plan.hostKeys).toEqual(['content'])
    expect(plan.stream).toBe(true)
    expect(resultLayoutFromPlan(plan)).toContain('Chat')
  })

  it('lifts run_data.history to hostKey history and marks selectItem when items include prose', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        key: 'run_history',
        outputSchema: [
          { name: 'run_data', type: 'object' },
          { name: 'run_data.history', type: 'array' },
          { name: 'run_data.history[].id', type: 'string' },
          { name: 'run_data.history[].input.keyword', type: 'string' },
          { name: 'run_data.history[].input.client', type: 'string' },
          { name: 'run_data.history[].createdAt', type: 'string' },
          { name: 'run_data.history[].output', type: 'string' },
        ],
      })
    )

    expect(plan.kind).toBe('collection')
    expect(plan.hostKeys).toContain('history')
    expect(plan.hostKeys).toContain('content')
    expect(plan.aliasKeys).toContain('items')
    expect(plan.recordKeys).not.toContain('run_data')
    expect(plan.collections).toEqual([
      {
        hostKey: 'history',
        schemaPaths: ['run_data.history'],
        wrapperKeys: ['run_data'],
        itemFields: [
          'id',
          'input.keyword',
          'keyword',
          'input.client',
          'client',
          'createdAt',
          'date',
        ],
        proseFields: ['output'],
        samePageSelect: true,
      },
    ])
    expect(resultLayoutFromPlan(plan)).toContain('selectItem')
    expect(resultLayoutFromPlan(plan)).toContain('do not bind item.output')
  })

  it('maps a score plus an articles array to collection hostKeys', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        key: 'qualify_lead',
        outputSchema: [
          { name: 'score', type: 'number' },
          { name: 'articles', type: 'array' },
          { name: 'articles[].title', type: 'string' },
          { name: 'articles[].url', type: 'string' },
        ],
      })
    )

    expect(plan.kind).toBe('collection')
    expect(plan.hostKeys).toEqual(['articles', 'score'])
    expect(plan.metricPaths).toEqual(['score'])
    expect(plan.collections[0]?.itemFields).toEqual(['title', 'url'])
    expect(plan.collections[0]?.samePageSelect).toBe(false)
  })

  it('keeps a top-level markdown string as a DataText path, not field.content', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        stream: true,
        outputSchema: [{ name: 'artical_data', type: 'string' }],
      })
    )

    expect(plan.kind).toBe('stream')
    expect(plan.stringFieldNames).toEqual(['artical_data'])
    expect(plan.prosePaths).toEqual(['artical_data', 'content'])
    expect(resultLayoutFromPlan(plan)).toContain('never "field.content"')
  })

  it('omits protocol fields, execute flags, and file[] uploads from formFields', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        inputSchema: [
          { name: 'input', type: 'string' },
          { name: 'files', type: 'array' },
          { name: 'stream', type: 'boolean' },
          { name: 'attachments', type: 'file[]' },
          { name: 'keyword', type: 'string' },
          { name: 'conversationId', type: 'string' },
        ],
      })
    )

    expect(plan.formFields).toEqual(['keyword'])
    expect(plan.hiddenInputFields).toEqual([])
  })

  it('splits form inputs from visitorEmail and constant fields', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        inputSchema: [
          { name: 'targetKeyword', type: 'string' },
          { name: 'type', type: 'string', source: 'constant', value: 'history' },
          { name: 'email', type: 'string', source: 'visitorEmail' },
        ],
      })
    )

    expect(plan.formFields).toEqual(['targetKeyword'])
    expect(plan.hiddenInputFields).toEqual(['type', 'email'])
  })

  it('adds pagination alias keys', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        outputSchema: [{ name: 'articles', type: 'array' }],
        pagination: { mode: 'cursor', items: 'articles' },
      })
    )

    expect(plan.aliasKeys).toEqual(expect.arrayContaining(['items', 'hasMore', 'nextCursor']))
  })
})

describe('actionStateFromPlan', () => {
  it('falls back to the heuristic merge when the binding has no outputSchema', () => {
    const payload = { data: { run_data: { history: [{ id: 'h1' }] } } }
    const state = actionStateFromPlan(payload, layoutPlanForBinding(workflowBinding()))
    expect(state.history).toEqual([{ id: 'h1' }])
    expect(state.run_data).toEqual({ history: [{ id: 'h1' }] })
  })

  it('emits lifted history and items without the run_data wrapper', () => {
    const history = [
      {
        id: 'h1',
        input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
        output: '',
        createdAt: '2026-08-24T06:28:56.717Z',
      },
    ]
    const plan = layoutPlanForBinding(
      workflowBinding({
        outputSchema: [
          { name: 'run_data', type: 'object' },
          { name: 'run_data.history', type: 'array' },
        ],
      })
    )
    const state = actionStateFromPlan({ data: { run_data: { history } } }, plan)
    expect(state.history).toEqual([
      expect.objectContaining({
        keyword: 'Dental Implants',
        client: 'Gentle Dental',
        date: '2026-08-24T06:28:56.717Z',
      }),
    ])
    expect(state.items).toBe(state.history)
    expect(state).not.toHaveProperty('run_data')
    expect(state).not.toHaveProperty('content')
  })

  it('keeps extra business keys that the schema did not list', () => {
    const plan = layoutPlanForBinding(
      workflowBinding({
        outputSchema: [
          { name: 'articles', type: 'array' },
          { name: 'articles[].title', type: 'string' },
        ],
      })
    )
    const state = actionStateFromPlan({ articles: [{ title: 'One' }], count: 3 }, plan)
    expect(state.articles).toEqual([{ title: 'One' }])
    expect(state.count).toBe(3)
  })

  it('lifts items out of assistantContent JSON without keeping the dump', () => {
    const items = [{ keyword: 'Dental implants' }]
    const plan = layoutPlanForBinding(
      workflowBinding({
        outputSchema: [
          { name: 'items', type: 'array' },
          { name: 'items[].keyword', type: 'string' },
        ],
      })
    )
    const state = actionStateFromPlan(
      {
        assistantContent: JSON.stringify({ items }),
        content: JSON.stringify({ items }),
        model: 'gpt-5.4-mini',
        tokens: { input: 10, output: 20, total: 30 },
      },
      plan
    )
    expect(state.items).toEqual(items)
    expect(state).not.toHaveProperty('assistantContent')
    expect(state).not.toHaveProperty('content')
    expect(state).not.toHaveProperty('tokens')
  })
})

describe('actionHostKeysFrom', () => {
  it('maps each action to its binding host keys', () => {
    const keys = actionHostKeysFrom(
      {
        actions: {
          load_list: { apiKey: 'list_articles' },
          load_stats: { apiKey: 'stats' },
        },
      },
      [
        workflowBinding({
          key: 'list_articles',
          outputSchema: [
            { name: 'articles', type: 'array' },
            { name: 'articles[].title', type: 'string' },
          ],
        }),
        workflowBinding({
          key: 'stats',
          outputSchema: [{ name: 'count', type: 'number' }],
        }),
      ]
    )
    expect(keys.load_list).toEqual(expect.arrayContaining(['articles']))
    expect(keys.load_list).not.toContain('count')
    expect(keys.load_stats).toEqual(['count'])
  })
})

describe('actionHiddenInputsFrom', () => {
  it('maps visitorEmail and constant names per action', () => {
    const hidden = actionHiddenInputsFrom(
      { actions: { load_history: { apiKey: 'run_history' }, generate: { apiKey: 'run' } } },
      [
        workflowBinding({
          key: 'run_history',
          inputSchema: [
            { name: 'type', type: 'string', source: 'constant', value: 'history' },
            { name: 'email', type: 'string', source: 'visitorEmail' },
          ],
        }),
        workflowBinding({
          key: 'run',
          inputSchema: [{ name: 'company', type: 'string' }],
        }),
      ]
    )
    expect(hidden.load_history).toEqual(['type', 'email'])
    expect(hidden.generate).toBeUndefined()
  })
})

describe('hostStateRoot', () => {
  it('returns empty for a non-string or item-scoped path', () => {
    expect(hostStateRoot('articles[].title')).toBe('articles')
    expect(hostStateRoot('item.keyword')).toBe('')
    expect(hostStateRoot(undefined as unknown as string)).toBe('')
  })
})

describe('isBoundPathPending', () => {
  const actionHostKeys = {
    load_list: ['articles', 'items'],
    load_stats: ['count'],
  }

  it('skeletons only the path the in-flight action writes', () => {
    const pending = new Set(['load_list'])
    expect(isBoundPathPending('articles', pending, actionHostKeys)).toBe(true)
    expect(isBoundPathPending('count', pending, actionHostKeys)).toBe(false)
  })

  it('falls back to any in-flight action for an unknown path', () => {
    expect(isBoundPathPending('mystery', new Set(['load_list']), actionHostKeys)).toBe(true)
    expect(isBoundPathPending('mystery', new Set(), actionHostKeys)).toBe(false)
  })
})

describe('isActionControlPending', () => {
  it('uses pendingActionIds when the host supplies them', () => {
    expect(isActionControlPending('run', new Set(['run']), false)).toBe(true)
    expect(isActionControlPending('run', new Set(['other']), true)).toBe(false)
  })

  it('falls back to the page pending flag for tests', () => {
    expect(isActionControlPending('run', undefined, true)).toBe(true)
    expect(isActionControlPending('run', undefined, false)).toBe(false)
    expect(isActionControlPending('', undefined, true)).toBe(false)
  })
})
