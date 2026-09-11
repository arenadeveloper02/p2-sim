/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatBoundDisplay,
  formatBoundScalarDisplay,
} from '@/lib/arena-generative-ui/bound-display'

describe('formatBoundDisplay', () => {
  it('pretty-prints ISO dates by default and numbers only when named', () => {
    expect(formatBoundDisplay('2026-08-23')).toBe('Aug 23, 2026')
    expect(formatBoundDisplay('1234')).toBe('1234')
    expect(formatBoundDisplay('1234', 'currency')).toBe('$1,234.00')
    expect(formatBoundDisplay('2026-08-23', 'DD/MM/YYYY')).toBe('23/08/2026')
  })

  it('uses element numberFormat for numeric values', () => {
    expect(formatBoundScalarDisplay('1234', { numberFormat: 'integer' })).toBe('1,234')
    expect(formatBoundScalarDisplay('2026-08-23', { numberFormat: 'currency' })).toBe(
      'Aug 23, 2026'
    )
  })
})
