import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('FyersQuoteAPI')

// Fyers API v3 endpoints
const FYERS_API_BASE = 'https://api-t1.fyers.in/api/v3'

interface FyersQuoteRequest {
  symbols: string // Comma-separated symbols
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    logger.info('Fyers quote request started')

    const body: FyersQuoteRequest = await request.json()
    const { symbols } = body

    if (!symbols) {
      return NextResponse.json({ error: 'No symbols provided' }, { status: 400 })
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

    logger.info('Fetching quotes for symbols', { symbols })

    // Call Fyers Quotes API
    const quotesUrl = `${FYERS_API_BASE}/quotes`
    const response = await fetch(quotesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${appId}:${accessToken}`,
      },
      body: JSON.stringify({
        symbols: symbols,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Fyers API request failed', {
        status: response.status,
        error: errorText,
      })
      return NextResponse.json(
        { error: `Fyers API error: ${response.status} - ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    logger.info('Fyers API response received', {
      code: data.code,
      message: data.message,
      dataLength: data.d?.length || 0,
    })

    // Check for API errors
    if (data.code !== 200 && data.s !== 'ok') {
      logger.error('Fyers API returned error', { code: data.code, message: data.message })
      return NextResponse.json(
        { error: `Fyers API error: ${data.message || 'Unknown error'}` },
        { status: 400 }
      )
    }

    // Transform Fyers response to our format
    const quotes = (data.d || []).map((quote: any) => ({
      symbol: quote.n || quote.symbol,
      name: quote.n || quote.symbol,
      exchange: quote.n?.split(':')[0] || 'NSE',
      ltp: quote.v?.lp || 0, // Last traded price
      open: quote.v?.open_price || 0,
      high: quote.v?.high_price || 0,
      low: quote.v?.low_price || 0,
      close: quote.v?.prev_close_price || 0, // Previous close
      volume: quote.v?.volume || 0,
      change: quote.v?.ch || 0, // Price change
      changePercent: quote.v?.chp || 0, // Percentage change
      bid: quote.v?.bid || 0,
      ask: quote.v?.ask || 0,
      timestamp: quote.v?.tt || Date.now(),
      high52Week: quote.v?.high_52_week,
      low52Week: quote.v?.low_52_week,
    }))

    const executionTime = Date.now() - startTime
    logger.info('Fyers quote request completed', {
      executionTime,
      quotesCount: quotes.length,
    })

    return NextResponse.json({
      success: true,
      quotes,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error('Fyers quote request failed', {
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
