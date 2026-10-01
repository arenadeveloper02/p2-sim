/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { CHATGPT_WEATHER_DASHBOARD_BRIEF } from '@/lib/arena-generative-ui/chatgpt-weather-brief.fixture'
import { compileProductBrief } from '@/lib/arena-generative-ui/compile-product-brief'

describe('compileProductBrief', () => {
  it('leaves a short Arena job untouched', () => {
    expect(compileProductBrief('Simple todo app. One list. Add and complete items.')).toEqual({
      honorPrompt: '',
      adoptedChanges: [],
    })
  })

  it('notes host limits and does not turn a weather brief into a catalog layout', () => {
    const compiled = compileProductBrief(CHATGPT_WEATHER_DASHBOARD_BRIEF, [
      {
        key: 'forecast',
        kind: 'http',
        outputSchema: [
          { name: 'hourly', type: 'array' },
          { name: 'temperature_2m', type: 'number' },
        ],
      },
    ])

    expect(compiled.honorPrompt).toContain('host limits only')
    expect(compiled.honorPrompt).toContain('Do not plan browser geolocation')
    expect(compiled.honorPrompt).toContain('localStorage')
    expect(compiled.honorPrompt).toContain('unit toggle')
    expect(compiled.honorPrompt).toContain('catalog json-render')
    expect(compiled.honorPrompt).not.toContain('performance dashboard')
    expect(compiled.honorPrompt).not.toContain('Filmstrip')
    expect(compiled.adoptedChanges.every((change) => change.code === 'product-drop')).toBe(true)
  })

  it('does not honor a negated dashboard or a result-field location', () => {
    const compiled = compileProductBrief(
      'Simple todo app. Do not add a dashboard. Show current location as a result field. Persist the selection. Temperatures in °C. Add skeleton screens.'
    )
    expect(compiled.honorPrompt).toBe('')
    expect(compiled.adoptedChanges).toEqual([])
  })

  it('records geolocation and localStorage as limits, not as a dashboard order', () => {
    const compiled = compileProductBrief(
      'Build a weather dashboard. Do not add extra pages. Use browser geolocation and persist last city in localStorage.'
    )
    expect(compiled.honorPrompt).not.toContain('performance dashboard')
    expect(compiled.honorPrompt).toContain('Do not plan browser geolocation')
    expect(compiled.honorPrompt).toContain('localStorage')
    expect(compiled.adoptedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asked: expect.stringContaining('geolocation') }),
        expect.objectContaining({ asked: expect.stringContaining('localStorage') }),
      ])
    )
  })

  it('does not map command palette or breadcrumbs into catalog orders', () => {
    expect(
      compileProductBrief('Add a command palette (⌘K) and breadcrumbs under the header.')
    ).toEqual({
      honorPrompt: '',
      adoptedChanges: [],
    })
  })

  it('does not map a metrics sentence into a performance-dashboard order', () => {
    expect(compileProductBrief('Google Ads last 7 days dashboard with spend and CTR.')).toEqual({
      honorPrompt: '',
      adoptedChanges: [],
    })
  })
})
