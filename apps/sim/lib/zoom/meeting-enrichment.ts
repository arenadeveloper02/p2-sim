import { createLogger } from '@sim/logger'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'

const logger = createLogger('ZoomMeetingEnrichment')

const ZOOM_API_BASE = 'https://api.zoom.us'

/** Meeting types that are recurring templates without a single list-level start_time. */
export const ZOOM_RECURRING_MEETING_TYPES = new Set([3, 8])

const MAX_RECURRING_ENRICHMENTS = 30
const ENRICHMENT_CONCURRENCY = 5
const MAX_UPCOMING_OCCURRENCES_PER_MEETING = 10

const UPCOMING_LIST_TYPES = new Set([
  'scheduled',
  'upcoming',
  'upcoming_meetings',
])

export const ZOOM_MEETING_TYPE_LABELS: Record<number, string> = {
  1: 'instant',
  2: 'scheduled',
  3: 'recurring_no_fixed_time',
  8: 'recurring_fixed_time',
}

export interface ZoomMeetingOccurrence {
  occurrence_id: string
  start_time: string
  duration: number
  status: string
}

export interface ZoomMeetingListBase {
  id: number
  uuid?: string
  host_id?: string
  topic?: string
  type?: number
  start_time?: string
  duration?: number
  timezone?: string
  agenda?: string
  created_at?: string
  join_url?: string
}

export interface EnrichedZoomMeetingListItem extends ZoomMeetingListBase {
  meeting_type_label: string
  has_scheduled_start_time: boolean
  is_recurring_template: boolean
  next_occurrence_start_time?: string
  upcoming_occurrences?: ZoomMeetingOccurrence[]
  recurrence?: ZoomMeetingRecurrence
  scheduling_note?: string
}

export interface ZoomScheduledSession {
  meeting_id: number
  topic: string
  start_time: string
  duration?: number
  timezone?: string
  join_url?: string
  occurrence_id?: string
  source: 'scheduled' | 'recurring_occurrence'
}

interface ZoomMeetingRecurrence {
  type?: number
  repeat_interval?: number
  weekly_days?: string
  monthly_day?: number
  monthly_week?: number
  monthly_week_day?: number
  end_times?: number
  end_date_time?: string
}

interface ZoomGetMeetingApiResponse {
  occurrences?: ZoomMeetingOccurrence[]
  recurrence?: ZoomMeetingRecurrence
}

function getMeetingTypeLabel(type?: number): string {
  if (type == null) return 'unknown'
  return ZOOM_MEETING_TYPE_LABELS[type] ?? `type_${type}`
}

function isUpcomingOccurrence(occurrence: ZoomMeetingOccurrence): boolean {
  if (occurrence.status === 'deleted') return false
  const start = new Date(occurrence.start_time)
  return !Number.isNaN(start.getTime()) && start.getTime() >= Date.now()
}

export function getUpcomingOccurrences(
  occurrences: ZoomMeetingOccurrence[]
): ZoomMeetingOccurrence[] {
  return occurrences
    .filter(isUpcomingOccurrence)
    .sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, MAX_UPCOMING_OCCURRENCES_PER_MEETING)
}

export function shouldEnrichRecurringMeetings(listType?: string | null): boolean {
  if (!listType) return true
  return UPCOMING_LIST_TYPES.has(listType)
}

interface ZoomMeetingDetail {
  occurrences: ZoomMeetingOccurrence[]
  recurrence?: ZoomMeetingRecurrence
}

async function fetchMeetingDetail(
  meetingId: number,
  accessToken: string,
  requestId: string
): Promise<ZoomMeetingDetail> {
  const apiUrl = `${ZOOM_API_BASE}/v2/meetings/${encodeURIComponent(String(meetingId))}`
  const urlValidation = await validateUrlWithDNS(apiUrl, 'apiUrl')
  if (!urlValidation.isValid) {
    logger.warn(`[${requestId}] Skipping occurrence fetch: invalid URL`, { meetingId })
    return []
  }

  const response = await secureFetchWithPinnedIP(apiUrl, urlValidation.resolvedIP!, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    logger.warn(`[${requestId}] Failed to fetch meeting occurrences`, {
      meetingId,
      status: response.status,
    })
    return { occurrences: [] }
  }

  const data = (await response.json()) as ZoomGetMeetingApiResponse
  return {
    occurrences: data.occurrences ?? [],
    recurrence: data.recurrence,
  }
}

async function enrichRecurringMeeting(
  meeting: ZoomMeetingListBase,
  accessToken: string,
  requestId: string
): Promise<EnrichedZoomMeetingListItem> {
  const detail = await fetchMeetingDetail(meeting.id, accessToken, requestId)
  const upcomingOccurrences = getUpcomingOccurrences(detail.occurrences)
  const nextOccurrenceStartTime = upcomingOccurrences[0]?.start_time
  const schedulingNote =
    upcomingOccurrences.length === 0
      ? 'Recurring template without concrete upcoming occurrences from Zoom. Do not use created_at as the meeting time; use recurrence rules or join when needed.'
      : undefined

  return {
    ...meeting,
    meeting_type_label: getMeetingTypeLabel(meeting.type),
    has_scheduled_start_time: Boolean(meeting.start_time),
    is_recurring_template: true,
    next_occurrence_start_time: nextOccurrenceStartTime,
    upcoming_occurrences:
      upcomingOccurrences.length > 0 ? upcomingOccurrences : undefined,
    recurrence: detail.recurrence,
    scheduling_note: schedulingNote,
  }
}

function enrichMeetingWithoutFetch(meeting: ZoomMeetingListBase): EnrichedZoomMeetingListItem {
  const hasScheduledStartTime = Boolean(meeting.start_time)
  const isRecurringTemplate =
    meeting.type != null &&
    ZOOM_RECURRING_MEETING_TYPES.has(meeting.type) &&
    !hasScheduledStartTime

  return {
    ...meeting,
    meeting_type_label: getMeetingTypeLabel(meeting.type),
    has_scheduled_start_time: hasScheduledStartTime,
    is_recurring_template: isRecurringTemplate,
    scheduling_note: isRecurringTemplate
      ? 'Recurring template without list-level start_time. Do not use created_at as the meeting time.'
      : undefined,
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

/**
 * Enriches list meetings with occurrence data for recurring templates (type 3/8)
 * that omit start_time on the list endpoint.
 */
export async function enrichZoomMeetingList(
  meetings: ZoomMeetingListBase[],
  accessToken: string,
  options: { listType?: string | null; requestId: string }
): Promise<EnrichedZoomMeetingListItem[]> {
  if (!shouldEnrichRecurringMeetings(options.listType)) {
    return meetings.map(enrichMeetingWithoutFetch)
  }

  const needsOccurrenceFetch = meetings.filter(
    (meeting) =>
      meeting.type != null &&
      ZOOM_RECURRING_MEETING_TYPES.has(meeting.type) &&
      !meeting.start_time
  )

  const toFetch = needsOccurrenceFetch.slice(0, MAX_RECURRING_ENRICHMENTS)
  if (needsOccurrenceFetch.length > MAX_RECURRING_ENRICHMENTS) {
    logger.warn(`[${options.requestId}] Capped recurring meeting enrichment`, {
      total: needsOccurrenceFetch.length,
      capped: MAX_RECURRING_ENRICHMENTS,
    })
  }

  const enrichedById = new Map<number, EnrichedZoomMeetingListItem>()
  if (toFetch.length > 0) {
    const enriched = await runWithConcurrency(
      toFetch,
      ENRICHMENT_CONCURRENCY,
      (meeting) => enrichRecurringMeeting(meeting, accessToken, options.requestId)
    )
    for (const item of enriched) {
      enrichedById.set(item.id, item)
    }
  }

  return meetings.map(
    (meeting) => enrichedById.get(meeting.id) ?? enrichMeetingWithoutFetch(meeting)
  )
}

/**
 * Flattened sessions with concrete start times for scheduling queries (e.g. "tomorrow").
 */
export function buildScheduledSessions(
  meetings: EnrichedZoomMeetingListItem[]
): ZoomScheduledSession[] {
  const sessions: ZoomScheduledSession[] = []

  for (const meeting of meetings) {
    const topic = meeting.topic ?? 'Untitled meeting'
    const base = {
      meeting_id: meeting.id,
      topic,
      duration: meeting.duration,
      timezone: meeting.timezone,
      join_url: meeting.join_url,
    }

    if (meeting.start_time) {
      sessions.push({
        ...base,
        start_time: meeting.start_time,
        source: 'scheduled',
      })
    }

    for (const occurrence of meeting.upcoming_occurrences ?? []) {
      sessions.push({
        ...base,
        start_time: occurrence.start_time,
        duration: occurrence.duration ?? meeting.duration,
        occurrence_id: occurrence.occurrence_id,
        source: 'recurring_occurrence',
      })
    }
  }

  return sessions.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )
}
