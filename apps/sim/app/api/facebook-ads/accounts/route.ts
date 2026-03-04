/**
 * Facebook Ads Accounts API Route
 * Fetches Facebook Ads accounts from database
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { getChannelAccounts } from '@/lib/channel-accounts'

const logger = createLogger('FacebookAdsAccountsAPI')

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  try {
    logger.info('Fetching Facebook Ads accounts from database', { requestId })

    // Get Facebook accounts from database
    const facebookAccounts = await getChannelAccounts('facebook')

    logger.info('Successfully fetched Facebook Ads accounts', {
      requestId,
      accountCount: Object.keys(facebookAccounts).length,
    })

    return NextResponse.json({
      success: true,
      accounts: facebookAccounts,
      count: Object.keys(facebookAccounts).length,
      requestId,
      timestamp,
    })
  } catch (error) {
    logger.error('Failed to fetch Facebook Ads accounts', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to fetch Facebook Ads accounts',
        requestId,
        timestamp,
      },
      { status: 500 }
    )
  }
}
