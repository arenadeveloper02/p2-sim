import { describe, expect, it, vi } from 'vitest'
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

  it('round-trips outputHint on a streaming binding', () => {
    expect(
      parseApiBindings([
        {
          key: 'summarize',
          kind: 'workflow',
          workflowId: 'wf-1',
          stream: true,
          outputHint: '# Company analysis',
        },
      ])
    ).toEqual([
      {
        key: 'summarize',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'summarize',
        stream: true,
        outputHint: '# Company analysis',
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

  /**
   * The parser rebuilds each binding from an allowlist, so a field it does not read
   * is silently dropped on every save. These pin the new flag against that.
   */
  it('keeps forwardEmailId: true through the allowlist rebuild', () => {
    expect(
      parseApiBindings([
        {
          key: 'crm_lookup',
          kind: 'http',
          http: { method: 'POST', url: 'https://api.example.com/lookup' },
          forwardEmailId: true,
        },
      ])[0]
    ).toMatchObject({ key: 'crm_lookup', forwardEmailId: true })
  })

  it('omits forwardEmailId unless it is exactly true', () => {
    for (const value of [false, undefined, 'true', 1]) {
      const [binding] = parseApiBindings([
        {
          key: 'crm_lookup',
          kind: 'http',
          http: { method: 'POST', url: 'https://api.example.com/lookup' },
          forwardEmailId: value,
        },
      ])
      expect(binding.forwardEmailId).toBeUndefined()
    }
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

  it('round-trips a sample-sourced outputSchema', () => {
    expect(
      parseApiBindings(
        '[{"key":"run_history","kind":"workflow","workflowId":"wf-1","outputSchema":[{"name":"run_data.history","type":"array"}],"outputSchemaSource":"sample","outputSample":"{\\"history\\":[]}"}]'
      )
    ).toEqual([
      {
        key: 'run_history',
        kind: 'workflow',
        workflowId: 'wf-1',
        label: 'run_history',
        outputSchema: [{ name: 'run_data.history', type: 'array' }],
        outputSchemaSource: 'sample',
        outputSample: '{"history":[]}',
      },
    ])
  })

  it('drops outputSchemaSource when it is not sample or there is no outputSchema', () => {
    const [withoutSchema] = parseApiBindings([
      { key: 'run', kind: 'workflow', workflowId: 'wf-1', outputSchemaSource: 'sample' },
    ])
    const [notSample] = parseApiBindings([
      {
        key: 'run',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [{ name: 'score', type: 'number' }],
        outputSchemaSource: 'workflow',
      },
    ])
    expect(withoutSchema.outputSchemaSource).toBeUndefined()
    expect(notSample.outputSchemaSource).toBeUndefined()
  })

  it('round-trips last-run outputSchemaWarnings', () => {
    const [binding] = parseApiBindings([
      {
        key: 'run_history',
        kind: 'workflow',
        workflowId: 'wf-1',
        outputSchema: [{ name: 'run_data.history', type: 'array' }],
        outputSchemaWarnings: ['Schema is from a run of an older deployment.'],
      },
    ])
    expect(binding.outputSchemaWarnings).toEqual(['Schema is from a run of an older deployment.'])
  })

  it('keeps input as a constant prefix and drops other protocol fields from inputSchema', () => {
    const [binding] = parseApiBindings([
      {
        key: 'recommend_articles',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'input', type: 'string', source: 'constant', value: 'Do research on ' },
          { name: 'conversationId', type: 'string' },
          { name: 'files', type: 'array' },
          { name: 'stream', type: 'boolean' },
          { name: 'includeThinking', type: 'boolean' },
          { name: 'includeToolCalls', type: 'boolean' },
          { name: 'attachments', type: 'file[]' },
          { name: 'keyword', type: 'string' },
        ],
      },
    ])
    expect(binding.inputSchema).toEqual([
      { name: 'input', type: 'string', source: 'constant', value: 'Do research on ' },
      { name: 'keyword', type: 'string' },
    ])
  })

  it('round-trips chatProtocol on workflow bindings only', () => {
    const [workflow] = parseApiBindings([
      {
        key: 'chat',
        kind: 'workflow',
        workflowId: 'wf-1',
        chatProtocol: { input: true, conversationId: true, files: true, extra: true },
      },
    ])
    expect(workflow.chatProtocol).toEqual({
      input: true,
      conversationId: true,
      files: true,
    })
    const [http] = parseApiBindings([
      {
        key: 'lookup',
        kind: 'http',
        http: { method: 'POST', url: 'https://api.example.com/lookup' },
        chatProtocol: { input: true },
      },
    ])
    expect(http.chatProtocol).toBeUndefined()
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

  it('drops blank schema field names', () => {
    const [binding] = parseApiBindings([
      {
        key: 'lookup',
        kind: 'http',
        http: { method: 'POST', url: 'https://api.example.com/lookup' },
        outputSchema: [{ name: '  ' }, { name: 'score', type: 'number' }],
      },
    ])
    expect(binding.outputSchema).toEqual([{ name: 'score', type: 'number' }])
  })

  it('keeps inputSchema descriptions', () => {
    const [binding] = parseApiBindings([
      {
        key: 'qualify_lead',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'company', type: 'string', description: 'Legal name of the account' },
        ],
      },
    ])
    expect(binding.inputSchema).toEqual([
      { name: 'company', type: 'string', description: 'Legal name of the account' },
    ])
  })

  it('round-trips inputSchema source and constant value', () => {
    const [binding] = parseApiBindings([
      {
        key: 'run_history',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'type', type: 'string', source: 'constant', value: 'history' },
          { name: 'email', type: 'string', source: 'visitorEmail' },
        ],
      },
    ])
    expect(binding.inputSchema).toEqual([
      { name: 'type', type: 'string', source: 'constant', value: 'history' },
      { name: 'email', type: 'string', source: 'visitorEmail' },
    ])
  })

  it('drops form source and constant value on non-constant fields', () => {
    const [binding] = parseApiBindings([
      {
        key: 'run_history',
        kind: 'workflow',
        workflowId: 'wf-1',
        inputSchema: [
          { name: 'type', type: 'string', source: 'form', value: 'ignored' },
          { name: 'email', type: 'string', source: 'visitorEmail', value: 'ignored' },
        ],
      },
    ])
    expect(binding.inputSchema).toEqual([
      { name: 'type', type: 'string' },
      { name: 'email', type: 'string', source: 'visitorEmail' },
    ])
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

  it('treats null screenshots as omitted so an empty file-upload field can generate', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      userInput: 'Article Enhancer Agent with Generator and History.',
      screenshots: null,
      pages: null,
      apiBindings: [
        {
          key: 'enhance_article',
          kind: 'workflow',
          workflowId: '0f016c1a-c322-4d74-b72c-6785c13fd918',
          inputSchema: null,
          outputSchema: null,
          outputSchemaWarnings: null,
        },
      ],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.screenshots).toBeUndefined()
      expect(parsed.data.pages).toBeUndefined()
      expect(parsed.data.apiBindings).toEqual([
        {
          key: 'enhance_article',
          kind: 'workflow',
          workflowId: '0f016c1a-c322-4d74-b72c-6785c13fd918',
        },
      ])
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

  it('accepts screenshots without userInput', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({
      screenshots: [{ name: 'home.png', key: 'uploads/home.png', size: 24 }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects generate with neither userInput nor screenshots', () => {
    const parsed = arenaGenerativeGenerateBodySchema.safeParse({})
    expect(parsed.success).toBe(false)
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

  it('recovers a reply that ends in one stray brace', () => {
    const parsed = parseLlmJsonObject(
      '{"title":"People","manifest":{"entryPath":"home","pages":{"home":{"path":"home"}},"actions":{}}}}'
    )
    expect(parsed.manifest).toMatchObject({ entryPath: 'home' })
  })

  /**
   * The app runs on Bun, whose JavaScriptCore `JSON.parse` reports only
   * `Unable to parse JSON string` with no offset, unlike V8's `position N`.
   * Trailing-garbage recovery must not read the offset off the error message.
   */
  it('recovers trailing garbage on an engine whose parse error carries no position', () => {
    const nativeParse = JSON.parse
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(((
      text: string,
      reviver?: Parameters<typeof JSON.parse>[1]
    ) => {
      try {
        return nativeParse(text, reviver)
      } catch {
        throw new SyntaxError('JSON Parse error: Unable to parse JSON string')
      }
    }) as typeof JSON.parse)

    try {
      const parsed = parseLlmJsonObject(
        '{"entryPath":"home","pages":{"home":{"path":"home","title":"People"}},"actions":{}}}'
      )
      expect(parsed.entryPath).toBe('home')
      expect(parsed.pages).toEqual({ home: { path: 'home', title: 'People' } })
    } finally {
      parseSpy.mockRestore()
    }
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

  it('recovers wrapper-level actions when nested manifest already has pages', () => {
    const candidate = extractManifestCandidate({
      title: 'Company research',
      content: 'ok',
      manifest: {
        entryPath: 'home',
        pages: { home: { path: 'home', title: 'Search' } },
      },
      actions: {
        company_search: { apiKey: 'search_companies', onSuccess: { navigate: 'results' } },
      },
    })
    expect(candidate.pages).toEqual({ home: { path: 'home', title: 'Search' } })
    expect(candidate.actions).toEqual({
      company_search: { apiKey: 'search_companies', onSuccess: { navigate: 'results' } },
    })
  })

  it('keeps nested actions and fills missing keys from the wrapper', () => {
    const candidate = extractManifestCandidate({
      title: 'Company research',
      manifest: {
        pages: { home: { path: 'home', title: 'Search' } },
        actions: {
          search_companies: { apiKey: 'search_companies' },
        },
      },
      actions: {
        company_search: { apiKey: 'search_companies' },
        search_companies: { apiKey: 'wrapper_should_lose' },
      },
    })
    expect(candidate.actions).toEqual({
      company_search: { apiKey: 'search_companies' },
      search_companies: { apiKey: 'search_companies' },
    })
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
