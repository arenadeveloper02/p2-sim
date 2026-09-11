/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildArenaGenerativeUiPrompt,
  isArenaGenerativeCatalogType,
  resolveCatalogComponentNames,
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
      'Calendar',
      'Timeline',
      'Map',
      'Tree',
      'Carousel',
      'SubmitButton',
      'Tabs',
      'PageHeader',
      'AppHeader',
      'SearchField',
      'Chip',
      'Disclosure',
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

  it('names creating and editing overlay flags on Button and Modal', () => {
    expect(prompt).toContain('creating=true')
    expect(prompt).toContain('editing=true')
    expect(prompt).toContain('do not reuse creating for edit')
  })

  it('teaches the same-page History Open swap', () => {
    expect(prompt).toContain('!selectedId')
    expect(prompt).toContain('clearItem')
    expect(prompt).toContain('form field names')
    expect(prompt).not.toContain('scalar fields under inputs')
  })

  it('teaches both same-page and cross-page History patterns', () => {
    expect(prompt).toContain('Same-page History')
    expect(prompt).toContain('Cross-page History')
    expect(prompt).toContain('never use `!selectedId` on the list')
    expect(prompt).toContain('distinct manifest page path')
  })

  it('keeps Workspace and Drawer collections visible on select', () => {
    expect(prompt).toContain('Workspace and Drawer keep the collection visible')
    expect(prompt).toContain('do not hide navigator or primary')
  })

  it('tells the spec the host pages Table and Repeat when there is no pagination API', () => {
    expect(prompt).toContain('the host pages long tables locally')
    expect(prompt).toContain('the host pages long lists locally')
    expect(prompt).toContain('do not emit a Load more Button')
  })

  it('teaches host-owned Disclosure expand chrome', () => {
    expect(prompt).toContain('The host paints the chevron')
    expect(prompt).toContain('do not use Button.selectItem to expand')
  })

  it('teaches host number formats and Copy Markdown / Download PDF', () => {
    expect(prompt).toContain('{item.price|currency}')
    expect(prompt).toContain('copyContent')
    expect(prompt).toContain('downloadPdf')
    expect(prompt).toContain('Copy Markdown')
  })
})

describe('isArenaGenerativeCatalogType', () => {
  it('treats Chat, Workspace, and Stepper as catalog types', () => {
    expect(isArenaGenerativeCatalogType('Chat')).toBe(true)
    expect(isArenaGenerativeCatalogType('Workspace')).toBe(true)
    expect(isArenaGenerativeCatalogType('Stepper')).toBe(true)
    expect(isArenaGenerativeCatalogType('Disclosure')).toBe(true)
    expect(isArenaGenerativeCatalogType('Calendar')).toBe(true)
    expect(isArenaGenerativeCatalogType('Timeline')).toBe(true)
    expect(isArenaGenerativeCatalogType('Map')).toBe(true)
    expect(isArenaGenerativeCatalogType('Tree')).toBe(true)
    expect(isArenaGenerativeCatalogType('Carousel')).toBe(true)
    expect(isArenaGenerativeCatalogType('UnknownWidget')).toBe(false)
  })
})

describe('resolveCatalogComponentNames', () => {
  it('omits wait, workspace, dashboard, and chat families for a micro collection', () => {
    const names = new Set(
      resolveCatalogComponentNames({
        archetype: 'collection',
        pageArchetypes: ['collection'],
      })
    )
    expect(names.has('Repeat')).toBe(true)
    expect(names.has('Calendar')).toBe(true)
    expect(names.has('Timeline')).toBe(true)
    expect(names.has('Map')).toBe(true)
    expect(names.has('Tree')).toBe(true)
    expect(names.has('Carousel')).toBe(true)
    expect(names.has('Form')).toBe(true)
    expect(names.has('WorkingCard')).toBe(false)
    expect(names.has('Workspace')).toBe(false)
    expect(names.has('Chart')).toBe(false)
    expect(names.has('Chat')).toBe(false)
    expect(names.has('Stepper')).toBe(false)
  })

  it('includes wait and tabs when the blueprint needs them', () => {
    const names = new Set(
      resolveCatalogComponentNames({
        archetype: 'task',
        pageArchetypes: ['task', 'results'],
        needsForms: true,
        needsWait: true,
        shellNavigation: 'tabs',
      })
    )
    expect(names.has('WorkingCard')).toBe(true)
    expect(names.has('SearchField')).toBe(true)
    expect(names.has('Tabs')).toBe(true)
    expect(names.has('Workspace')).toBe(false)
  })

  it('filters AVAILABLE COMPONENTS when includeComponents is set', () => {
    const trimmed = buildArenaGenerativeUiPrompt({
      customRules: ['ONLY RULE'],
      includeComponents: ['Page', 'Section', 'Button'],
    })
    expect(trimmed).toContain('AVAILABLE COMPONENTS (3):')
    expect(trimmed).toContain('- Page: {')
    expect(trimmed).toContain('- Button: {')
    expect(trimmed).not.toContain('- WorkingCard: {')
    expect(trimmed).not.toContain('- Chat: {')
  })
})
