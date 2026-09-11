/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  boundDateSortValue,
  boundIsoDateOnly,
  formatBoundDateDisplay,
  isBoundRelativeDateFormat,
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

  it('formats relative calendar dates without shifting the day', () => {
    const now = new Date(2026, 8, 11, 12, 0, 0).getTime()
    expect(formatBoundDateDisplay('2026-09-11', 'relative', now)).toBe('today')
    expect(formatBoundDateDisplay('2026-09-10', 'ago', now)).toBe('yesterday')
    expect(formatBoundDateDisplay('2026-09-12', 'relative', now)).toBe('tomorrow')
    expect(formatBoundDateDisplay('2026-09-08', 'relative', now)).toBe('3 days ago')
    expect(formatBoundDateDisplay('2026-09-14', 'relative', now)).toBe('in 3 days')
    expect(formatBoundDateDisplay('not a date', 'relative', now)).toBe('not a date')
  })

  it('formats relative datetimes on a coarse minute/hour scale', () => {
    const now = Date.parse('2026-09-11T12:00:00.000Z')
    expect(formatBoundDateDisplay('2026-09-11T11:59:40.000Z', 'relative', now)).toBe('just now')
    expect(formatBoundDateDisplay('2026-09-11T11:50:00.000Z', 'relative', now)).toBe('10 minutes ago')
    expect(formatBoundDateDisplay('2026-09-11T10:00:00.000Z', 'relative', now)).toBe('2 hours ago')
    expect(formatBoundDateDisplay('2026-09-11T12:05:00.000Z', 'relative', now)).toBe('in 5 minutes')
  })
})

describe('relative date helpers', () => {
  it('recognises relative presets and sortable ISO values', () => {
    expect(isBoundRelativeDateFormat('relative')).toBe(true)
    expect(isBoundRelativeDateFormat('AGO')).toBe(true)
    expect(isBoundRelativeDateFormat('medium')).toBe(false)
    expect(boundIsoDateOnly('2026-08-24T06:28:56.717Z')).toBe('2026-08-24')
    expect(boundDateSortValue('2026-08-23')).toBe(Date.UTC(2026, 7, 23))
    expect(boundDateSortValue('nope')).toBeUndefined()
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
