/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildArenaGenerativeUiPrompt,
  isArenaGenerativeCatalogType,
} from '@/lib/arena-generative-ui/catalog'

describe('buildArenaGenerativeUiPrompt', () => {
  const prompt = buildArenaGenerativeUiPrompt({ customRules: ['FIRST RULE', 'SECOND RULE'] })

  it('keeps the catalog component reference', () => {
    expect(prompt).toContain('AVAILABLE COMPONENTS')
    for (const component of [
      'Page',
      'Section',
      'Repeat',
      'Table',
      'SubmitButton',
      'Tabs',
      'PageHeader',
      'AppHeader',
      'SearchField',
      'Chip',
      'Icon',
      'Avatar',
      'EntityHeader',
      'WorkingCard',
      'ProgressBar',
      'Card',
      'Sparkline',
      'Chart',
      'EmptyState',
      'Filter',
      'Drawer',
      'Modal',
      'Toast',
      'Workspace',
      'Stepper',
      'Chat',
    ]) {
      expect(prompt).toContain(`- ${component}: {`)
    }
  })

  it('numbers the supplied rules from one and contributes none of its own', () => {
    expect(prompt).toContain('RULES:\n1. FIRST RULE\n2. SECOND RULE')
    expect(prompt.trimEnd().endsWith('2. SECOND RULE')).toBe(true)
  })

  /**
   * The library prompt's own output contract is RFC 6902 JSONL patches and its own
   * runtime dialect is `$state` / `visible` / `on` / `watch`, none of which this app
   * implements. Leaking either back in makes the generator emit patch operations.
   */
  it('drops the json-render output contract and runtime dialect', () => {
    for (const leaked of [
      '"op":"add"',
      'RFC 6902',
      'JSONL',
      '$state',
      '$bindState',
      '$bindItem',
      'on.press',
      'INITIAL STATE:',
      'AVAILABLE ACTIONS:',
      'VISIBILITY CONDITIONS:',
      'DYNAMIC PROPS:',
      'STATE WATCHERS:',
    ]) {
      expect(prompt).not.toContain(leaked)
    }
  })

  it('drops the instruction to seed sample data, which defeats loading states', () => {
    expect(prompt).not.toMatch(/sample data/i)
  })

  it('teaches the same-page History Open swap', () => {
    expect(prompt).toContain('!selectedId')
    expect(prompt).toContain('clearItem')
    expect(prompt).toContain('form field names')
    expect(prompt).not.toContain('scalar fields under inputs')
  })

  it('tells the spec the host pages Table and Repeat when there is no pagination API', () => {
    expect(prompt).toContain('the host pages long tables locally')
    expect(prompt).toContain('the host pages long lists locally')
    expect(prompt).toContain('do not emit a Load more Button')
  })
})

describe('isArenaGenerativeCatalogType', () => {
  it('treats Chat, Workspace, and Stepper as catalog types', () => {
    expect(isArenaGenerativeCatalogType('Chat')).toBe(true)
    expect(isArenaGenerativeCatalogType('Workspace')).toBe(true)
    expect(isArenaGenerativeCatalogType('Stepper')).toBe(true)
    expect(isArenaGenerativeCatalogType('UnknownWidget')).toBe(false)
  })
})
