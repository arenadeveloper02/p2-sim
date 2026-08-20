/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import {
  applyThemeOnlyEdit,
  isThemeOnlyEdit,
  parseThemeHints,
  themeEditInstructions,
} from '@/lib/arena-generative-ui/theme-from-edit'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

describe('isThemeOnlyEdit', () => {
  it('accepts a theme instruction with no layout words', () => {
    expect(isThemeOnlyEdit('Set the theme to dark mode.', null)).toBe(true)
    expect(isThemeOnlyEdit('density compact, radius lg', null)).toBe(true)
  })

  it('rejects copy that names a page or layout', () => {
    expect(isThemeOnlyEdit('dark mode on the results page', null)).toBe(false)
    expect(isThemeOnlyEdit('make the search field compact', null)).toBe(false)
  })
})

describe('parseThemeHints', () => {
  it('reads colorScheme from copied picker instructions', () => {
    expect(parseThemeHints(themeEditInstructions({ colorScheme: 'dark' }))).toEqual({
      colorScheme: 'dark',
    })
  })

  it('does not treat an unrelated dark word as dark mode', () => {
    expect(parseThemeHints('keep the dark navy cards')).toEqual({})
  })
})

describe('applyThemeOnlyEdit', () => {
  it('overlays knobs without rewriting pages', () => {
    const next = applyThemeOnlyEdit(twoPageManifest, 'Set the theme to dark mode, density compact.')
    expect(next.pages).toEqual(twoPageManifest.pages)
    expect(next.theme).toMatchObject({
      ...DEFAULT_ARENA_GENERATIVE_THEME,
      colorScheme: 'dark',
      density: 'compact',
    })
  })
})
