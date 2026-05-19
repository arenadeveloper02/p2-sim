import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

const logger = createLogger('ZoomListMyMeetingsAPI')

const ListMyMeetingsSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  type: z
    .enum(['scheduled', 'live', 'upcoming', 'upcoming_meetings', 'previous_meetings'])
    .nullish(),
  pageSize: z.number().int().min(1).max(300).nullish(),
  nextPageToken: z.string().nullish(),
})

interface ZoomMeetingListItem {
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

interface ZoomListMeetingsApiResponse {
  meetings?: ZoomMeetingListItem[]
  page_count?: number
  page_number?: number
  page_size?: number
  total_records?: number
  next_page_token?: string
}

interface ZoomErrorResponse {
  message?: string
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  const email = row?.email?.trim()
  return email || null
}

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized Zoom list my meetings attempt: ${authResult.error}`)
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication required' },
        { status: 401 }
      )
    }

    const actorUserId =
      authResult.userId ?? new URL(request.url).searchParams.get('userId') ?? undefined
    if (!actorUserId) {
      return NextResponse.json(
        { success: false, error: 'Could not resolve logged-in user for this request' },
        { status: 400 }
      )
    }

    const userEmail = await resolveUserEmail(actorUserId)
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: 'Logged-in user does not have an email address' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validated = ListMyMeetingsSchema.parse(body)
    const { accessToken, type, pageSize, nextPageToken } = validated

    const baseUrl = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings`
    const queryParams = new URLSearchParams()
    if (type) queryParams.append('type', type)
    if (pageSize) queryParams.append('page_size', String(pageSize))
    if (nextPageToken) queryParams.append('next_page_token', nextPageToken)

    const queryString = queryParams.toString()
    const apiUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl

    logger.info(`[${requestId}] Listing Zoom meetings for logged-in user`, {
      userId: actorUserId,
      userEmail,
    })

    const urlValidation = await validateUrlWithDNS(apiUrl, 'apiUrl')
    if (!urlValidation.isValid) {
      return NextResponse.json({ success: false, error: urlValidation.error }, { status: 400 })
    }

    const response = await secureFetchWithPinnedIP(apiUrl, urlValidation.resolvedIP!, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ZoomErrorResponse
      logger.error(`[${requestId}] Zoom API error`, {
        status: response.status,
        userEmail,
        error: errorData,
      })
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || `Zoom API error: ${response.status}`,
          output: {
            userEmail,
            meetings: [],
            pageInfo: {
              pageCount: 0,
              pageNumber: 0,
              pageSize: 0,
              totalRecords: 0,
            },
          },
        },
        { status: 400 }
      )
    }

    const data = (await response.json()) as ZoomListMeetingsApiResponse

    return NextResponse.json({
      success: true,
      output: {
        userEmail,
        meetings: (data.meetings || []).map((meeting) => ({
          id: meeting.id,
          uuid: meeting.uuid,
          host_id: meeting.host_id,
          topic: meeting.topic,
          type: meeting.type,
          start_time: meeting.start_time,
          duration: meeting.duration,
          timezone: meeting.timezone,
          agenda: meeting.agenda,
          created_at: meeting.created_at,
          join_url: meeting.join_url,
        })),
        pageInfo: {
          pageCount: data.page_count || 0,
          pageNumber: data.page_number || 0,
          pageSize: data.page_size || 0,
          totalRecords: data.total_records || 0,
          nextPageToken: data.next_page_token,
        },
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Error listing Zoom meetings for logged-in user:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
})
