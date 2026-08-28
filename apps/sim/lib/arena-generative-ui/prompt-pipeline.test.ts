/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_DESIGN_GUIDELINES } from '@/lib/arena-generative-ui/catalog'
import { buildGeneratorSystemPrompt } from '@/lib/arena-generative-ui/prompt-pipeline'

/** Index of a prompt heading on its own line, not a mention inside another sentence. */
function headingIndex(prompt: string, heading: string): number {
  const asOwnLine = `\n${heading}\n`
  const at = prompt.indexOf(asOwnLine)
  if (at >= 0) return at + 1
  if (prompt.startsWith(`${heading}\n`) || prompt === heading) return 0
  return prompt.indexOf(heading)
}

describe('buildGeneratorSystemPrompt', () => {
  it('assembles layers in constitution → recipe → component/state/responsive/a11y → JSON order', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'dashboard',
      capabilities: ['filter'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })

    const order = [
      'You are an expert principal frontend engineer',
      'UNIVERSAL UI/UX CONSTITUTION',
      'ARENA DESIGN SYSTEM',
      'ARCHETYPE RECIPE: dashboard',
      'CAPABILITY: FILTER',
      'GOLD STANDARD REFERENCE LAYOUT (dashboard)',
      'COMPONENT SELECTION RULES',
      'PROFESSIONAL LAYOUT',
      'VISUAL HIERARCHY',
      'ANTI-PATTERNS',
      'COMPONENT RULES',
      'DATA STATE CONTRACT',
      'ACTION CONTRACT',
      'INTERACTION / STATE RULES',
      'RESPONSIVE RULES',
      'ACCESSIBILITY RULES',
      'AVAILABLE COMPONENTS',
      'RULES:',
    ]
    const indexes = order.map((heading) => headingIndex(prompt, heading))
    expect(indexes.every((index) => index >= 0)).toBe(true)
    for (let i = 1; i < indexes.length; i += 1) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1] ?? 0)
    }
  })

  it('places selected capability recipes between the recipe and the gold few-shot', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'form-result',
      capabilities: ['long-running', 'cancellable'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    const recipeAt = headingIndex(prompt, 'ARCHETYPE RECIPE: form-result')
    const longAt = headingIndex(prompt, 'CAPABILITY: LONG-RUNNING')
    const cancelAt = headingIndex(prompt, 'CAPABILITY: CANCELLABLE')
    const goldAt = headingIndex(prompt, 'GOLD STANDARD REFERENCE LAYOUT (form-result)')
    expect(longAt).toBeGreaterThan(recipeAt)
    expect(cancelAt).toBeGreaterThan(longAt)
    expect(goldAt).toBeGreaterThan(cancelAt)
    expect(prompt).not.toContain('CAPABILITY: SEARCH')
    expect(prompt).not.toContain('PROCESSING PATTERN')
  })

  it('omits capability modules when none were selected', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'form-result',
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).not.toContain('CAPABILITY: LONG-RUNNING')
    expect(prompt).not.toContain('CAPABILITY: SEARCH')
    expect(prompt).not.toContain('PROCESSING PATTERN')
  })

  it('omits the recipe when no archetype was planned and still includes the constitution', () => {
    const prompt = buildGeneratorSystemPrompt({
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('UNIVERSAL UI/UX CONSTITUTION')
    expect(prompt).not.toContain('ARCHETYPE RECIPE:')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (form-result)')
  })

  it('keeps archetype layouts off the always-on design tokens', () => {
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).toContain('ARENA DESIGN SYSTEM')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('one-field search')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('centered PageHeader')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('WorkingCard')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('SearchField')
  })
})
