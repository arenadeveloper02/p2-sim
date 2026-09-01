/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_COMPOSITION_PROMPT,
  ARENA_GENERATIVE_UI_HIERARCHY_PROMPT,
  ARENA_GENERATIVE_UI_LAYOUT_PROMPT,
} from '@/lib/arena-generative-ui/design-guidelines'

describe('ARENA_GENERATIVE_UI_COMPOSITION_PROMPT', () => {
  it('names the design guidelines layer and its sections', () => {
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain('DESIGN GUIDELINES')
    for (const heading of [
      'VISUAL LANGUAGE',
      'LAYOUT',
      'VISUAL HIERARCHY',
      'TYPOGRAPHY',
      'COLOR',
      'SPACING',
      'CARDS',
      'BUTTONS',
      'FORMS',
      'TABLES',
      'DATA VISUALIZATION',
      'ICONS',
      'RESPONSIVE DESIGN',
      'CONTENT',
      'DENSITY',
      'CONSISTENCY',
      'PROFESSIONALISM',
    ]) {
      expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain(heading)
    }
  })

  it('requires a Page → Section container and catalog layout pins', () => {
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /container[^\n]*Page → AppHeader → Section → PageHeader/
    )
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /container[^\n]*Do not put Table, Form, Repeat, or AppHeader as a child of Section/
    )
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/forms[^\n]*Section "narrow"/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/wide[^\n]*Table, Repeat collections/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /columns[^\n]*At most two primary content columns/
    )
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/toolbar[^\n]*Toolbar above Table\/Repeat/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/primary[^\n]*PageHeader trailing child/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(/primary[^\n]*end of its task group/)
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toMatch(
      /region[^\n]*One dominant content region per viewport/
    )
  })

  it('names five prominence levels and one primary per Section', () => {
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L1 purpose[^\n]*PageHeader/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L2 primary[^\n]*SubmitButton/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L3 supporting[^\n]*Form fields/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L4 secondary[^\n]*Toolbar/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/L5 optional[^\n]*Drawer, Modal/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /primary[^\n]*Only one primary action dominates a local Section/
    )
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/secondary[^\n]*"secondary"/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/secondary[^\n]*"ghost"/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /destructive[^\n]*never visually compete with the primary/
    )
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(/metadata[^\n]*stay muted/)
    expect(ARENA_GENERATIVE_UI_HIERARCHY_PROMPT).toMatch(
      /metadata[^\n]*Do not promote metadata with Heading or Stat/
    )
  })

  it('forbids nested Cards and decorative Sparkline', () => {
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain('no Card-in-Card')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain('Do not wrap every Section in a Card')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain(
      'Never generate a decorative Sparkline'
    )
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain(
      'variant "default" is the raised host surface'
    )
    expect(ARENA_GENERATIVE_UI_LAYOUT_PROMPT).toContain('gap "lg"')
  })

  it('teaches Grid collapse without host loading chrome', () => {
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).toContain(
      'Grid and Columns collapse to one column'
    )
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).not.toContain('Retry')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).not.toContain('Refresh')
    expect(ARENA_GENERATIVE_UI_COMPOSITION_PROMPT).not.toContain('aria-busy')
  })
})
