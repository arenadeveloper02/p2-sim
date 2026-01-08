import { createLogger } from '@sim/logger'
import { db } from '@sim/db'
import { account } from '@sim/db/schema'
import { getSession } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const logger = createLogger('DebugSlackAccount')

/**
 * Debug endpoint to check Slack account tokens
 * GET /api/debug/slack-account
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const slackAccounts = await db
      .select({
        id: account.id,
        accountId: account.accountId,
        providerId: account.providerId,
        userId: account.userId,
        hasAccessToken: !!account.accessToken,
        accessTokenPrefix: account.accessToken?.substring(0, 10) || null,
        accessTokenType: account.accessToken?.startsWith('xoxb-')
          ? 'bot'
          : account.accessToken?.startsWith('xoxp-')
            ? 'user'
            : account.accessToken?.startsWith('xoxa-')
              ? 'app'
              : 'unknown',
        hasIdToken: !!account.idToken,
        idTokenPrefix: account.idToken?.substring(0, 10) || null,
        idTokenType: account.idToken?.startsWith('xoxb-')
          ? 'bot'
          : account.idToken?.startsWith('xoxp-')
            ? 'user'
            : account.idToken?.startsWith('xoxa-')
              ? 'app'
              : 'unknown',
        scope: account.scope,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })
      .from(account)
      .where(eq(account.providerId, 'slack'))
      .orderBy(account.updatedAt)

    logger.info('Slack accounts retrieved:', {
      count: slackAccounts.length,
      userId: session.user.id,
    })

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      accounts: slackAccounts,
    })
  } catch (error) {
    logger.error('Error fetching Slack accounts:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
