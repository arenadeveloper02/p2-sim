/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  namedSchemaFields,
  OUTPUT_HINT_MAX_LENGTH,
  outputLayoutFromSample,
  outputSchemaFromSample,
  outputSchemaRootName,
  outputSchemaWarning,
  prefixOutputSchemaFields,
  syntheticExampleFromOutputSchema,
} from '@/lib/arena-generative-ui/output-schema'

describe('namedSchemaFields', () => {
  it('drops entries without a non-empty string name', () => {
    expect(
      namedSchemaFields([
        { type: 'object' },
        { name: undefined, type: 'string' },
        { name: '  ', type: 'number' },
        { name: 'score', type: 'number' },
      ])
    ).toEqual([{ name: 'score', type: 'number' }])
  })
})

describe('outputSchemaRootName', () => {
  it('returns empty for a non-string path instead of throwing', () => {
    expect(outputSchemaRootName('articles[].title')).toBe('articles')
    expect(outputSchemaRootName('meta.total')).toBe('meta')
    expect(outputSchemaRootName(undefined as unknown as string)).toBe('')
  })
})

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

  it('still records an array that sits past the object-depth cap', () => {
    expect(
      outputSchemaFromSample('{"a":{"b":{"c":{"d":{"history":[{"id":"1"}]}}}}}')
        .map((field) => field.name)
        .includes('a.b.c.d.history')
    ).toBe(true)
  })

  it('strips ok/data wrappers so a network-tab paste reaches nested history', () => {
    const sample = JSON.stringify({
      ok: true,
      data: {
        data: {
          run_data: {
            history: [
              {
                id: 'h1',
                email: 'ada@example.com',
                input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
                output: '',
                createdAt: '2026-08-24T06:28:56.717Z',
              },
            ],
          },
        },
      },
    })
    const names = outputSchemaFromSample(sample).map((field) => field.name)
    expect(names).not.toContain('ok')
    expect(names).toEqual(
      expect.arrayContaining([
        'run_data',
        'run_data.history',
        'run_data.history[].id',
        'run_data.history[].input',
        'run_data.history[].input.keyword',
        'run_data.history[].createdAt',
      ])
    )
  })

  it('strips a singleton output object so last-run fields start at the body', () => {
    const names = outputSchemaFromSample(
      JSON.stringify({
        output: {
          gap_analysis: { coverage_gaps: [{ id: 'g1' }] },
          enhanced_article: 'Hi',
        },
      })
    ).map((field) => field.name)
    expect(names).toEqual(
      expect.arrayContaining(['gap_analysis', 'gap_analysis.coverage_gaps', 'enhanced_article'])
    )
    expect(names).not.toContain('output')
  })

  it('keeps output when it is a string sibling of other keys', () => {
    const names = outputSchemaFromSample(
      JSON.stringify({ keyword: 'Dental', output: 'saved markdown' })
    ).map((field) => field.name)
    expect(names).toEqual(expect.arrayContaining(['keyword', 'output']))
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

  it('drops execution telemetry so the generator cannot bind Stats to it', () => {
    const names = outputSchemaFromSample(
      JSON.stringify({
        articles: [{ title: 'One' }],
        tokens: { input: 10, output: 20, total: 30 },
        cost: { input: 0.01, output: 0.02, total: 0.03 },
        providerTiming: { duration: 1200 },
        timeSegments: [{ name: 'llm', durationMs: 800 }],
      })
    ).map((field) => field.name)

    expect(names).toContain('articles')
    expect(names).toContain('articles[].title')
    expect(names).not.toContain('tokens')
    expect(names).not.toContain('tokens.input')
    expect(names).not.toContain('cost')
    expect(names).not.toContain('cost.total')
    expect(names).not.toContain('providerTiming')
    expect(names).not.toContain('timeSegments')
  })
})

describe('prefixOutputSchemaFields', () => {
  it('nests object fields under a Response wrapper key', () => {
    expect(
      prefixOutputSchemaFields(
        [
          { name: 'history', type: 'array' },
          { name: 'history[].keyword', type: 'string' },
        ],
        'run_data'
      )
    ).toEqual([
      { name: 'run_data.history', type: 'array' },
      { name: 'run_data.history[].keyword', type: 'string' },
    ])
  })

  it('rewrites a result-rooted array sample onto the field name', () => {
    expect(
      prefixOutputSchemaFields(
        [
          { name: 'result', type: 'array' },
          { name: 'result[].keyword', type: 'string' },
        ],
        'history'
      )
    ).toEqual([
      { name: 'history', type: 'array' },
      { name: 'history[].keyword', type: 'string' },
    ])
  })

  it('drops nameless rows instead of throwing', () => {
    expect(
      prefixOutputSchemaFields(
        [
          { type: 'object' } as { name: string; type: string },
          { name: undefined as unknown as string, type: 'string' },
          { name: 'score', type: 'number' },
        ],
        'run_data'
      )
    ).toEqual([{ name: 'run_data.score', type: 'number' }])
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

  it('treats a lifted nested collection as satisfying a dotted outputSchema path', () => {
    expect(
      outputSchemaWarning(
        [
          { name: 'data' },
          { name: 'data.run_data.history' },
          { name: 'data.run_data.history[].id' },
        ],
        { history: [], run_data: { history: [] } }
      )
    ).toBeUndefined()
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

  it('nests run_data.history so the generator can bind the collection', () => {
    expect(
      syntheticExampleFromOutputSchema([
        { name: 'run_data', type: 'object' },
        { name: 'run_data.history', type: 'array' },
        { name: 'run_data.history[].keyword', type: 'string' },
        { name: 'run_data.history[].client', type: 'string' },
      ])
    ).toEqual({
      run_data: {
        history: [{ title: 'Example', id: 'ex-1', keyword: 'example', client: 'example' }],
      },
    })
  })

  it('returns nothing for an empty schema', () => {
    expect(syntheticExampleFromOutputSchema(undefined)).toBeUndefined()
    expect(syntheticExampleFromOutputSchema([])).toBeUndefined()
  })

  it('ignores nameless rows instead of throwing', () => {
    expect(
      syntheticExampleFromOutputSchema([
        { type: 'object' } as { name: string; type: string },
        { name: 'score', type: 'number' },
      ])
    ).toEqual({ score: 72 })
  })
})
