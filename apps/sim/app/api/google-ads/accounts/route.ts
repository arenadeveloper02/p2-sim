/**
 * Google Ads Accounts API Endpoint
 * Returns Google Ads accounts from database
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsAccounts } from '@/lib/channel-accounts'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? undefined
    const accounts = await getGoogleAdsAccounts(workspaceId)

    return NextResponse.json({
      success: true,
      accounts: accounts,
      count: Object.keys(accounts).length,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to fetch Google Ads accounts',
      },
      { status: 500 }
    )
  }
}
