/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_DESIGN_GUIDELINES } from '@/lib/arena-generative-ui/catalog'
import { buildGeneratorSystemPrompt } from '@/lib/arena-generative-ui/prompt-pipeline'

function headingIndex(prompt: string, heading: string): number {
  return prompt.indexOf(heading)
}

describe('buildGeneratorSystemPrompt', () => {
  it('assembles layers in constitution → recipe → component/state/responsive/a11y → JSON order', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'dashboard',
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })

    const order = [
      'You are an expert principal frontend engineer',
      'UNIVERSAL UI/UX CONSTITUTION',
      'ARENA DESIGN SYSTEM',
      'ARCHETYPE RECIPE: dashboard',
      'GOLD STANDARD REFERENCE LAYOUT (dashboard)',
      'COMPONENT SELECTION RULES',
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

  it('places the recipe immediately before the gold few-shot', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'form-result',
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    const recipeAt = headingIndex(prompt, 'ARCHETYPE RECIPE: form-result')
    const goldAt = headingIndex(prompt, 'GOLD STANDARD REFERENCE LAYOUT (form-result)')
    expect(recipeAt).toBeGreaterThan(-1)
    expect(goldAt).toBeGreaterThan(recipeAt)
    expect(prompt.slice(recipeAt, goldAt)).not.toContain('COMPONENT RULES')
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
