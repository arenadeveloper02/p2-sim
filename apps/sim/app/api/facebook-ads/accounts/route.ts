/**
 * Facebook Ads Accounts API Endpoint
 * Returns Facebook Ads accounts from database
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getFacebookAdsAccounts } from '@/lib/channel-accounts'

const logger = createLogger('FacebookAdsAccountsAPI')

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const accounts = await getFacebookAdsAccounts()

    logger.info('Fetched Facebook Ads accounts', {
      count: Object.keys(accounts).length,
    })

    return NextResponse.json({
      success: true,
      accounts,
      count: Object.keys(accounts).length,
    })
  } catch (error) {
    logger.error('Failed to fetch Facebook Ads accounts', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to fetch Facebook Ads accounts',
      },
      { status: 500 }
    )
  }
}
