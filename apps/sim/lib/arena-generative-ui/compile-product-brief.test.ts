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

  it('maps a ChatGPT weather dashboard onto catalog/host behavior without rewriting the brief', () => {
    const compiled = compileProductBrief(CHATGPT_WEATHER_DASHBOARD_BRIEF, [
      {
        key: 'forecast',
        kind: 'http',
        outputSchema: [
          { name: 'hourly', type: 'array' },
          { name: 'temperature_2m', type: 'number' },
          { name: 'daily', type: 'array' },
        ],
      },
    ])

    expect(compiled.honorPrompt).toContain('COMPILED HONOR LIST')
    expect(compiled.honorPrompt).toContain('Job is a performance dashboard')
    expect(compiled.honorPrompt).toContain('Filmstrip')
    expect(compiled.honorPrompt).toContain('SearchField')
    expect(compiled.honorPrompt).toContain('live true')
    expect(compiled.honorPrompt).toContain('Do not emit a Card that wraps Repeat of Cards')
    expect(compiled.honorPrompt).toContain('Do not plan browser geolocation')
    expect(compiled.honorPrompt).toContain('catalog Icon')
    expect(compiled.honorPrompt).toContain('weather_code')
    expect(compiled.honorPrompt).toContain('catalog json-render')
    expect(compiled.adoptedChanges.map((change) => change.code).sort()).toEqual(
      [
        'product-drop',
        'product-drop',
        'product-drop',
        'product-drop',
        'product-drop',
        'product-map',
        'product-map',
        'product-map',
        'product-map',
        'product-map',
        'product-map',
      ].sort()
    )
    expect(compiled.adoptedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'product-map',
          adopted: expect.stringContaining('Chart'),
        }),
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('geolocation'),
          adopted: expect.stringContaining('SearchField'),
        }),
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('Weather icons'),
        }),
        expect.objectContaining({
          code: 'product-drop',
          asked: expect.stringContaining('localStorage'),
        }),
        expect.objectContaining({
          code: 'product-drop',
          asked: expect.stringContaining('°C/°F'),
        }),
      ])
    )
  })

  it('does not honor a negated dashboard or a result-field location', () => {
    const compiled = compileProductBrief(
      'Simple todo app. Do not add a dashboard. Show current location as a result field. Persist the selection. Temperatures in °C. Add skeleton screens.'
    )
    expect(compiled.honorPrompt).toBe('')
    expect(compiled.adoptedChanges).toEqual([])
  })

  it('still honors a positive weather dashboard after a later negation', () => {
    const compiled = compileProductBrief(
      'Build a weather dashboard. Do not add extra pages. Use browser geolocation and persist last city in localStorage.'
    )
    expect(compiled.honorPrompt).toContain('Job is a performance dashboard')
    expect(compiled.honorPrompt).toContain('They win over SCOPE DISCIPLINE')
    expect(compiled.adoptedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ asked: expect.stringContaining('dashboard') }),
        expect.objectContaining({ asked: expect.stringContaining('geolocation') }),
        expect.objectContaining({ asked: expect.stringContaining('localStorage') }),
      ])
    )
  })

  it('maps command palette and breadcrumbs onto catalog types', () => {
    const compiled = compileProductBrief(
      'Add a command palette (⌘K) and breadcrumbs under the header.'
    )
    expect(compiled.honorPrompt).toContain('CommandPalette')
    expect(compiled.honorPrompt).toContain('Breadcrumb')
    expect(compiled.adoptedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('Command palette'),
        }),
        expect.objectContaining({
          code: 'product-map',
          asked: expect.stringContaining('Breadcrumb'),
        }),
      ])
    )
  })

  it('maps Google Ads metrics onto a performance dashboard honor string', () => {
    const compiled = compileProductBrief('Google Ads last 7 days dashboard with spend and CTR.')
    expect(compiled.honorPrompt).toContain('performance dashboard')
    expect(compiled.honorPrompt).toContain('Stat size "display"')
    expect(compiled.honorPrompt).toContain('Do not emit an Operations Filter')
  })
})
