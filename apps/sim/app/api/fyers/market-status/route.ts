import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('FyersMarketStatusAPI')

// Fyers API v3 endpoints
const FYERS_API_BASE = 'https://api-t1.fyers.in/api/v3'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    logger.info('Fyers market status request started')

    // Get Fyers credentials from environment
    const appId = process.env.FYERS_APP_ID
    const accessToken = process.env.FYERS_ACCESS_TOKEN

    if (!appId || !accessToken) {
      logger.error('Missing Fyers API credentials')
      return NextResponse.json(
        {
          error: 'Missing Fyers API credentials. Please set FYERS_APP_ID and FYERS_ACCESS_TOKEN environment variables.',
        },
        { status: 500 }
      )
    }

    logger.info('Fetching market status')

    // Call Fyers Market Status API
    const marketStatusUrl = `${FYERS_API_BASE}/market-status`
    const response = await fetch(marketStatusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${appId}:${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Fyers Market Status API request failed', {
        status: response.status,
        error: errorText,
      })
      return NextResponse.json(
        { error: `Fyers API error: ${response.status} - ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    logger.info('Fyers Market Status API response received', {
      code: data.code,
      message: data.message,
    })

    // Check for API errors
    if (data.code !== 200 && data.s !== 'ok') {
      logger.error('Fyers Market Status API returned error', { code: data.code, message: data.message })
      return NextResponse.json(
        { error: `Fyers API error: ${data.message || 'Unknown error'}` },
        { status: 400 }
      )
    }

    // Transform market status to our format
    const marketStatus = (data.marketStatus || data.d || []).map((status: any) => ({
      exchange: status.exchange || status.exch,
      segment: status.segment,
      marketType: status.market_type || status.marketType,
      status: status.status,
      message: status.message,
    }))

    const executionTime = Date.now() - startTime
    logger.info('Fyers market status request completed', {
      executionTime,
      statusCount: marketStatus.length,
    })

    return NextResponse.json({
      success: true,
      marketStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error('Fyers market status request failed', {
      error: errorMessage,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
