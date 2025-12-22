import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('FyersHistoricalAPI')

// Fyers API v3 endpoints
const FYERS_DATA_API = 'https://api-t1.fyers.in/data'

interface FyersHistoricalRequest {
  symbol: string
  resolution: string // "1", "5", "15", "30", "60", "D", "W", "M"
  dateFrom: string // YYYY-MM-DD or Unix timestamp
  dateTo: string // YYYY-MM-DD or Unix timestamp
}

// Convert date string to Unix timestamp
function toUnixTimestamp(dateStr: string): number {
  if (/^\d+$/.test(dateStr)) {
    return parseInt(dateStr, 10)
  }
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    logger.info('Fyers historical data request started')

    const body: FyersHistoricalRequest = await request.json()
    const { symbol, resolution, dateFrom, dateTo } = body

    if (!symbol) {
      return NextResponse.json({ error: 'No symbol provided' }, { status: 400 })
    }

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

    // Convert dates to Unix timestamps
    const rangeFrom = toUnixTimestamp(dateFrom)
    const rangeTo = toUnixTimestamp(dateTo)

    logger.info('Fetching historical data', {
      symbol,
      resolution: resolution || 'D',
      rangeFrom,
      rangeTo,
    })

    // Call Fyers History API
    const historyUrl = `${FYERS_DATA_API}/history`
    const response = await fetch(historyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${appId}:${accessToken}`,
      },
      body: JSON.stringify({
        symbol: symbol,
        resolution: resolution || 'D',
        date_format: 0, // 0 = epoch, 1 = yyyy-mm-dd
        range_from: rangeFrom,
        range_to: rangeTo,
        cont_flag: 1, // 1 = continuous data
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Fyers History API request failed', {
        status: response.status,
        error: errorText,
      })
      return NextResponse.json(
        { error: `Fyers API error: ${response.status} - ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    logger.info('Fyers History API response received', {
      code: data.code,
      message: data.message,
      candlesCount: data.candles?.length || 0,
    })

    // Check for API errors
    if (data.code !== 200 && data.s !== 'ok') {
      logger.error('Fyers History API returned error', { code: data.code, message: data.message })
      return NextResponse.json(
        { error: `Fyers API error: ${data.message || 'Unknown error'}` },
        { status: 400 }
      )
    }

    // Transform candles to our format
    // Fyers returns: [[timestamp, open, high, low, close, volume], ...]
    const candles = (data.candles || []).map((candle: number[]) => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
    }))

    const executionTime = Date.now() - startTime
    logger.info('Fyers historical request completed', {
      executionTime,
      candlesCount: candles.length,
    })

    return NextResponse.json({
      success: true,
      symbol,
      resolution: resolution || 'D',
      candles,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error('Fyers historical request failed', {
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
