/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  addCalendarMonths,
  calendarItemsForCollection,
  defaultCalendarDateField,
  defaultCalendarTitleField,
  isoDateFromParts,
  isoDateInRange,
  monthGridDays,
  parseIsoDateParts,
  weekGridDays,
} from '@/lib/arena-generative-ui/gui-calendar'

describe('monthGridDays', () => {
  it('returns a 6-week Sunday-start grid without UTC drift', () => {
    const days = monthGridDays(2026, 9)
    expect(days).toHaveLength(42)
    expect(days[0]?.iso).toBe('2026-08-30')
    expect(days[0]?.inMonth).toBe(false)
    expect(days.find((day) => day.iso === '2026-09-01')?.inMonth).toBe(true)
    expect(parseIsoDateParts('2026-09-11')).toEqual({ year: 2026, month: 9, day: 11 })
    expect(isoDateFromParts(2026, 9, 5)).toBe('2026-09-05')
  })
})

describe('weekGridDays', () => {
  it('returns seven days starting Sunday', () => {
    const days = weekGridDays('2026-09-11')
    expect(days.map((day) => day.iso)).toEqual([
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ])
  })
})

describe('calendarItemsForCollection', () => {
  const items = [
    { title: 'Ship', date: '2026-09-11' },
    { name: 'Review', due: '2026-09-11T12:00:00.000Z' },
    { title: 'Backlog' },
  ]

  it('defaults date/title fields and keeps undated rows', () => {
    expect(defaultCalendarDateField(items)).toBe('date')
    expect(defaultCalendarTitleField(items, 'date')).toBe('title')
    const grouped = calendarItemsForCollection(items, 'date', 'title')
    expect(grouped.byDate.get('2026-09-11')?.map((entry) => entry.title)).toEqual(['Ship'])
    expect(grouped.unscheduled.map((entry) => entry.title)).toEqual(['Review', 'Backlog'])
  })

  it('honours min/max on ISO dates', () => {
    expect(isoDateInRange('2026-09-11', '2026-09-01', '2026-09-30')).toBe(true)
    expect(isoDateInRange('2026-08-31', '2026-09-01')).toBe(false)
    expect(addCalendarMonths({ year: 2026, month: 12, day: 1 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    })
  })
})
