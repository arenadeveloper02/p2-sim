import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { zoomMeetingsSelectorContract } from '@/lib/api/contracts/selectors'
import { parseRequest } from '@/lib/api/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

const logger = createLogger('ZoomMeetingsAPI')

export const dynamic = 'force-dynamic'

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  try {
    const parsed = await parseRequest(zoomMeetingsSelectorContract, request, {})
    if (!parsed.success) return parsed.response
    const { credential, workflowId } = parsed.data.body

    const authz = await authorizeCredentialUse(request, {
      credentialId: credential,
      workflowId,
    })
    if (!authz.ok || !authz.credentialOwnerUserId) {
      return NextResponse.json({ error: authz.error || 'Unauthorized' }, { status: 403 })
    }

    const accessToken = await refreshAccessTokenIfNeeded(
      credential,
      authz.credentialOwnerUserId,
      requestId
    )
    if (!accessToken) {
      logger.error('Failed to get access token', {
        credentialId: credential,
        userId: authz.credentialOwnerUserId,
      })
      return NextResponse.json(
        { error: 'Could not retrieve access token', authRequired: true },
        { status: 401 }
      )
    }

    const meetingTypes = ['scheduled', 'live', 'upcoming'] as const

    // "Instant" meetings (created with type=1) are not reliably returned under `type=scheduled`.
    // For the meeting picker dropdown, fetch multiple list types and merge by id.
    const meetingsById = new Map<string, { id: string; name: string }>()

    for (const type of meetingTypes) {
      const response = await fetch(
        `https://api.zoom.us/v2/users/me/meetings?page_size=300&type=${encodeURIComponent(type)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        logger.warn('Failed to fetch Zoom meetings for type', {
          type,
          status: response.status,
          error: errorData,
        })
        continue
      }

      const data = (await response.json()) as {
        meetings?: Array<{ id: number; topic?: string }>
      }

      for (const meeting of data.meetings || []) {
        const id = String(meeting.id)
        meetingsById.set(id, { id, name: meeting.topic ?? '' })
      }
    }

    return NextResponse.json({ meetings: Array.from(meetingsById.values()) })
  } catch (error) {
    logger.error('Error processing Zoom meetings request:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve Zoom meetings', details: (error as Error).message },
      { status: 500 }
    )
  }
})
