/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_HIERARCHY_PROMPT } from '@/lib/arena-generative-ui/visual-hierarchy'

describe('ARENA_GENERATIVE_UI_HIERARCHY_PROMPT', () => {
  it('names the visual hierarchy layer', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toContain('VISUAL HIERARCHY')
  })

  it('names five prominence levels', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L1 purpose[^\n]*PageHeader/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L2 primary[^\n]*SubmitButton/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L3 supporting[^\n]*Form fields/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L4 secondary[^\n]*Toolbar/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L5 optional[^\n]*Drawer, Modal/)
  })

  it('allows only one primary action per local Section', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /primary[^\n]*Only one primary action dominates a local Section/
    )
  })

  it('sends secondary actions to secondary or ghost', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/secondary[^\n]*"secondary"/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/secondary[^\n]*"ghost"/)
  })

  it('keeps destructive from competing with the primary', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /destructive[^\n]*never visually compete with the primary/
    )
  })

  it('keeps metadata quieter than content', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/metadata[^\n]*stay muted/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /metadata[^\n]*Do not promote metadata with Heading or Stat/
    )
  })
})
