/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_DESIGN_GUIDELINES } from '@/lib/arena-generative-ui/catalog'
import { ARENA_GENERATIVE_UI_COMPOSITION_PROMPT } from '@/lib/arena-generative-ui/design-guidelines'
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
  it('assembles layers in Design → UX → Archetype column order', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'dashboard',
      capabilities: ['filter'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })

    const order = [
      'You are an expert principal frontend engineer',
      'DESIGN RULES / TOKENS',
      'ARENA DESIGN SYSTEM',
      'DESIGN INTENT',
      'DESIGN GUIDELINES',
      'UX RULES / STATES',
      'UNIVERSAL UI/UX CONSTITUTION',
      'DATA STATE CONTRACT',
      'ACTION CONTRACT',
      'INTERACTION / STATE RULES',
      'ACCESSIBILITY RULES',
      'ANTI-PATTERNS',
      'ARCHETYPE RECIPE',
      'COMPONENT SELECTION RULES',
      'ARCHETYPE RECIPE: dashboard',
      'CAPABILITY: FILTER',
      'GOLD STANDARD REFERENCE LAYOUT (dashboard)',
      'COMPONENT RULES',
      'AVAILABLE COMPONENTS',
      'RULES:',
    ]
    const indexes = order.map((heading) => headingIndex(prompt, heading))
    expect(indexes.every((index) => index >= 0)).toBe(true)
    for (let i = 1; i < indexes.length; i += 1) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1] ?? 0)
    }
    expect(prompt).not.toContain('PROFESSIONAL LAYOUT')
    expect(prompt).not.toContain('RESPONSIVE RULES')
    expect(prompt).not.toContain('UI CRITIC')
  })

  it('keeps layout and hierarchy as Design Guidelines subsections, not pipeline siblings', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'dashboard',
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    const guidelinesAt = headingIndex(prompt, 'DESIGN GUIDELINES')
    const intentAt = headingIndex(prompt, 'DESIGN INTENT')
    const designRulesAt = headingIndex(prompt, 'DESIGN RULES / TOKENS')
    const layoutAt = headingIndex(prompt, 'LAYOUT')
    const hierarchyAt = headingIndex(prompt, 'VISUAL HIERARCHY')
    const dataAt = headingIndex(prompt, 'DATA STATE CONTRACT')
    expect(headingIndex(prompt, 'ARENA DESIGN SYSTEM')).toBeGreaterThan(designRulesAt)
    expect(intentAt).toBeGreaterThan(headingIndex(prompt, 'ARENA DESIGN SYSTEM'))
    expect(guidelinesAt).toBeGreaterThan(intentAt)
    expect(layoutAt).toBeGreaterThan(guidelinesAt)
    expect(hierarchyAt).toBeGreaterThan(layoutAt)
    expect(dataAt).toBeGreaterThan(hierarchyAt)
    expect(headingIndex(prompt, 'UX RULES / STATES')).toBeGreaterThan(guidelinesAt)
  })

  it('places selected capability recipes between the recipe and the gold few-shot', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'task',
      capabilities: ['long-running', 'cancellable'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    const recipeAt = headingIndex(prompt, 'ARCHETYPE RECIPE: task')
    const longAt = headingIndex(prompt, 'CAPABILITY: LONG-RUNNING')
    const cancelAt = headingIndex(prompt, 'CAPABILITY: CANCELLABLE')
    const goldAt = headingIndex(prompt, 'GOLD STANDARD REFERENCE LAYOUT (task)')
    expect(longAt).toBeGreaterThan(recipeAt)
    expect(cancelAt).toBeGreaterThan(longAt)
    expect(goldAt).toBeGreaterThan(cancelAt)
    expect(prompt).not.toContain('CAPABILITY: SEARCH')
    expect(prompt).not.toContain('PROCESSING PATTERN')
  })

  it('appends the shell recipe without stealing workspace gold when navigation is sidebar', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'collection',
      shell: { navigation: 'sidebar' },
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('ARCHETYPE RECIPE: collection')
    expect(prompt).toContain('SHELL RECIPE')
    expect(headingIndex(prompt, 'SHELL RECIPE')).toBeGreaterThan(
      headingIndex(prompt, 'ARCHETYPE RECIPE: collection')
    )
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (list-detail)')
  })

  it('injects precomposed page-shape recipes when provided', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'task',
      recipes: 'ARCHETYPE RECIPE: task\n\nARCHETYPE RECIPE: results',
      capabilities: ['long-running'],
      hasBindings: true,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('ARCHETYPE RECIPE: task')
    expect(prompt).toContain('ARCHETYPE RECIPE: results')
    expect(headingIndex(prompt, 'ARCHETYPE RECIPE: results')).toBeGreaterThan(
      headingIndex(prompt, 'ARCHETYPE RECIPE: task')
    )
  })

  it('omits capability modules when none were selected', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'task',
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
    expect(prompt).toContain('DESIGN GUIDELINES')
    expect(prompt).toContain('ARCHETYPE RECIPE')
    expect(prompt).not.toContain('ARCHETYPE RECIPE:')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (task)')
  })

  it('keeps archetype layouts off the always-on design tokens', () => {
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).toContain('ARENA DESIGN SYSTEM')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).toContain('DESIGN TOKENS')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).toContain('"padding":"lg"')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('one-field search')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('centered PageHeader')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('WorkingCard')
    expect(ARENA_GENERATIVE_UI_DESIGN_GUIDELINES).not.toContain('SearchField')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain('DESIGN GUIDELINES')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain(
      'Choose density from DESIGN INTENT / manifest.theme'
    )
  })

  it('omits dashboard gold, SWOT, and productType from a micro collection prompt', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'collection',
      recipes: 'ARCHETYPE RECIPE: collection\n\nDUMMY / LOCAL DATA',
      hasDummyData: true,
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('ARCHETYPE RECIPE: collection')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (collection)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (list-detail)')
    expect(prompt).not.toContain('GOLD STANDARD REFERENCE LAYOUT (dashboard)')
    expect(prompt).not.toContain('SWOT')
    expect(prompt).not.toContain('productType')
    expect(prompt).not.toContain('Watchtower')
    expect(prompt).not.toContain('omit manifest.actions')
    expect(prompt).not.toContain('use navigation only')
    expect(prompt).toContain('Dummy/local actions omit apiKey')
  })

  it('includes the workspace recipe and sidebar-shell gold for a workspace prompt', () => {
    const prompt = buildGeneratorSystemPrompt({
      archetype: 'workspace',
      recipes: 'ARCHETYPE RECIPE: workspace\n\nSHELL RECIPE',
      shell: { navigation: 'sidebar' },
      needsWorkspace: true,
      hasBindings: false,
      hasStreamingBinding: false,
      isScopedEdit: false,
    })
    expect(prompt).toContain('ARCHETYPE RECIPE: workspace')
    expect(prompt).toContain('SHELL RECIPE')
    expect(prompt).toContain('GOLD STANDARD REFERENCE LAYOUT (sidebar-shell)')
  })
})
