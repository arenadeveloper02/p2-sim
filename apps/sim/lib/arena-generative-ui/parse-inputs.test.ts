import { describe, expect, it } from 'vitest'
import { arenaGenerativeGenerateBodySchema } from '@/lib/api/contracts/arena-generative-apps'
import { parseApiBindings, parseLlmJsonObject, parsePageHints } from '@/lib/arena-generative-ui/parse-inputs'

describe('parseApiBindings', () => {
  it('treats an empty field as no bindings', () => {
    expect(parseApiBindings(undefined)).toEqual([])
    expect(parseApiBindings(null)).toEqual([])
    expect(parseApiBindings('')).toEqual([])
    expect(parseApiBindings('   ')).toEqual([])
    expect(parseApiBindings('[]')).toEqual([])
    expect(parseApiBindings([])).toEqual([])
    expect(parseApiBindings({})).toEqual([])
    expect(parseApiBindings('{}')).toEqual([])
  })

  it('parses a workflow binding array', () => {
    expect(
      parseApiBindings([
        { key: 'qualify_lead', kind: 'workflow', workflowId: 'wf-1', label: 'Qualify' },
      ])
    ).toEqual([
      {
        key: 'qualify_lead',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'Qualify',
      },
    ])
  })

  it('strips leftover text after a valid bindings array', () => {
    expect(
      parseApiBindings(
        '[{"key":"qualify_lead","kind":"workflow","workflowId":"wf-1"}] ### next'
      )
    ).toEqual([
      {
        key: 'qualify_lead',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'qualify_lead',
      },
    ])
  })

  it('rejects non-JSON bindings instead of inventing APIs', () => {
    expect(() => parseApiBindings('qualify_lead')).toThrow('apiBindings must be valid JSON')
  })
})

describe('arenaGenerativeGenerateBodySchema empty optionals', () => {
  it('accepts empty API bindings, pages, and entryPath', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      userInput: 'Team directory with home and person.',
      pages: '',
      entryPath: '',
      apiBindings: '',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.apiBindings).toBeUndefined()
      expect(parsed.data.pages).toBeUndefined()
      expect(parsed.data.entryPath).toBeUndefined()
    }
  })

  it('accepts an empty object for API bindings', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      userInput: 'Team directory with home and person.',
      apiBindings: {},
    })
    expect(parsed.success).toBe(true)
  })
})

describe('parsePageHints', () => {
  it('treats an empty field as no page hints so the model chooses pages', () => {
    expect(parsePageHints(undefined)).toEqual([])
    expect(parsePageHints('')).toEqual([])
    expect(parsePageHints('{}')).toEqual([])
    expect(parsePageHints([])).toEqual([])
    expect(parsePageHints('not json')).toEqual([])
  })

  it('strips markdown fences and leftover text after the JSON value', () => {
    expect(
      parsePageHints(`\`\`\`json
[{"path":"home","title":"People"}]
\`\`\`
### Entry Path`)
    ).toEqual([{ path: 'home', title: 'People', purpose: undefined }])

    expect(
      parsePageHints('[{"path":"home","title":"Form"}] extra commentary')
    ).toEqual([{ path: 'home', title: 'Form', purpose: undefined }])
  })

  it('accepts a trailing comma in the page list', () => {
    expect(parsePageHints('[{"path":"home","title":"People"},]')).toEqual([
      { path: 'home', title: 'People', purpose: undefined },
    ])
  })
})

describe('parseLlmJsonObject', () => {
  it('prefers a later object that contains pages over a short prefix object', () => {
    const parsed = parseLlmJsonObject(
      '{"title":"Team directory","content":"ok"}\n{"entryPath":"home","pages":{"home":{"path":"home","title":"People"}},"actions":{}}'
    )
    expect(parsed.entryPath).toBe('home')
    expect(parsed.pages).toEqual({ home: { path: 'home', title: 'People' } })
  })

  it('keeps a wrapper object that already includes manifest.pages', () => {
    const parsed = parseLlmJsonObject(
      '{"title":"People","content":"ok","manifest":{"entryPath":"home","pages":{"home":{"path":"home"}},"actions":{}}}'
    )
    expect(parsed.manifest).toMatchObject({ entryPath: 'home' })
  })
})
