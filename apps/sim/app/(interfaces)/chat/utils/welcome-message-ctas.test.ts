/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseWelcomeSegments } from '@/app/(interfaces)/chat/utils/welcome-message-ctas'

describe('parseWelcomeSegments', () => {
  it('returns plain text as a single text segment', () => {
    expect(parseWelcomeSegments('Hello there')).toEqual([{ type: 'text', value: 'Hello there' }])
  })

  it('parses a single {{query}} CTA', () => {
    expect(parseWelcomeSegments('Try {{summarize this}} next')).toEqual([
      { type: 'text', value: 'Try ' },
      { type: 'query', value: 'summarize this', raw: '{{summarize this}}' },
      { type: 'text', value: ' next' },
    ])
  })

  it('parses multiple {{query}} CTAs', () => {
    expect(parseWelcomeSegments('{{one}} and {{two}}')).toEqual([
      { type: 'query', value: 'one', raw: '{{one}}' },
      { type: 'text', value: ' and ' },
      { type: 'query', value: 'two', raw: '{{two}}' },
    ])
  })

  it('keeps empty {{}} as text', () => {
    expect(parseWelcomeSegments('before {{}} after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'text', value: '{{}}' },
      { type: 'text', value: ' after' },
    ])
  })

  it('keeps whitespace-only braces as text', () => {
    expect(parseWelcomeSegments('{{   }}')).toEqual([{ type: 'text', value: '{{   }}' }])
  })

  it('trims whitespace inside braces for query value', () => {
    expect(parseWelcomeSegments('{{  draft an email  }}')).toEqual([
      { type: 'query', value: 'draft an email', raw: '{{  draft an email  }}' },
    ])
  })

  it('supports multiline content inside braces', () => {
    expect(parseWelcomeSegments('Start {{line one\nline two}} end')).toEqual([
      { type: 'text', value: 'Start ' },
      { type: 'query', value: 'line one\nline two', raw: '{{line one\nline two}}' },
      { type: 'text', value: ' end' },
    ])
  })

  it('returns an empty array for empty content', () => {
    expect(parseWelcomeSegments('')).toEqual([])
  })
})
