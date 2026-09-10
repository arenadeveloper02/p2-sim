/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  arenaGenerativeThemeScheme,
  arenaGenerativeThemeStyle,
  parseArenaGenerativeTheme,
  resolveArenaGenerativeSpacing,
} from '@/lib/arena-generative-ui/theme'

describe('parseArenaGenerativeTheme', () => {
  it('keeps a valid hex brand, radius, density, font, and color scheme', () => {
    expect(
      parseArenaGenerativeTheme({
        brandColor: '#2563eb',
        radius: 'lg',
        density: 'compact',
        font: 'serif',
        colorScheme: 'dark',
      })
    ).toEqual({
      brandColor: '#2563eb',
      radius: 'lg',
      density: 'compact',
      font: 'serif',
      colorScheme: 'dark',
    })
  })

  it('accepts 3-digit hex and drops invalid values so validation still succeeds', () => {
    expect(
      parseArenaGenerativeTheme({
        brandColor: '#abc',
        radius: 'huge',
        density: 'cozy',
        font: 'mono',
        colorScheme: 'auto',
      })
    ).toEqual({ brandColor: '#abc' })
  })

  it('returns undefined for empty or non-objects', () => {
    expect(parseArenaGenerativeTheme(undefined)).toBeUndefined()
    expect(parseArenaGenerativeTheme({})).toBeUndefined()
    expect(parseArenaGenerativeTheme({ brandColor: 'blue' })).toBeUndefined()
  })
})

describe('arenaGenerativeThemeStyle', () => {
  it('sets scoped CSS variables for custom brand, radius, and density', () => {
    expect(
      arenaGenerativeThemeStyle({
        brandColor: '#112233',
        radius: 'sm',
        density: 'roomy',
      })
    ).toMatchObject({
      '--gui-brand': '#112233',
      '--gui-brand-hover': 'color-mix(in srgb, #112233 82%, #000)',
      '--gui-brand-pressed': 'color-mix(in srgb, #112233 68%, #000)',
      '--gui-brand-surface': 'color-mix(in srgb, #112233 10%, #fff)',
      '--gui-radius': '8px',
      '--gui-space-md': '24px',
      '--gui-space-lg': '32px',
      '--gui-gap': '24px',
      '--gui-pad': '24px',
      '--gui-section-gap': '32px',
    })
  })

  it('skips default Arena brand so light/dark CSS tokens win', () => {
    const style = arenaGenerativeThemeStyle(
      { brandColor: '#1A73E8', radius: 'md' },
      'dark'
    ) as Record<string, string>
    expect(style['--gui-brand']).toBeUndefined()
    expect(style['--gui-brand-hover']).toBeUndefined()
    expect(style['--gui-radius']).toBe('12px')
  })

  it('uses lighten mixes for custom brand in dark scheme', () => {
    expect(arenaGenerativeThemeStyle({ brandColor: '#112233' }, 'dark')).toMatchObject({
      '--gui-brand': '#112233',
      '--gui-brand-hover': 'color-mix(in srgb, #112233 82%, #fff)',
      '--gui-brand-pressed': 'color-mix(in srgb, #112233 68%, #fff)',
      '--gui-brand-surface': 'color-mix(in srgb, #112233 22%, #12141a)',
    })
  })

  it('defaults color scheme to light', () => {
    expect(arenaGenerativeThemeScheme(undefined)).toBe('light')
    expect(arenaGenerativeThemeScheme({ colorScheme: 'system' })).toBe('system')
  })
})

describe('resolveArenaGenerativeSpacing', () => {
  it('maps size tokens to density-aware CSS variables and passes lengths through', () => {
    expect(resolveArenaGenerativeSpacing('lg')).toBe('var(--gui-space-lg, 24px)')
    expect(resolveArenaGenerativeSpacing('none')).toBe('0px')
    expect(resolveArenaGenerativeSpacing('18px')).toBe('18px')
    expect(resolveArenaGenerativeSpacing('var(--gui-gap, 16px)')).toBe('var(--gui-gap, 16px)')
  })
})
