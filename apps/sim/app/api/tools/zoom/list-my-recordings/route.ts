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

const logger = createLogger('ZoomListMyRecordingsAPI')

const ListMyRecordingsSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  from: z.string().nullish(),
  to: z.string().nullish(),
  pageSize: z.number().int().min(1).max(300).nullish(),
  nextPageToken: z.string().nullish(),
  trash: z.boolean().nullish(),
})

interface ZoomRecordingFile {
  id?: string
  meeting_id?: string
  recording_start?: string
  recording_end?: string
  file_type?: string
  file_extension?: string
  file_size?: number
  play_url?: string
  download_url?: string
  status?: string
  recording_type?: string
}

interface ZoomRecordingListItem {
  uuid?: string
  id?: number
  account_id?: string
  host_id?: string
  topic?: string
  type?: number
  start_time?: string
  duration?: number
  total_size?: number
  recording_count?: number
  share_url?: string
  recording_files?: ZoomRecordingFile[]
}

interface ZoomListRecordingsApiResponse {
  from?: string
  to?: string
  page_size?: number
  total_records?: number
  next_page_token?: string
  meetings?: ZoomRecordingListItem[]
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
      logger.warn(`[${requestId}] Unauthorized Zoom list my recordings attempt: ${authResult.error}`)
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
    const validated = ListMyRecordingsSchema.parse(body)
    const { accessToken, from, to, pageSize, nextPageToken, trash } = validated

    const baseUrl = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/recordings`
    const queryParams = new URLSearchParams()
    if (from) queryParams.append('from', from)
    if (to) queryParams.append('to', to)
    if (pageSize) queryParams.append('page_size', String(pageSize))
    if (nextPageToken) queryParams.append('next_page_token', nextPageToken)
    if (trash) queryParams.append('trash', 'true')

    const queryString = queryParams.toString()
    const apiUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl

    logger.info(`[${requestId}] Listing Zoom recordings for logged-in user`, {
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
            recordings: [],
            pageInfo: {
              from: from ?? '',
              to: to ?? '',
              pageSize: 0,
              totalRecords: 0,
            },
          },
        },
        { status: 400 }
      )
    }

    const data = (await response.json()) as ZoomListRecordingsApiResponse

    return NextResponse.json({
      success: true,
      output: {
        userEmail,
        recordings: (data.meetings || []).map((recording) => ({
          uuid: recording.uuid,
          id: recording.id,
          account_id: recording.account_id,
          host_id: recording.host_id,
          topic: recording.topic,
          type: recording.type,
          start_time: recording.start_time,
          duration: recording.duration,
          total_size: recording.total_size,
          recording_count: recording.recording_count,
          share_url: recording.share_url,
          recording_files: recording.recording_files || [],
        })),
        pageInfo: {
          from: data.from || from || '',
          to: data.to || to || '',
          pageSize: data.page_size || 0,
          totalRecords: data.total_records || 0,
          nextPageToken: data.next_page_token,
        },
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Error listing Zoom recordings for logged-in user:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
})
