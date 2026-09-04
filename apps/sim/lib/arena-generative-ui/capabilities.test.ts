/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  capabilityRecipePrompt,
  isCapability,
  plannedCapabilities,
  resolveCapabilities,
} from '@/lib/arena-generative-ui/capabilities'

describe('capabilityRecipePrompt', () => {
  it('is empty when no capabilities are selected', () => {
    expect(capabilityRecipePrompt([])).toBe('')
  })

  it('composes wait and product capabilities in canonical order', () => {
    const prompt = capabilityRecipePrompt(['search', 'cancellable', 'long-running'])
    expect(prompt).toContain('CAPABILITY: LONG-RUNNING')
    expect(prompt).toContain('CAPABILITY: CANCELLABLE')
    expect(prompt).toContain('CAPABILITY: SEARCH')
    expect(prompt.indexOf('LONG-RUNNING')).toBeLessThan(prompt.indexOf('CANCELLABLE'))
    expect(prompt.indexOf('CANCELLABLE')).toBeLessThan(prompt.indexOf('SEARCH'))
    expect(prompt).not.toContain('FILTER')
  })

  it('tells streaming recipes that Chat can paint content', () => {
    expect(capabilityRecipePrompt(['streaming'])).toContain(
      'Chat on the same page also paints content'
    )
  })

  it('tells pagination recipes the host pages locally without binding.pagination', () => {
    expect(capabilityRecipePrompt(['pagination'])).toContain(
      'Without binding.pagination the host pages Table and Repeat locally'
    )
  })

  it('keeps Workspace regions visible on select and still teaches History Open', () => {
    const prompt = capabilityRecipePrompt(['select'])
    expect(prompt).toContain('Honour pages[].interaction.selection')
    expect(prompt).toContain('keep every named region visible')
    expect(prompt).toContain('foreign key (projectId)')
    expect(prompt).toContain('History-style Open')
    expect(prompt).toContain('never hide the History list')
  })

  it('tells filter that Workspace selection is a foreign key, not Filter chrome', () => {
    expect(capabilityRecipePrompt(['filter'])).toContain('foreign key (projectId)')
  })

  it('tells delete that the host removes the selected collection item', () => {
    expect(capabilityRecipePrompt(['delete'])).toContain('onSuccess.setState { deleted: true }')
    expect(capabilityRecipePrompt(['delete'])).toContain(
      'The host removes the matching collection item'
    )
  })

  it('tells complete and edit that the host writes fields onto the selected row', () => {
    expect(capabilityRecipePrompt(['complete'])).toContain(
      'The host writes those fields onto the matching collection item'
    )
    expect(capabilityRecipePrompt(['edit'])).toContain(
      'the host copies them onto the matching collection item'
    )
  })

  it('tells create to open a Modal with Button setValue', () => {
    expect(capabilityRecipePrompt(['create'])).toContain('setValue "creating=true"')
    expect(capabilityRecipePrompt(['create'])).toContain('Modal showWhen "creating"')
    expect(capabilityRecipePrompt(['create'])).toContain('stamp the selected parent id')
    expect(capabilityRecipePrompt(['create'])).toContain('the host appends it onto the collection')
    expect(capabilityRecipePrompt(['create'])).toContain(
      'does not copy those form fields onto selected'
    )
  })

  it('composes inspect and analyze recipes', () => {
    const prompt = capabilityRecipePrompt(['inspect', 'analyze'])
    expect(prompt).toContain('CAPABILITY: INSPECT')
    expect(prompt).toContain('Honour pages[].interaction.inspect')
    expect(prompt).toContain('Do not navigateTo a Detail page and do not invent one')
    expect(prompt).toContain('CAPABILITY: ANALYZE')
    expect(prompt).toContain('Honour pages[].interaction.execution')
    expect(prompt).toContain('do not invent a Results page')
    expect(prompt.indexOf('INSPECT')).toBeLessThan(prompt.indexOf('ANALYZE'))
  })

  it('keeps generate, chat, and long-running execution in the named region', () => {
    const prompt = capabilityRecipePrompt(['long-running', 'generate', 'chat'])
    expect(prompt).toContain('Honour pages[].interaction.execution')
    expect(prompt).toContain('do not invent a Results page')
    expect(capabilityRecipePrompt(['chat'])).toContain('Chat stays in that region')
  })
})

describe('isCapability', () => {
  it('strips unknown tags and aliases editable to edit', () => {
    expect(isCapability('search')).toBe(true)
    expect(isCapability('edit')).toBe(true)
    expect(isCapability('editable')).toBe(true)
    expect(isCapability('date-range')).toBe(true)
    expect(isCapability('detail')).toBe(true)
    expect(isCapability('detail-drawer')).toBe(true)
    expect(isCapability('inspect')).toBe(true)
    expect(isCapability('complete')).toBe(true)
    expect(isCapability('analyze')).toBe(true)
    expect(isCapability('short')).toBe(false)
    expect(isCapability('nope')).toBe(false)
  })
})

describe('plannedCapabilities', () => {
  it('aliases editable, detail-drawer, and selection, and drops unknown tags', () => {
    expect(plannedCapabilities(['editable', 'nope', 'filter', 'search'])).toEqual([
      'search',
      'filter',
      'edit',
    ])
    expect(plannedCapabilities(['detail-drawer', 'selection', 'complete'])).toEqual([
      'select',
      'inspect',
      'complete',
    ])
    expect(
      plannedCapabilities([
        'search',
        'filter',
        'sort',
        'pagination',
        'grouping',
        'selection',
        'edit',
      ])
    ).toEqual(['search', 'filter', 'sort', 'pagination', 'grouping', 'select', 'edit'])
  })
})

describe('resolveCapabilities', () => {
  it('is empty when nothing was planned and bindings add no signals', () => {
    expect(resolveCapabilities({ bindings: [] })).toEqual([])
  })

  it('keeps planned tags on any archetype and drops unknown ones', () => {
    expect(
      resolveCapabilities({
        planned: ['selection', 'nope', 'filter'],
        bindings: [],
      })
    ).toEqual(['filter', 'select'])
  })

  it('infers streaming from a stream binding', () => {
    expect(
      resolveCapabilities({
        planned: ['search'],
        bindings: [{ kind: 'http', stream: true }],
      })
    ).toEqual(['streaming', 'search'])
  })

  it('infers long-running from a workflow binding beyond the planned cap', () => {
    expect(
      resolveCapabilities({
        planned: ['search', 'filter', 'sort', 'pagination', 'grouping'],
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual(['long-running', 'search', 'filter', 'sort', 'pagination', 'grouping'])
  })

  it('infers chat from a binding chatProtocol', () => {
    expect(
      resolveCapabilities({
        bindings: [{ kind: 'workflow', chatProtocol: { input: true } }],
      })
    ).toEqual(['long-running', 'chat'])
  })

  it('infers pagination from a binding pagination config', () => {
    expect(
      resolveCapabilities({
        bindings: [{ kind: 'http', pagination: { mode: 'cursor', items: 'rows' } }],
      })
    ).toEqual(['pagination'])
  })
})
