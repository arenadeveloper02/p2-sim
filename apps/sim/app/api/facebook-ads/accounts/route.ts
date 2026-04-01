import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@sim/logger'
import { db } from '@sim/db'
import { sql } from 'drizzle-orm'

const logger = createLogger('FacebookAdsAccounts')

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const result = await db.execute(sql`
      SELECT account_id, account_name 
      FROM channel_accounts 
      WHERE account_type = 'facebook' 
      ORDER BY account_name ASC
    `)

    const accounts: Record<string, { id: string; name: string }> = {}

    for (const row of result as unknown as Array<{ account_id: string; account_name: string }>) {
      const key = String(row.account_name)
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')

      accounts[key] = {
        id: String(row.account_id),
        name: String(row.account_name),
      }
    }

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
