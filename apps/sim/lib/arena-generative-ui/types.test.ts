/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  actionStateFromData,
  displayTextFromActionData,
  omitActionTelemetry,
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
