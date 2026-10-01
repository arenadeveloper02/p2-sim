import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { executeBingAdsQuery } from './execute'
import type { BingAdsV1Request } from './types'

export async function POST(request: NextRequest) {
  try {
    const body: BingAdsV1Request = await request.json()
    const workspaceId =
      body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined

    const result = await executeBingAdsQuery({ ...body, workspaceId }, {})
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Unknown error occurred'),
        details: 'Failed to process Bing Ads query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}
