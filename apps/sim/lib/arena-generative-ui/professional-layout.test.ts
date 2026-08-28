/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_LAYOUT_PROMPT } from '@/lib/arena-generative-ui/professional-layout'

describe('ARENA_GENERATIVE_UI_LAYOUT_PROMPT', () => {
  it('names the professional layout layer', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toContain('PROFESSIONAL LAYOUT')
  })

  it('requires a Page → Section container', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/container[^\n]*Page → Section → PageHeader/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /container[^\n]*Do not put Table, Form, or Repeat as a direct child of Page/
    )
  })

  it('keeps forms narrow and collections wide', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/forms[^\n]*Section "narrow"/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/wide[^\n]*Table, Repeat collections/)
  })

  it('caps primary content at two columns', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /columns[^\n]*At most two primary content columns/
    )
  })

  it('puts related controls in a Toolbar', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/toolbar[^\n]*Toolbar above Table\/Repeat/)
  })

  it('places the primary action at the title or the end of its task group', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/primary[^\n]*PageHeader trailing child/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/primary[^\n]*end of its task group/)
  })

  it('prefers one dominant content region', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /region[^\n]*One dominant content region per viewport/
    )
  })
})
