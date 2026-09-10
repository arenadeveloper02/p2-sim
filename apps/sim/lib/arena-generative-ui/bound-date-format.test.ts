/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatBoundDateDisplay,
  splitBindingDateFormat,
} from '@/lib/arena-generative-ui/bound-date-format'

describe('formatBoundDateDisplay', () => {
  it('defaults ISO dates to a readable medium date', () => {
    expect(formatBoundDateDisplay('2026-08-23')).toBe('Aug 23, 2026')
    expect(formatBoundDateDisplay('not a date')).toBe('not a date')
  })

  it('honours presets and case-insensitive day/month/year patterns', () => {
    expect(formatBoundDateDisplay('2026-08-23', 'short')).toBe('Aug 23')
    expect(formatBoundDateDisplay('2026-08-23', 'long')).toBe('August 23, 2026')
    expect(formatBoundDateDisplay('2026-08-23', 'iso')).toBe('2026-08-23')
    expect(formatBoundDateDisplay('2026-08-23', 'numeric')).toBe('08/23/2026')
    expect(formatBoundDateDisplay('2026-08-23', 'numeric-eu')).toBe('23/08/2026')
    expect(formatBoundDateDisplay('2026-08-23', 'DD/MM/YYYY')).toBe('23/08/2026')
    expect(formatBoundDateDisplay('2026-08-23', 'dd/mm/yyyy')).toBe('23/08/2026')
    expect(formatBoundDateDisplay('2026-08-23', 'D MMM YYYY')).toBe('23 Aug 2026')
  })

  it('keeps the ISO calendar date when a datetime is formatted as a date', () => {
    expect(formatBoundDateDisplay('2026-08-24T06:28:56.717Z', 'YYYY-MM-DD')).toBe('2026-08-24')
    expect(formatBoundDateDisplay('2026-08-24T06:28:56.717Z', 'DD/MM/YYYY')).toBe('24/08/2026')
  })
})

describe('splitBindingDateFormat', () => {
  it('reads an optional pipe format off a binding token', () => {
    expect(splitBindingDateFormat('item.date')).toEqual({ name: 'item.date' })
    expect(splitBindingDateFormat('item.date|DD/MM/YYYY')).toEqual({
      name: 'item.date',
      format: 'DD/MM/YYYY',
    })
    expect(splitBindingDateFormat(' createdAt | numeric-eu ')).toEqual({
      name: 'createdAt',
      format: 'numeric-eu',
    })
  })
})
