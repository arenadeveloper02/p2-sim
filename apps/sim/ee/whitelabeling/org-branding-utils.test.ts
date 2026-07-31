/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { defaultBrandConfig } from '@/lib/branding/defaults'
import { mergeOrgBrandConfig, resolveOrgFaviconUrl } from '@/ee/whitelabeling/org-branding-utils'

describe('resolveOrgFaviconUrl', () => {
  it('prefers dedicated favicon over logo and wordmark', () => {
    expect(
      resolveOrgFaviconUrl(
        {
          faviconUrl: 'https://cdn.example.com/favicon.png',
          logoUrl: 'https://cdn.example.com/logo.png',
          wordmarkUrl: 'https://cdn.example.com/wordmark.png',
        },
        '/sim.svg'
      )
    ).toBe('https://cdn.example.com/favicon.png')
  })

  it('falls back to logo then wordmark then instance default', () => {
    expect(resolveOrgFaviconUrl({ logoUrl: 'https://cdn.example.com/logo.png' }, '/sim.svg')).toBe(
      'https://cdn.example.com/logo.png'
    )
    expect(
      resolveOrgFaviconUrl({ wordmarkUrl: 'https://cdn.example.com/wordmark.png' }, '/sim.svg')
    ).toBe('https://cdn.example.com/wordmark.png')
    expect(resolveOrgFaviconUrl({}, '/sim.svg')).toBe('/sim.svg')
    expect(resolveOrgFaviconUrl(null, '/sim.svg')).toBe('/sim.svg')
  })
})

describe('mergeOrgBrandConfig faviconUrl', () => {
  it('merges org favicon with logo fallback', () => {
    const merged = mergeOrgBrandConfig(
      { logoUrl: 'https://cdn.example.com/logo.png' },
      defaultBrandConfig
    )
    expect(merged.faviconUrl).toBe('https://cdn.example.com/logo.png')
  })
})
