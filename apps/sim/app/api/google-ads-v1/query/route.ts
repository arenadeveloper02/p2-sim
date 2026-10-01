import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { executeGoogleAdsV1Query } from './execute'
import type { GoogleAdsV1Request } from './types'

/**
 * POST /api/google-ads-v1/query
 *
 * Thin adapter over {@link executeGoogleAdsV1Query}.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body: GoogleAdsV1Request = await request.json()
    const workspaceId =
      body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined
    const userId = request.nextUrl.searchParams.get('userId') ?? undefined

    const result = await executeGoogleAdsV1Query(
      {
        ...body,
        workspaceId,
        userId,
      },
      { requestId }
    )
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Unknown error occurred'),
        details: 'Failed to process Google Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}
