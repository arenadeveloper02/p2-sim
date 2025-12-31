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

    // Split symbols into batches of 50 (Fyers API limit)
    const symbolList = symbols.split(',')
    const BATCH_SIZE = 50
    const batches = []

    for (let i = 0; i < symbolList.length; i += BATCH_SIZE) {
      batches.push(symbolList.slice(i, i + BATCH_SIZE).join(','))
    }

    logger.info('Fetching quotes for symbols', {
      totalSymbols: symbolList.length,
      batches: batches.length
    })

    // fetchBatch helper
    const fetchBatch = async (batchSymbols: string) => {
      const quotesUrl = `${FYERS_API_BASE}/quotes`
      const response = await fetch(quotesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${appId}:${accessToken}`,
        },
        body: JSON.stringify({
          symbols: batchSymbols,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Fyers API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      // Check for API errors in response body
      if (data.code !== 200 && data.s !== 'ok') {
        throw new Error(`Fyers API error: ${data.message || 'Unknown error'}`)
      }

      return data.d || []
    }

    // Execute requests in parallel
    const results = await Promise.allSettled(batches.map(batch => fetchBatch(batch)))

    // Process results
    let allQuotes: any[] = []
    const errors: string[] = []

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allQuotes = [...allQuotes, ...result.value]
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : 'Unknown batch error')
      }
    })

    if (allQuotes.length === 0 && errors.length > 0) {
      // If all batches failed, return error
      logger.error('All Fyers API batches failed', { errors })
      return NextResponse.json(
        { error: `Requests failed: ${errors.join(', ')}` },
        { status: 500 }
      )
    }

    if (errors.length > 0) {
      logger.warn('Some batches failed', { errors })
    }

    // Transform Fyers response to our format
    const quotes = allQuotes.map((quote: any) => ({
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
      partialErrors: errors.length > 0 ? errors : undefined
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
