/**
 * Google Search Console Accounts API Route
 * Returns available GSC sites/properties
 */

import { type NextRequest, NextResponse } from 'next/server'
import { GSC_ACCOUNTS } from '../constants'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Transform accounts to API response format
    const accounts = Object.entries(GSC_ACCOUNTS).map(([key, account]) => ({
      id: key,
      name: account.name,
      url: account.url,
      property: account.property
    }))
    
    return NextResponse.json({
      success: true,
      accounts: accounts,
      count: Object.keys(GSC_ACCOUNTS).length
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to fetch GSC accounts'
      },
      { status: 500 }
    )
  }
}
