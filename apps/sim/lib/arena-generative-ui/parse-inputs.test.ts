import { describe, expect, it } from 'vitest'
import { arenaGenerativeGenerateBodySchema } from '@/lib/api/contracts/arena-generative-apps'
import {
  extractManifestCandidate,
  parseApiBindings,
  parseLlmJsonObject,
  parsePageHints,
} from '@/lib/arena-generative-ui/parse-inputs'

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
      parseApiBindings('[{"key":"qualify_lead","kind":"workflow","workflowId":"wf-1"}] ### next')
    ).toEqual([
      {
        key: 'qualify_lead',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'qualify_lead',
      },
    ])
  })

  it('parses stream: true on a workflow binding', () => {
    expect(
      parseApiBindings([
        {
          key: 'summarize',
          kind: 'workflow',
          workflowId: 'wf-1',
          label: 'Summarize',
          stream: true,
        },
      ])
    ).toEqual([
      {
        key: 'summarize',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'Summarize',
        stream: true,
      },
    ])
  })

  it('omits stream when it is not true', () => {
    expect(
      parseApiBindings([
        { key: 'qualify_lead', kind: 'workflow', workflowId: 'wf-1', stream: false },
      ])
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

  it('round-trips outputSchema on a hand-written workflow binding', () => {
    expect(
      parseApiBindings(
        '[{"key":"summarize","kind":"workflow","workflowId":"wf-1","outputSchema":[{"name":"articles","type":"array"},{"name":"articles[].title","type":"string"}]}]'
      )
    ).toEqual([
      {
        key: 'summarize',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'summarize',
        outputSchema: [
          { name: 'articles', type: 'array' },
          { name: 'articles[].title', type: 'string' },
        ],
      },
    ])
  })

  it('defaults a missing schema field type to string and drops nameless entries', () => {
    const [binding] = parseApiBindings([
      {
        key: 'lookup',
        kind: 'http',
        http: { method: 'POST', url: 'https://api.example.com/lookup' },
        inputSchema: [{ name: 'email' }, { type: 'string' }, 'nope'],
        outputSchema: [{ name: 'plan' }, null],
      },
    ])
    expect(binding.inputSchema).toEqual([{ name: 'email', type: 'string' }])
    expect(binding.outputSchema).toEqual([{ name: 'plan', type: 'string' }])
  })

  it('omits outputSchema when the binding does not declare one', () => {
    const [binding] = parseApiBindings([
      { key: 'qualify_lead', kind: 'workflow', workflowId: 'wf-1', outputSchema: 'articles' },
    ])
    expect(binding.outputSchema).toBeUndefined()
  })

  it('round-trips pagination on an HTTP binding', () => {
    const [binding] = parseApiBindings([
      {
        key: 'list_articles',
        kind: 'http',
        http: { method: 'GET', url: 'https://api.example.com/articles' },
        pagination: { mode: 'cursor', items: 'articles', limit: 20 },
      },
    ])
    expect(binding.pagination).toEqual({ mode: 'cursor', items: 'articles', limit: 20 })
  })

  it('rejects a nested pagination items path', () => {
    expect(() =>
      parseApiBindings([
        {
          key: 'list_articles',
          kind: 'http',
          http: { method: 'GET', url: 'https://api.example.com/articles' },
          pagination: { mode: 'cursor', items: 'data.articles' },
        },
      ])
    ).toThrow('pagination.items must be a top-level array key')
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

  it('accepts a plain-string userInput', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      userInput: 'Lead qualifier. Home is a form; Results shows the score.',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.userInput).toBe('Lead qualifier. Home is a form; Results shows the score.')
    }
  })

  it('coerces an object userInput to a JSON string', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      userInput: { brief: 'Lead qualifier with home and results.' },
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.userInput).toBe(
        JSON.stringify({ brief: 'Lead qualifier with home and results.' })
      )
    }
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

    expect(parsePageHints('[{"path":"home","title":"Form"}] extra commentary')).toEqual([
      { path: 'home', title: 'Form', purpose: undefined },
    ])
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

  it('treats pages: [] as no pages so a later complete object wins', () => {
    const parsed = parseLlmJsonObject(
      '{"title":"Team","pages":[]}\n{"entryPath":"home","pages":{"home":{"path":"home","title":"People"}},"actions":{}}'
    )
    expect(parsed.entryPath).toBe('home')
    expect(parsed.pages).toEqual({ home: { path: 'home', title: 'People' } })
  })
})

describe('extractManifestCandidate', () => {
  it('uses nested manifest when it already has pages', () => {
    const candidate = extractManifestCandidate({
      title: 'People',
      manifest: {
        entryPath: 'home',
        pages: { home: { path: 'home', title: 'People' } },
        actions: {},
      },
    })
    expect(candidate.entryPath).toBe('home')
    expect(candidate.pages).toEqual({ home: { path: 'home', title: 'People' } })
  })

  it('recovers wrapper-level pages onto a stub nested manifest', () => {
    const candidate = extractManifestCandidate({
      title: 'People',
      content: 'ok',
      manifest: { entryPath: 'home' },
      pages: { home: { path: 'home', title: 'People' } },
    })
    expect(candidate.entryPath).toBe('home')
    expect(candidate.pages).toEqual({ home: { path: 'home', title: 'People' } })
  })

  it('returns the stub nested manifest when pages are omitted', () => {
    const candidate = extractManifestCandidate({
      title: 'Team',
      content: 'ok',
      manifest: { entryPath: 'home' },
    })
    expect(candidate).toEqual({ entryPath: 'home' })
    expect(candidate.pages).toBeUndefined()
  })
})
