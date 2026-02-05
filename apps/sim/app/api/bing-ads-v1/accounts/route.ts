/**
 * Bing Ads Accounts API Endpoint
 * Returns Bing Ads accounts from database
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getBingAdsAccounts } from '@/lib/channel-accounts'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const accounts = await getBingAdsAccounts()

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
        details: 'Failed to fetch Bing Ads accounts',
      },
      { status: 500 }
    )
  }
}
