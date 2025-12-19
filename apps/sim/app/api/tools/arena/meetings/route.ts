import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

interface MeetingItem {
  itemId: string | null
  name: string | null
  description: string | null
  remarks: string | null
  priority: string | null
}

interface MeetingNote {
  noteId: string | null
  description: string | null
  type: 'CLIENT' | 'INTERNAL' | null
  completed: boolean | null
}

interface Meeting {
  meetingId: string
  name: string | null
  status: string | null
  date: string | null
  items: MeetingItem[]
  notes: MeetingNote[]
}

interface MeetingsResponse {
  clientId: string
  fetchedAt: string
  meetings: Meeting[]
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { workflowId, clientId, pageSize = 50 } = data

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
    }

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (tokenObject.found === false) {
      return NextResponse.json(
        { error: 'Failed to fetch meetings', details: tokenObject.reason },
        { status: 400 }
      )
    }

    const { arenaToken } = tokenObject
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL

    if (!arenaBackendBaseUrl) {
      return NextResponse.json({ error: 'Arena backend URL not configured' }, { status: 500 })
    }

    const headers = {
      accept: '*/*',
      authorisation: arenaToken || '',
    }

    const allMeetings: Meeting[] = []
    let pageNumber = 1
    let hasMorePages = true

    // Fetch all meetings using pagination
    while (hasMorePages) {
      const meetingsUrl = `${arenaBackendBaseUrl}/list/meetingservice/meetings?cid=${clientId}&pageNumber=${pageNumber}&noOfRecordsPerPage=${pageSize}`

      let meetingsResponse: Response
      let meetingsData: any

      try {
        meetingsResponse = await fetch(meetingsUrl, {
          method: 'GET',
          headers,
        })

        if (!meetingsResponse.ok) {
          break
        }

        meetingsData = await meetingsResponse.json()
      } catch (error) {
        break
      }

      const meetings = Array.isArray(meetingsData) ? meetingsData : meetingsData?.meetings || []

      if (meetings.length === 0) {
        hasMorePages = false
        break
      }

      // Process each meeting
      for (const meeting of meetings) {
        const meetingId = meeting.meetingId || meeting.id || meeting.sysId

        if (!meetingId) {
          continue
        }

        const processedMeeting: Meeting = {
          meetingId: String(meetingId),
          name: meeting.name || meeting.title || null,
          status: meeting.status || null,
          date: meeting.date || meeting.meetingDate || null,
          items: [],
          notes: [],
        }

        // Fetch meeting items
        try {
          const itemsUrl = `${arenaBackendBaseUrl}/list/meetingservice/meeting-items?meetingId=${meetingId}&cid=${clientId}`
          const itemsResponse = await fetch(itemsUrl, {
            method: 'GET',
            headers,
          })

          if (itemsResponse.ok) {
            const itemsData = await itemsResponse.json()
            const items = Array.isArray(itemsData) ? itemsData : itemsData?.items || []

            processedMeeting.items = items.map((item: any) => ({
              itemId: item.itemId || item.id || item.sysId || null,
              name: item.name || item.title || null,
              description: item.description || null,
              remarks: item.remarks || null,
              priority: item.priority || null,
            }))
          }
        } catch (error) {
          // Continue with empty items array
        }

        // Fetch meeting notes
        try {
          const notesUrl = `${arenaBackendBaseUrl}/meetings/meetingservice/meeting-notes?meetingId=${meetingId}`
          const notesResponse = await fetch(notesUrl, {
            method: 'GET',
            headers,
          })

          if (notesResponse.ok) {
            const notesData = await notesResponse.json()
            const notes = Array.isArray(notesData) ? notesData : notesData?.notes || []

            processedMeeting.notes = notes.map((note: any) => ({
              noteId: note.noteId || note.id || note.sysId || null,
              description: note.description || note.note || null,
              type: note.type === 'CLIENT' || note.type === 'INTERNAL' ? note.type : null,
              completed: typeof note.completed === 'boolean' ? note.completed : null,
            }))
          }
        } catch (error) {
          // Continue with empty notes array
        }

        allMeetings.push(processedMeeting)
      }

      // Check if there are more pages
      if (meetings.length < pageSize) {
        hasMorePages = false
      } else {
        pageNumber++
      }
    }

    const response: MeetingsResponse = {
      clientId,
      fetchedAt: new Date().toISOString(),
      meetings: allMeetings,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch meetings',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
