import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { executeFacebookAdsQuery } from './execute'
import type { FacebookAdsRequest } from './types'

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  try {
    const body: FacebookAdsRequest = await request.json()
    const workspaceId =
      body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined

    const result = await executeFacebookAdsQuery({ ...body, workspaceId }, { requestId })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Unknown error occurred'),
        requestId,
        timestamp,
      },
      { status: 500 }
    )
  }
}
