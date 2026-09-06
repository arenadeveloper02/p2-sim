/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT,
  formatBindingsForUserInputWand,
} from '@/lib/arena-generative-ui/user-input-wand-prompt'

describe('ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT', () => {
  it('injects current brief and binding slots and teaches expand vs repair', () => {
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('{context}')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('{bindings}')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('EXPAND')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('REPAIR')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('Do not invent API keys')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('one collection page')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('Workspace page')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('selectItem true')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).toContain('no onLoad of that generate CTA')
    expect(ARENA_GENERATIVE_UI_USER_INPUT_WAND_PROMPT).not.toContain('AVAILABLE COMPONENTS')
  })
})

describe('formatBindingsForUserInputWand', () => {
  it('tells the wand not to invent keys when bindings are empty', () => {
    expect(formatBindingsForUserInputWand('')).toContain('none')
    expect(formatBindingsForUserInputWand('[]')).toContain('Do not invent')
  })

  it('lists keys, stream, form fields, and output names without URLs', () => {
    const summary = formatBindingsForUserInputWand([
      {
        key: 'recommend_articles',
        label: 'Generate',
        kind: 'http',
        stream: true,
        http: { method: 'POST', url: 'https://example.internal/secret' },
        inputSchema: [
          { name: 'targetKeyword', type: 'string' },
          { name: 'userEmail', type: 'string', source: 'visitorEmail' },
        ],
        outputSchema: [{ name: 'content', type: 'string' }],
        outputHint: '# Title',
      },
    ])

    expect(summary).toContain('recommend_articles')
    expect(summary).toContain('stream')
    expect(summary).toContain('targetKeyword')
    expect(summary).toContain('content:string')
    expect(summary).not.toContain('userEmail')
    expect(summary).not.toContain('example.internal')
  })

  it('does not throw on invalid JSON', () => {
    expect(formatBindingsForUserInputWand('{not-json')).toContain('unparsed')
  })
})
