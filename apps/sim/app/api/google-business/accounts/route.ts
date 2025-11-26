import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { getOAuthToken } from '@/app/api/auth/oauth/utils'
import { listGBPAccounts, listGBPLocations } from '../gbp-api'

const logger = createLogger('GBP-Accounts')

/**
 * GET /api/google-business/accounts
 * Lists GBP accounts (and optionally their locations) for the connected user.
 *
 * Query params:
 *   includeLocations=true  -> also fetch locations for each account
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const includeLocations = searchParams.get('includeLocations') === 'true'

    // Get OAuth access token for google-business provider
    const accessToken = await getOAuthToken(userId, 'google-business')
    if (!accessToken) {
      logger.error(`[${requestId}] No OAuth token found for user`, { userId })
      return NextResponse.json(
        {
          error:
            'Google Business Profile not connected. Please connect your account in settings.',
        },
        { status: 403 }
      )
    }

    logger.info(`[${requestId}] Listing GBP accounts`, {
      userId,
      includeLocations,
    })

    const accounts = await listGBPAccounts(accessToken)

    if (!includeLocations) {
      // Return simplified account ids + raw data
      const simplified = accounts.map((account: any) => {
        const name: string = account.name || '' // e.g. "accounts/1234567890"
        const accountId = name.split('/')[1] || name
        return {
          accountId,
          resourceName: name,
          accountName: account.accountName,
          state: account.state,
        }
      })

      return NextResponse.json({ accounts: simplified })
    }

    // If includeLocations=true, also fetch locations for each account
    const accountsWithLocations = [] as any[]

    for (const account of accounts) {
      const name: string = account.name || ''
      const accountId = name.split('/')[1] || name

      try {
        const locations = await listGBPLocations(accessToken, accountId)
        const mappedLocations = (locations || []).map((loc: any) => {
          const locName: string = loc.name || '' // e.g. "accounts/123/locations/456"
          const parts = locName.split('/')
          const locationId = parts[parts.length - 1] || locName

          return {
            locationId,
            resourceName: locName,
            title: loc.title,
            storeCode: loc.storeCode,
            primaryCategory: loc.primaryCategory,
            address: loc.storefrontAddress,
          }
        })

        accountsWithLocations.push({
          accountId,
          resourceName: name,
          accountName: account.accountName,
          state: account.state,
          locations: mappedLocations,
        })
      } catch (error) {
        logger.error(`[${requestId}] Failed to list locations for account`, {
          accountId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        accountsWithLocations.push({
          accountId,
          resourceName: name,
          accountName: account.accountName,
          state: account.state,
          locationsError: true,
        })
      }
    }

    return NextResponse.json({ accounts: accountsWithLocations })
  } catch (error) {
    logger.error(`[${requestId}] Error listing GBP accounts`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
