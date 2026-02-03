/**
 * Facebook Ads Accounts API Endpoint
 * Returns Facebook Ads accounts from database
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getFacebookAccounts } from '@/lib/channel-accounts'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const accounts = await getFacebookAccounts()
    
    return NextResponse.json({
      success: true,
      accounts: accounts,
      count: Object.keys(accounts).length
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to fetch Facebook Ads accounts'
      },
      { status: 500 }
    )
  }
}
