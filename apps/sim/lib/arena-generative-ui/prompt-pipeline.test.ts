/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: () => 'test-key',
}))

import { buildGeneratorSystemPrompt } from '@/lib/arena-generative-ui/prompt-pipeline'

describe('buildGeneratorSystemPrompt', () => {
  it('sends persona, wiring, and the catalog without gold or recipe essays', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'dashboard',
      capabilities: ['filter'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
      needsTables: true,
    })

    expect(prompt).toContain('You are an expert principal frontend engineer')
    expect(prompt).toContain('WIRING')
    expect(prompt).toContain('layoutPlan host key')
    expect(prompt).toContain('AVAILABLE COMPONENTS')
    expect(prompt).toContain('ACTION CONTRACT')
    expect(prompt).not.toContain('GOLD STANDARD')
    expect(prompt).not.toContain('ARCHETYPE RECIPE')
    expect(prompt).not.toContain('UNIVERSAL UI/UX CONSTITUTION')
    expect(prompt).not.toContain('DESIGN GUIDELINES')
    expect(prompt).not.toContain('do not paint chrome')
    expect(prompt).not.toContain('ANTI-PATTERNS')
    expect(prompt).not.toContain('CAPABILITY: FILTER')
  })

  it('keeps wait and form components when the blueprint needs them', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'task',
      pageArchetypes: ['task', 'results'],
      needsForms: true,
      needsWait: true,
      shell: { navigation: 'tabs' },
      hasBindings: true,
      hasStreamingBinding: true,
      isScopedEdit: false,
    })
    expect(prompt).toContain('- WorkingCard: {')
    expect(prompt).toContain('- Tabs: {')
    expect(prompt).toContain('stream: true')
  })

  it('includes dummy seed rules and omits remote input rules when there are no bindings', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'collection',
      hasDummyData: true,
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('DUMMY / LOCAL DATA')
    expect(prompt).not.toContain('CTA inputs:')
  })

  it('adds scoped-edit rules only for a page-scoped edit', () => {
    const scoped = buildGeneratorSystemPrompt({
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: true,
    })
    const full = buildGeneratorSystemPrompt({
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(scoped).toContain('SCOPED EDIT')
    expect(full).not.toContain('SCOPED EDIT')
  })
})
