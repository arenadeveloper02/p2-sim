/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  OUTPUT_HINT_MAX_LENGTH,
  outputLayoutFromSample,
  outputSchemaFromSample,
  outputSchemaWarning,
  syntheticExampleFromOutputSchema,
} from '@/lib/arena-generative-ui/output-schema'

describe('outputSchemaFromSample', () => {
  it('returns nothing for a blank sample', () => {
    expect(outputSchemaFromSample('')).toEqual([])
    expect(outputSchemaFromSample('   \n ')).toEqual([])
  })

  it('throws a field-specific message for unparseable JSON', () => {
    expect(() => outputSchemaFromSample('{not json')).toThrow('Output format must be valid JSON')
  })

  it('names top-level object keys with their types', () => {
    expect(
      outputSchemaFromSample('{"summary":"hello","count":3,"cached":false,"missing":null}')
    ).toEqual([
      { name: 'summary', type: 'string' },
      { name: 'count', type: 'number' },
      { name: 'cached', type: 'boolean' },
      { name: 'missing', type: 'string' },
    ])
  })

  it('describes an array of objects from its first element', () => {
    expect(
      outputSchemaFromSample(
        '{"articles":[{"title":"First","score":9},{"title":"Second","score":4}],"count":2}'
      )
    ).toEqual([
      { name: 'articles', type: 'array' },
      { name: 'articles[].title', type: 'string' },
      { name: 'articles[].score', type: 'number' },
      { name: 'count', type: 'number' },
    ])
  })

  it('records the element type for an array of scalars', () => {
    expect(outputSchemaFromSample('{"tags":["ai","news"]}')).toEqual([
      { name: 'tags', type: 'array' },
      { name: 'tags[]', type: 'string' },
    ])
  })

  it('marks an empty array as an array with no element entry', () => {
    expect(outputSchemaFromSample('{"articles":[]}')).toEqual([{ name: 'articles', type: 'array' }])
  })

  it('walks nested objects with dotted paths', () => {
    expect(outputSchemaFromSample('{"meta":{"total":12,"page":{"index":1}}}')).toEqual([
      { name: 'meta', type: 'object' },
      { name: 'meta.total', type: 'number' },
      { name: 'meta.page', type: 'object' },
      { name: 'meta.page.index', type: 'number' },
    ])
  })

  it('stops descending past three object levels', () => {
    const fields = outputSchemaFromSample('{"a":{"b":{"c":{"d":{"e":1}}}}}')
    expect(fields.map((field) => field.name)).toEqual(['a', 'a.b', 'a.b.c'])
  })

  it('roots an array response under result, matching host state', () => {
    expect(outputSchemaFromSample('[{"title":"First"}]')).toEqual([
      { name: 'result', type: 'array' },
      { name: 'result[].title', type: 'string' },
    ])
  })

  it('roots a plain-value response under result', () => {
    expect(outputSchemaFromSample('"just text"')).toEqual([{ name: 'result', type: 'string' }])
    expect(outputSchemaFromSample('42')).toEqual([{ name: 'result', type: 'number' }])
  })

  it('caps the derived list at 40 fields', () => {
    const sample = JSON.stringify(
      Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`field${index}`, 'value']))
    )
    expect(outputSchemaFromSample(sample)).toHaveLength(40)
  })

  it('keeps only names and types, never sample values', () => {
    const fields = outputSchemaFromSample('{"email":"ada@example.com","note":"confidential"}')
    expect(JSON.stringify(fields)).not.toContain('ada@example.com')
    expect(JSON.stringify(fields)).not.toContain('confidential')
  })
})

describe('outputLayoutFromSample', () => {
  it('returns nothing for a blank sample', () => {
    expect(outputLayoutFromSample('')).toEqual({})
    expect(outputLayoutFromSample('   ', { stream: true })).toEqual({})
  })

  it('derives outputSchema from JSON in stream mode', () => {
    expect(outputLayoutFromSample('{"companies":[]}', { stream: true })).toEqual({
      outputSchema: [{ name: 'companies', type: 'array' }],
    })
  })

  it('stores truncated prose as outputHint when streaming', () => {
    expect(outputLayoutFromSample('# Hello', { stream: true })).toEqual({
      outputHint: '# Hello',
    })
    const long = 'x'.repeat(OUTPUT_HINT_MAX_LENGTH + 50)
    const layout = outputLayoutFromSample(long, { stream: true })
    expect(layout.outputSchema).toBeUndefined()
    expect(layout.outputHint?.startsWith('x')).toBe(true)
    expect(layout.outputHint?.length).toBe(OUTPUT_HINT_MAX_LENGTH + 3)
  })

  it('still requires JSON when not streaming', () => {
    expect(() => outputLayoutFromSample('# Hello')).toThrow('Output format must be valid JSON')
  })
})

describe('outputSchemaWarning', () => {
  it('returns nothing when every top-level name is present', () => {
    expect(
      outputSchemaWarning([{ name: 'articles' }, { name: 'articles[].title' }, { name: 'count' }], {
        articles: [],
        count: 0,
      })
    ).toBeUndefined()
  })

  it('names missing top-level fields without failing nested children separately', () => {
    expect(
      outputSchemaWarning([{ name: 'articles' }, { name: 'articles[].title' }, { name: 'count' }], {
        score: 1,
      })
    ).toBe('Response is missing outputSchema fields: articles, count')
  })
})

describe('syntheticExampleFromOutputSchema', () => {
  it('builds fake values from types without copying sample PII', () => {
    expect(
      syntheticExampleFromOutputSchema([
        { name: 'score', type: 'number' },
        { name: 'articles', type: 'array' },
        { name: 'articles[].title', type: 'string' },
        { name: 'ok', type: 'boolean' },
      ])
    ).toEqual({
      score: 72,
      articles: [{ title: 'Example', id: 'ex-1' }],
      ok: true,
    })
  })

  it('returns nothing for an empty schema', () => {
    expect(syntheticExampleFromOutputSchema(undefined)).toBeUndefined()
    expect(syntheticExampleFromOutputSchema([])).toBeUndefined()
  })
})
