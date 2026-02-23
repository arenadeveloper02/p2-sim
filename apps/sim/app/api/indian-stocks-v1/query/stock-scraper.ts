/**
 * Stock Data Scraper for Indian Markets
 * Scrapes data from NSE, Moneycontrol, and Yahoo Finance
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { SCRAPING_SOURCES, SCRAPING_DELAY, MAX_RETRIES, REQUEST_TIMEOUT } from './constants'
import type { ScrapedStockData, ScrapingResult } from './types'

const logger = createLogger('IndianStocksScraper')

/**
 * Delays execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Makes HTTP request with retry logic
 */
async function makeRequest(url: string, options: RequestInit = {}, retries = 0): Promise<any> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...options.headers
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    if (retries < MAX_RETRIES) {
      logger.warn(`Request failed, retrying (${retries + 1}/${MAX_RETRIES}):`, error)
      await delay(SCRAPING_DELAY * (retries + 1))
      return makeRequest(url, options, retries + 1)
    }
    throw error
  }
}

/**
 * Scrapes stock data from NSE
 */
async function scrapeFromNSE(symbol: string): Promise<ScrapedStockData | null> {
  try {
    logger.info(`Scraping NSE data for ${symbol}`)
    
    const url = `${SCRAPING_SOURCES.NSE.stockUrl}?symbol=${symbol}`
    const data = await makeRequest(url)

    if (!data || !data.priceInfo) {
      logger.warn(`No data found for ${symbol} on NSE`)
      return null
    }

    const priceInfo = data.priceInfo
    const securityInfo = data.securityInfo || {}

    return {
      symbol: symbol,
      name: securityInfo.companyName || symbol,
      price: priceInfo.lastPrice || 0,
      change: priceInfo.change || 0,
      changePercent: priceInfo.pChange || 0,
      volume: priceInfo.totalTradedVolume || 0,
      marketCap: priceInfo.marketCap || 0,
      peRatio: priceInfo.pe,
      sector: securityInfo.segment || 'Unknown',
      source: 'NSE',
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    logger.error(`Error scraping NSE data for ${symbol}:`, error)
    return null
  }
}

/**
 * Scrapes stock data from Yahoo Finance
 */
async function scrapeFromYahooFinance(symbol: string): Promise<ScrapedStockData | null> {
  try {
    logger.info(`Scraping Yahoo Finance data for ${symbol}`)
    
    // Add .NS suffix for NSE stocks
    const yahooSymbol = symbol.endsWith('.NS') ? symbol : `${symbol}.NS`
    const url = `${SCRAPING_SOURCES.YAHOO_FINANCE.baseUrl}/${yahooSymbol}?interval=1d&range=1d`
    
    const data = await makeRequest(url)

    if (!data || !data.chart || !data.chart.result || data.chart.result.length === 0) {
      logger.warn(`No data found for ${symbol} on Yahoo Finance`)
      return null
    }

    const result = data.chart.result[0]
    const meta = result.meta
    const quote = result.indicators.quote[0]
    const latestPrice = quote.close[quote.close.length - 1] || meta.regularMarketPrice

    return {
      symbol: symbol,
      name: meta.longName || symbol,
      price: latestPrice || 0,
      change: meta.regularMarketPrice - meta.previousClose || 0,
      changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) || 0,
      volume: meta.regularMarketVolume || 0,
      marketCap: meta.marketCap || 0,
      source: 'Yahoo Finance',
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    logger.error(`Error scraping Yahoo Finance data for ${symbol}:`, error)
    return null
  }
}

/**
 * Scrapes stock data from Moneycontrol
 */
async function scrapeFromMoneycontrol(symbol: string): Promise<ScrapedStockData | null> {
  try {
    logger.info(`Scraping Moneycontrol data for ${symbol}`)
    
    // Use web search to find Moneycontrol data
    const searchQuery = `${symbol} stock price moneycontrol`
    
    const aiResponse = await executeProviderRequest('openai', {
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a financial data extractor. Extract current stock price information from web search results.',
      context: `Find current stock price for ${symbol}`,
      messages: [
        {
          role: 'user',
          content: `Search for current stock price of ${symbol} on Moneycontrol and provide the latest price, change, volume, and other key metrics. Return in JSON format.`
        }
      ],
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.1,
      maxTokens: 500
    })

    const responseContent = typeof aiResponse === 'string' ? aiResponse : 
      'content' in aiResponse ? aiResponse.content : JSON.stringify(aiResponse)

    try {
      const extractedData = JSON.parse(responseContent)
      
      return {
        symbol: symbol,
        name: extractedData.name || symbol,
        price: extractedData.price || 0,
        change: extractedData.change || 0,
        changePercent: extractedData.changePercent || 0,
        volume: extractedData.volume || 0,
        marketCap: extractedData.marketCap || 0,
        peRatio: extractedData.peRatio,
        sector: extractedData.sector,
        source: 'Moneycontrol',
        timestamp: new Date().toISOString()
      }
    } catch (parseError) {
      logger.error('Failed to parse Moneycontrol data:', parseError)
      return null
    }
  } catch (error) {
    logger.error(`Error scraping Moneycontrol data for ${symbol}:`, error)
    return null
  }
}

/**
 * Scrapes stock data from multiple sources with fallback
 */
export async function scrapeStockData(symbol: string): Promise<ScrapingResult> {
  const results: ScrapedStockData[] = []
  const errors: string[] = []
  const sources = ['NSE', 'Yahoo Finance', 'Moneycontrol']

  logger.info(`Starting stock data scraping for ${symbol}`)

  for (const source of sources) {
    try {
      await delay(SCRAPING_DELAY) // Respect rate limits

      let data: ScrapedStockData | null = null

      switch (source) {
        case 'NSE':
          data = await scrapeFromNSE(symbol)
          break
        case 'Yahoo Finance':
          data = await scrapeFromYahooFinance(symbol)
          break
        case 'Moneycontrol':
          data = await scrapeFromMoneycontrol(symbol)
          break
      }

      if (data) {
        results.push(data)
        logger.info(`Successfully scraped ${symbol} data from ${source}`)
      } else {
        errors.push(`No data available from ${source}`)
      }
    } catch (error) {
      const errorMessage = `Failed to scrape from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)
      logger.error(errorMessage)
    }
  }

  logger.info(`Scraping completed for ${symbol}. Success: ${results.length}, Errors: ${errors.length}`)

  return {
    success: results.length > 0,
    data: results,
    errors,
    source: 'Multi-source',
    timestamp: new Date().toISOString()
  }
}

/**
 * Scrapes multiple stocks in batch
 */
export async function scrapeMultipleStocks(symbols: string[]): Promise<ScrapingResult[]> {
  const results: ScrapingResult[] = []
  
  logger.info(`Starting batch scraping for ${symbols.length} symbols`)

  for (const symbol of symbols) {
    try {
      const result = await scrapeStockData(symbol)
      results.push(result)
      
      // Add delay between requests to avoid rate limiting
      await delay(SCRAPING_DELAY)
    } catch (error) {
      logger.error(`Failed to scrape ${symbol}:`, error)
      results.push({
        success: false,
        data: [],
        errors: [`Failed to scrape ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`],
        source: 'Multi-source',
        timestamp: new Date().toISOString()
      })
    }
  }

  logger.info(`Batch scraping completed. Total results: ${results.length}`)
  return results
}

/**
 * Scrapes market indices data
 */
export async function scrapeMarketIndices(): Promise<{ success: boolean; data: ScrapingResult[]; errors: string[]; source: string; timestamp: string }> {
  const indices = ['NIFTY-50', 'NIFTY-BANK', 'SENSEX', 'BANK-NIFTY']
  const results = await scrapeMultipleStocks(indices)
  
  return {
    success: results.some(r => r.success),
    data: results,
    errors: results.filter(r => !r.success).flatMap(r => r.errors),
    source: 'Multi-source',
    timestamp: new Date().toISOString()
  }
}
