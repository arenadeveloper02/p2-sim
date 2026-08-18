/**
 * @vitest-environment node
 */

import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import {
  actionStateFromData,
  displayTextFromActionData,
  navigationHref,
  omitActionTelemetry,
  pageOnLoadFrom,
  pageParamsFromQuery,
  parseJsonLiteral,
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
