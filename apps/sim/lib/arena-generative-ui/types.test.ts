/**
 * @vitest-environment node
 */

import type { Spec } from '@json-render/core'
import { describe, expect, it, vi } from 'vitest'
import {
  actionStateFromData,
  clearedSelectedItemHostState,
  displayTextFromActionData,
  interpolateBindingTemplate,
  interpolateItemTemplate,
  interpolateRepeatProps,
  MAX_REPEAT_ITEMS,
  navigationHref,
  omitActionTelemetry,
  pageOnLoadFrom,
  pageParamsFromQuery,
  parseJsonLiteral,
  readScopedStatePath,
  repeatItemActionValues,
  repeatItemKey,
  scrollGenerativeAppToTop,
  selectedItemHostState,
  specHasSamePageSelectItem,
  submittedInputsState,
  unwrapResponseBlockEnvelope,
} from '@/lib/arena-generative-ui/types'

const ENVELOPE = {
  companies: [{ id: '1441', industry: 'Software Development' }],
  assistantContent: '{"companies":[{"id":"1441","industry":"Software Development"}]}',
  query: 'Google LLC',
  model: 'gpt-5.4-mini',
  tokens: { input: 2277, output: 328, total: 2605 },
  providerTiming: { startTime: '2026-08-18T10:36:27.714Z' },
  finishReason: 'stop',
}

describe('displayTextFromActionData', () => {
  it('prefers nested output.content', () => {
    expect(displayTextFromActionData({ output: { content: 'Hello' } })).toBe('Hello')
  })

  it('parses assistantContent JSON and drops telemetry', () => {
    const text = displayTextFromActionData(ENVELOPE)
    expect(text).toContain('Software Development')
    expect(text).toContain('"id": "1441"')
    expect(text).not.toContain('finishReason')
    expect(text).not.toContain('gpt-5.4-mini')
    expect(text).not.toContain('providerTiming')
    expect(text).not.toContain('2277')
  })

  it('returns plain prose unchanged', () => {
    expect(displayTextFromActionData('## Summary')).toBe('## Summary')
  })
})

describe('actionStateFromData', () => {
  it('keeps business keys and strips telemetry', () => {
    expect(omitActionTelemetry(ENVELOPE)).toEqual({
      companies: ENVELOPE.companies,
      assistantContent: ENVELOPE.assistantContent,
    })
    expect(actionStateFromData(ENVELOPE)).toMatchObject({
      companies: ENVELOPE.companies,
    })
    expect(actionStateFromData(ENVELOPE)).not.toHaveProperty('tokens')
    expect(actionStateFromData(['a'])).toEqual({ result: ['a'] })
  })

  it('unwraps a Response-block envelope so body keys land at the top level', () => {
    const envelope = {
      data: { articles: [{ title: 'One' }], count: 1 },
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
    expect(unwrapResponseBlockEnvelope(envelope)).toEqual(envelope.data)
    expect(actionStateFromData(envelope)).toEqual({
      articles: [{ title: 'One' }],
      count: 1,
    })
    expect(displayTextFromActionData(envelope)).toContain('"title": "One"')
    expect(displayTextFromActionData(envelope)).not.toContain('"status"')
  })

  it('leaves a business payload with data and status among other keys alone', () => {
    const payload = { data: { nested: true }, status: 'ok', articles: [] }
    expect(unwrapResponseBlockEnvelope(payload)).toEqual(payload)
    expect(actionStateFromData(payload)).toEqual(payload)
  })

  it('unwraps a data-only Response body and lifts run_data.history for Repeat', () => {
    const history = [
      {
        id: 'a68abc9b-1a46-4abf-9243-e71ad69f98db',
        email: 'vijaykumar.lonarmath@position2.com',
        input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
        output: '',
        createdAt: '2026-08-24T06:28:56.717Z',
      },
    ]
    const payload = { data: { run_data: { history } } }
    expect(unwrapResponseBlockEnvelope(payload)).toEqual({ run_data: { history } })
    const state = actionStateFromData(payload)
    expect(state.history).toEqual([
      expect.objectContaining({
        keyword: 'Dental Implants',
        client: 'Gentle Dental',
        date: '2026-08-24T06:28:56.717Z',
      }),
    ])
    expect(state.items).toBe(state.history)
    expect(state.run_data).toEqual({ history })
  })

  it('lifts items out of Agent assistantContent JSON so History Repeat can bind', () => {
    const items = [{ keyword: 'Dental implants', client: '42 North', date: '2026-08-23' }]
    expect(
      actionStateFromData({
        assistantContent: JSON.stringify({ items }),
        content: JSON.stringify({ items }),
        model: 'gpt-5.4-mini',
        tokens: { input: 10, output: 20, total: 30 },
      })
    ).toMatchObject({ items })
  })

  it('lifts items out of a nested output object without overwriting top-level keys', () => {
    expect(
      actionStateFromData({
        output: { items: [{ keyword: 'Nested' }], score: 9 },
        score: 3,
      })
    ).toMatchObject({
      items: [{ keyword: 'Nested' }],
      score: 3,
      output: { items: [{ keyword: 'Nested' }], score: 9 },
    })
  })
})

describe('parseJsonLiteral', () => {
  it('parses objects and rejects prose', () => {
    expect(parseJsonLiteral('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonLiteral('hello')).toBeUndefined()
  })
})

describe('pageParamsFromQuery', () => {
  it('keeps page params and drops the host-owned emailId', () => {
    expect(pageParamsFromQuery({ id: 'ord_1', tab: 'items', emailId: 'a@b.com' })).toEqual({
      id: 'ord_1',
      tab: 'items',
    })
  })

  it('takes the first value of a repeated param and skips empty ones', () => {
    expect(pageParamsFromQuery({ id: ['first', 'second'], q: '', missing: undefined })).toEqual({
      id: 'first',
    })
  })
})

describe('navigationHref', () => {
  it('keeps the target query params and adds emailId alongside them', () => {
    expect(navigationHref('/gui-apps/ops', 'order?id=ord_9', 'a@b.com')).toBe(
      '/gui-apps/ops/order?id=ord_9&emailId=a%40b.com'
    )
  })

  it('adds no query string when there is nothing to carry', () => {
    expect(navigationHref('/gui-apps/ops', 'home')).toBe('/gui-apps/ops/home')
  })

  it('adds emailId on its own for a bare target', () => {
    expect(navigationHref('/gui-apps/ops', 'home', 'a@b.com')).toBe(
      '/gui-apps/ops/home?emailId=a%40b.com'
    )
  })
})

describe('pageOnLoadFrom', () => {
  const spec = { root: 'page', elements: {} } as Spec

  it('indexes onLoad by page path and omits pages without one', () => {
    expect(
      pageOnLoadFrom({
        pages: {
          home: { path: 'home', title: 'Home', spec, onLoad: ['load_metrics'] },
          report: { path: 'report', title: 'Report', spec },
          empty: { path: 'empty', title: 'Empty', spec, onLoad: [] },
        },
      })
    ).toEqual({ home: ['load_metrics'] })
  })
})

describe('Repeat item scope', () => {
  const article = { id: 'a-9', title: 'Alpha', meta: { score: 4 } }

  it('reads item paths from the current row and host paths from state', () => {
    const state = { articles: [article], count: 3 }
    const scope = { item: article, index: 2 }

    expect(readScopedStatePath(state, 'item', scope)).toEqual(article)
    expect(readScopedStatePath(state, 'item.title', scope)).toBe('Alpha')
    expect(readScopedStatePath(state, 'item.meta.score', scope)).toBe(4)
    expect(readScopedStatePath(state, 'count', scope)).toBe(3)
    expect(readScopedStatePath(state, 'item.title')).toBeUndefined()
  })

  it('interpolates item fields and index into labels and navigation targets', () => {
    const scope = { item: article, index: 2 }

    expect(interpolateItemTemplate('order?id={item.id}', scope)).toBe('order?id=a-9')
    expect(interpolateItemTemplate('{item.title} ({index})', scope)).toBe('Alpha (2)')
    expect(interpolateItemTemplate('{item.meta.score}', scope)).toBe('4')
    expect(interpolateItemTemplate('static', scope)).toBe('static')
    expect(
      interpolateRepeatProps({ title: '{item.title}', statePath: 'item.title' }, scope)
    ).toEqual({ title: 'Alpha', statePath: 'item.title' })
  })

  it('leaves object placeholders empty so they cannot leak into hrefs', () => {
    expect(interpolateItemTemplate('{item}', { item: article, index: 0 })).toBe('')
  })

  it('resolves host and inputs tokens including spaced labels', () => {
    const state = { inputs: { targetKeyword: 'Dental implants', clientBrand: '42 North' } }
    const hostScope = { item: article, index: 2 }

    expect(interpolateBindingTemplate('Keyword: {targetKeyword}', { state })).toBe(
      'Keyword: Dental implants'
    )
    expect(interpolateBindingTemplate('Keyword: {Target Keyword}', { state })).toBe(
      'Keyword: Dental implants'
    )
    expect(interpolateBindingTemplate('Client: {client_brand}', { state })).toBe('Client: 42 North')
    expect(
      interpolateBindingTemplate('{item.title} for {targetKeyword}', { state, scope: hostScope })
    ).toBe('Alpha for Dental implants')
    expect(interpolateBindingTemplate('Keyword: {missing}', { state, pending: true })).toBe(
      'Keyword: '
    )
  })

  it('snapshots form values under inputs and drops reserved host keys', () => {
    expect(
      submittedInputsState({
        targetKeyword: 'Dental implants',
        content: 'should drop',
        error: 'no',
        hasMore: true,
      })
    ).toEqual({
      inputs: { targetKeyword: 'Dental implants' },
    })
  })

  it('prefers id for the React key and always prefixes the index', () => {
    expect(repeatItemKey(article, 2)).toBe('2-a-9')
    expect(repeatItemKey('plain', 4)).toBe('4')
  })

  it('sends the row fields as action input so inputMapping can use id', () => {
    expect(repeatItemActionValues(article, 2)).toEqual({ ...article, index: 2 })
    expect(repeatItemActionValues('plain', 1)).toEqual({ item: 'plain', index: 1 })
  })

  it('copies a loaded row into selected, content, and scalar inputs', () => {
    const row = {
      id: 'run_1',
      keyword: 'Dental implants',
      client: '42 North Dental',
      date: '2026-08-23',
      output: '# Full report\n\nBody.',
      nested: { skip: true },
    }
    expect(selectedItemHostState(row, 3)).toEqual({
      error: undefined,
      schemaWarning: undefined,
      selected: row,
      selectedId: 'run_1',
      content: '# Full report\n\nBody.',
      inputs: {
        id: 'run_1',
        keyword: 'Dental implants',
        client: '42 North Dental',
        date: '2026-08-23',
      },
    })
  })

  it('falls back to the row index when the item has no id and omits prose from inputs', () => {
    expect(selectedItemHostState({ output: 'Hello', body: 'no' }, 4)).toEqual({
      error: undefined,
      schemaWarning: undefined,
      selected: { output: 'Hello', body: 'no' },
      selectedId: '4',
      content: 'Hello',
    })
  })

  it('clears selected, selectedId, and copied content without touching collections', () => {
    expect(clearedSelectedItemHostState()).toEqual({
      error: undefined,
      schemaWarning: undefined,
      selected: undefined,
      selectedId: undefined,
      content: undefined,
    })
  })

  it('detects same-page selectItem when navigateTo is omitted or is this page', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['open'] },
        open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
      },
    }
    expect(specHasSamePageSelectItem(spec, 'history')).toBe(true)
    expect(
      specHasSamePageSelectItem(
        {
          root: 'page',
          elements: {
            page: { type: 'Page', props: {}, children: ['open'] },
            open: {
              type: 'Button',
              props: { label: 'Open', selectItem: true, navigateTo: 'history' },
              children: [],
            },
          },
        },
        'history'
      )
    ).toBe(true)
    expect(
      specHasSamePageSelectItem(
        {
          root: 'page',
          elements: {
            page: { type: 'Page', props: {}, children: ['open'] },
            open: {
              type: 'Button',
              props: { label: 'Open', selectItem: true, navigateTo: 'results' },
              children: [],
            },
          },
        },
        'history'
      )
    ).toBe(false)
  })

  it('caps Repeat at a page-safe number of items', () => {
    expect(MAX_REPEAT_ITEMS).toBe(48)
  })

  it('scrolls the window to the top after Open or Back', () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('window', { scrollTo })
    scrollGenerativeAppToTop()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    vi.unstubAllGlobals()
  })
})
