import { createLogger } from '@sim/logger'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@sim/db'
import { clientChannelMapping } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackClientChannelsAPI')

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized client channels request: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    logger.info(`[${requestId}] Fetching channels for client: ${clientId}`)

    const channels = await db
      .select({
        id: clientChannelMapping.channelId,
        name: clientChannelMapping.channelName,
      })
      .from(clientChannelMapping)
      .where(eq(clientChannelMapping.clientId, clientId))
      .orderBy(clientChannelMapping.channelName)

    logger.info(`[${requestId}] Found ${channels.length} channels for client ${clientId}`)

    return NextResponse.json(
      {
        success: true,
        channels: channels.map((ch) => ({
          id: ch.id,
          label: ch.name,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error(`[${requestId}] Error fetching client channels:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while fetching client channels',
      },
      { status: 500 }
    )
  }
}

