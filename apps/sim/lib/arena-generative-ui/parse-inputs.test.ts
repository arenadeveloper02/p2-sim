import { describe, expect, it } from 'vitest'
import { arenaGenerativeGenerateBodySchema } from '@/lib/api/contracts/arena-generative-apps'
import { parseApiBindings, parsePageHints } from '@/lib/arena-generative-ui/parse-inputs'

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
  it('treats an empty field as no page hints', () => {
    expect(parsePageHints(undefined)).toEqual([])
    expect(parsePageHints('')).toEqual([])
    expect(parsePageHints('{}')).toEqual([])
    expect(parsePageHints([])).toEqual([])
  })
})
