/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildScheduledSessions,
  getUpcomingOccurrences,
  shouldEnrichRecurringMeetings,
  type EnrichedZoomMeetingListItem,
} from '@/lib/zoom/meeting-enrichment'

describe('shouldEnrichRecurringMeetings', () => {
  it('enriches for upcoming list types', () => {
    expect(shouldEnrichRecurringMeetings('upcoming_meetings')).toBe(true)
    expect(shouldEnrichRecurringMeetings('upcoming')).toBe(true)
    expect(shouldEnrichRecurringMeetings('scheduled')).toBe(true)
    expect(shouldEnrichRecurringMeetings(undefined)).toBe(true)
  })

  it('skips enrichment for live and previous', () => {
    expect(shouldEnrichRecurringMeetings('live')).toBe(false)
    expect(shouldEnrichRecurringMeetings('previous_meetings')).toBe(false)
  })
})

describe('getUpcomingOccurrences', () => {
  it('filters deleted and past occurrences and sorts by start time', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const later = new Date(Date.now() + 172_800_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()

    const result = getUpcomingOccurrences([
      { occurrence_id: '2', start_time: later, duration: 30, status: 'available' },
      { occurrence_id: '1', start_time: future, duration: 30, status: 'available' },
      { occurrence_id: '3', start_time: past, duration: 30, status: 'available' },
      { occurrence_id: '4', start_time: future, duration: 30, status: 'deleted' },
    ])

    expect(result.map((o) => o.occurrence_id)).toEqual(['1', '2'])
  })
})

describe('buildScheduledSessions', () => {
  it('includes scheduled meetings and recurring occurrences', () => {
    const meetings: EnrichedZoomMeetingListItem[] = [
      {
        id: 1,
        topic: 'One-off',
        type: 2,
        start_time: '2026-05-21T10:00:00Z',
        meeting_type_label: 'scheduled',
        has_scheduled_start_time: true,
        is_recurring_template: false,
      },
      {
        id: 2,
        topic: 'Weekly',
        type: 3,
        meeting_type_label: 'recurring_no_fixed_time',
        has_scheduled_start_time: false,
        is_recurring_template: true,
        upcoming_occurrences: [
          {
            occurrence_id: 'occ-1',
            start_time: '2026-05-22T10:00:00Z',
            duration: 60,
            status: 'available',
          },
        ],
      },
    ]

    const sessions = buildScheduledSessions(meetings)
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatchObject({
      meeting_id: 1,
      source: 'scheduled',
      start_time: '2026-05-21T10:00:00Z',
    })
    expect(sessions[1]).toMatchObject({
      meeting_id: 2,
      source: 'recurring_occurrence',
      occurrence_id: 'occ-1',
      start_time: '2026-05-22T10:00:00Z',
    })
  })
})
