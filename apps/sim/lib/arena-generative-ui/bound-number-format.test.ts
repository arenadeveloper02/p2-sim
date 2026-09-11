/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatBoundNumberDisplay,
  isBoundNumberFormat,
} from '@/lib/arena-generative-ui/bound-number-format'

describe('formatBoundNumberDisplay', () => {
  it('leaves non-numeric copy and unnamed formats unchanged', () => {
    expect(formatBoundNumberDisplay('Dental implants', 'currency')).toBe('Dental implants')
    expect(formatBoundNumberDisplay('1234', undefined)).toBe('1234')
  })

  it('honours presets', () => {
    expect(formatBoundNumberDisplay(1234, 'integer')).toBe('1,234')
    expect(formatBoundNumberDisplay(1234.5, 'decimal')).toBe('1,234.5')
    expect(formatBoundNumberDisplay(1234, 'currency')).toBe('$1,234.00')
    expect(formatBoundNumberDisplay(1234, 'usd')).toBe('$1,234.00')
    expect(formatBoundNumberDisplay(1234, 'eur')).toBe('€1,234.00')
    expect(formatBoundNumberDisplay(14.2, 'percent')).toBe('14.2%')
    expect(formatBoundNumberDisplay(0.142, 'percent-ratio')).toBe('14.2%')
    expect(formatBoundNumberDisplay(1500, 'compact')).toBe('1.5K')
  })

  it('honours token patterns', () => {
    expect(formatBoundNumberDisplay(1234.5, '$0,0.00')).toBe('$1,234.50')
    expect(formatBoundNumberDisplay(14.2, '0.0%')).toBe('14.2%')
    expect(formatBoundNumberDisplay(1234, '0,0')).toBe('1,234')
  })
})

describe('isBoundNumberFormat', () => {
  it('accepts number presets and tokens, not date numeric', () => {
    expect(isBoundNumberFormat('currency')).toBe(true)
    expect(isBoundNumberFormat('$0,0.00')).toBe(true)
    expect(isBoundNumberFormat('numeric')).toBe(false)
    expect(isBoundNumberFormat('DD/MM/YYYY')).toBe(false)
  })
})
