import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { getOAuthToken } from '@/app/api/auth/oauth/utils'
import { listGBPLocations } from '../gbp-api'

const logger = createLogger('GBP-Locations')

/**
 * GET /api/google-business/locations?accountId=ACCOUNT_ID
 * Lists GBP locations for a specific Business Profile account.
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
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      logger.warn(`[${requestId}] Missing accountId`)
      return NextResponse.json({ error: 'Missing accountId query parameter' }, { status: 400 })
    }

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

    logger.info(`[${requestId}] Listing GBP locations`, { userId, accountId })

    const locations = await listGBPLocations(accessToken, accountId)

    const mappedLocations = (locations || []).map((loc: any) => {
      const name: string = loc.name || '' // e.g. "accounts/123/locations/456"
      const parts = name.split('/')
      const locationId = parts[parts.length - 1] || name

      return {
        locationId,
        resourceName: name,
        title: loc.title,
        storeCode: loc.storeCode,
        primaryCategory: loc.primaryCategory,
        address: loc.storefrontAddress,
      }
    })

    return NextResponse.json({ locations: mappedLocations })
  } catch (error) {
    logger.error(`[${requestId}] Error listing GBP locations`, {
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
