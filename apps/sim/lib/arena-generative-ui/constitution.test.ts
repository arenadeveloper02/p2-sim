/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT,
  ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS,
  ARENA_GENERATIVE_UI_UX_NEVERS,
  ARENA_GENERATIVE_UI_UX_PRINCIPLES,
} from '@/lib/arena-generative-ui/constitution'

const SECTION_IDS = [
  'composition',
  'actions',
  'states',
  'forms',
  'navigation',
  'responsive',
  'accessibility',
  'content',
  'density',
  'consistency',
] as const

describe('Universal UI/UX Constitution', () => {
  it('exports all ten sections in order', () => {
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS.map((section) => section.id)).toEqual([
      ...SECTION_IDS,
    ])
    for (const section of ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS) {
      expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain(section.title)
    }
  })

  it('phrases host clauses as runtime compiles / do not emit', () => {
    const hostPrompts = ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS.flatMap((section) =>
      section.clauses.filter((clause) => clause.ownership === 'host').map((clause) => clause.prompt)
    )
    expect(hostPrompts.length).toBeGreaterThan(0)
    expect(
      hostPrompts.every(
        (prompt) =>
          /do not emit/i.test(prompt) ||
          /runtime/i.test(prompt) ||
          /do not invent/i.test(prompt) ||
          /never invent/i.test(prompt) ||
          /do not reset/i.test(prompt) ||
          /do not put secrets/i.test(prompt) ||
          /do not block/i.test(prompt) ||
          /do not hard-code/i.test(prompt) ||
          /keep the layout/i.test(prompt)
      )
    ).toBe(true)
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toMatch(/do not emit/i)
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toMatch(/runtime compiles/i)
  })

  it('tells the generator about primary action, grouping, density, empty copy, and Back', () => {
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain('one clear primary action')
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain(
      'Group related information into sections'
    )
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain('2–3 levels of visual nesting')
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain('empty-state copy')
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain('Back navigation')
  })

  it('does not tell the model to emit Alert or Toast for API failure', () => {
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).toContain(
      'do not emit Alert or Toast for that'
    )
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).not.toMatch(
      /emit Alert or Toast for API failure/i
    )
    expect(ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT).not.toContain(
      'emit Alert, Toast, or Modal for field errors'
    )
  })

  it('derives principles and nevers from the sections', () => {
    expect(ARENA_GENERATIVE_UI_UX_PRINCIPLES).toContain(
      'Generate interfaces that feel production-ready.'
    )
    for (const section of ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS) {
      expect(ARENA_GENERATIVE_UI_UX_PRINCIPLES).toContain(section.principle)
    }
    expect(ARENA_GENERATIVE_UI_UX_NEVERS).toEqual(
      expect.arrayContaining([
        'invent API data',
        'create fake progress',
        'silently discard user input',
        'destroy user data without confirmation',
        'trap the user in a page without recovery/navigation',
      ])
    )
  })
})
