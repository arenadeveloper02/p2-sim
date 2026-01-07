import { createLogger } from '@sim/logger'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@sim/db'
import { clientChannelMapping } from '@sim/db/schema'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackClientsAPI')

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized clients request: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    logger.info(`[${requestId}] Fetching unique client IDs`)

    // Get distinct client IDs from client_channel_mapping table
    const clients = await db
      .selectDistinct({
        clientId: clientChannelMapping.clientId,
      })
      .from(clientChannelMapping)
      .orderBy(clientChannelMapping.clientId)

    logger.info(`[${requestId}] Found ${clients.length} unique clients`)

    return NextResponse.json(
      {
        success: true,
        clients: clients.map((c) => ({
          id: c.clientId,
          label: c.clientId,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error(`[${requestId}] Error fetching clients:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while fetching clients',
      },
      { status: 500 }
    )
  }
}

