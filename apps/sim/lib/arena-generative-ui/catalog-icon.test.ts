/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  catalogIconFromWeatherCode,
  resolveCatalogIconName,
} from '@/lib/arena-generative-ui/catalog-icon'

describe('catalogIconFromWeatherCode', () => {
  it('maps WMO codes onto catalog weather glyphs', () => {
    expect(catalogIconFromWeatherCode(0)).toBe('sun')
    expect(catalogIconFromWeatherCode(2)).toBe('cloud-sun')
    expect(catalogIconFromWeatherCode(3)).toBe('cloud')
    expect(catalogIconFromWeatherCode(61)).toBe('cloud-rain')
    expect(catalogIconFromWeatherCode(73)).toBe('cloud-snow')
    expect(catalogIconFromWeatherCode(95)).toBe('cloud-lightning')
  })
})

describe('resolveCatalogIconName', () => {
  it('prefers an explicit catalog name, then a bound name, then a WMO code', () => {
    expect(resolveCatalogIconName({ name: 'sun' })).toBe('sun')
    expect(resolveCatalogIconName({ bound: 'cloud-rain' })).toBe('cloud-rain')
    expect(resolveCatalogIconName({ bound: 0 })).toBe('sun')
    expect(resolveCatalogIconName({ bound: '95' })).toBe('cloud-lightning')
    expect(resolveCatalogIconName({})).toBe('spark')
  })
})
