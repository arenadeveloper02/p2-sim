import { db } from '@sim/db'
import { clientChannelMapping } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { asc, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'

const logger = createLogger('client-channel-mapping')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const requestId = crypto.randomUUID()
  const { clientId } = await params

  logger.info(`[${requestId}] Fetching channels for client`, { clientId })

  try {
    // First, check if table exists and has any records
    const allRecords = await db.select().from(clientChannelMapping).limit(10)
    console.log('📋 All records in client_channel_mapping table:', allRecords)

    // Log the exact query being executed
    console.log('🔍 Executing query:', {
      table: 'client_channel_mapping',
      where: { clientId },
      orderBy: 'channelName ASC',
    })

    // Fetch channels from client_channel_mapping table
    const channels = await db
      .select()
      .from(clientChannelMapping)
      .where(eq(clientChannelMapping.clientId, clientId))
      .orderBy(asc(clientChannelMapping.channelName))

    console.log('📊 Raw query result:', channels)
    console.log('📈 Channels found for client:', channels.length)

    logger.info(`[${requestId}] Found channels`, {
      clientId,
      channelCount: channels.length,
    })

    const responseData = {
      success: true,
      channels: channels.map((channel) => ({
        channel_id: channel.channelId,
        channel_name: channel.channelName,
      })),
    }

    console.log('📤 API Response:', responseData)

    return NextResponse.json(responseData)
  } catch (error) {
    logger.error(`[${requestId}] Error fetching channels`, {
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch channels',
      },
      { status: 500 }
    )
  }
}
