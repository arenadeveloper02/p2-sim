/**
 * Indian Stocks V1 API Route
 * Autonomous AI-powered Indian stock market analysis
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { getAIProviderConfig } from './ai-provider'
import { generateStockScreening, generateStockAnalysis, generatePortfolioOptimization, generateMarketAlerts } from './query-generation'
import { processMarketScreeningResult, validateStockAnalysis, validatePortfolioRecommendation, processMarketAlerts } from './result-processing'
import { scrapeStockData, scrapeMarketIndices } from './stock-scraper'
import type { IndianStocksV1Request, IndianStocksV1Response } from './types'

const logger = createLogger('IndianStocksV1API')

/**
 * POST /api/indian-stocks-v1/query
 *
 * Handles autonomous Indian stock market analysis requests
 *
 * Request body:
 * - query: Natural language query (e.g., "find best tech stocks under ₹1000")
 * - analysisType: 'screening' | 'analysis' | 'portfolio' | 'alerts'
 * - riskTolerance: 'low' | 'medium' | 'high'
 * - investmentAmount: Investment amount in rupees
 * - timeframe: '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y'
 *
 * Response:
 * - success: boolean
 * - query: Original user query
 * - analysisType: Type of analysis performed
 * - data: Analysis results (screening, analysis, portfolio, alerts)
 * - metadata: Execution details and confidence
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  
  try {
    logger.info(`[${requestId}] Indian Stocks V1 API request started`)
    
    // Parse request body
    const body: IndianStocksV1Request = await request.json()
    const { query, analysisType = 'screening', riskTolerance = 'medium', investmentAmount = 100000, timeframe = '1Y' } = body
    
    // Validate required fields
    if (!query?.trim()) {
      return NextResponse.json({
        error: 'Query is required',
        example: 'Find best technology stocks with strong fundamentals',
        analysisTypes: ['screening', 'analysis', 'portfolio', 'alerts']
      }, { status: 400 })
    }

    logger.info(`[${requestId}] Processing ${analysisType} analysis for query: ${query}`)
    
    // Validate AI provider availability
    try {
      getAIProviderConfig()
    } catch (error) {
      logger.error(`[${requestId}] AI provider not available:`, error)
      return NextResponse.json({
        error: 'AI service not available. Please configure XAI_API_KEY or OPENAI_API_KEY.',
        details: 'This autonomous stock agent requires AI capabilities for analysis.'
      }, { status: 503 })
    }

    let responseData: any = {}
    let dataSources: string[] = []
    let confidence = 0

    // Process based on analysis type
    switch (analysisType) {
      case 'screening':
        logger.info(`[${requestId}] Starting stock screening analysis`)
        const screeningResult = await generateStockScreening({ query, analysisType, riskTolerance, investmentAmount, timeframe })
        const processedScreening = processMarketScreeningResult(screeningResult)
        responseData.screening = processedScreening
        dataSources = ['NSE', 'Moneycontrol', 'Yahoo Finance', 'AI Analysis']
        confidence = processedScreening.screenedStocks.length > 0 ? 85 : 40
        break

      case 'analysis':
        logger.info(`[${requestId}] Starting individual stock analysis`)
        
        // Extract stock symbols from query
        const symbols = extractStockSymbols(query)
        if (symbols.length === 0) {
          return NextResponse.json({
            error: 'No stock symbols found in query',
            example: 'Analyze RELIANCE or TCS stock',
            details: 'Please mention specific stock symbols for analysis'
          }, { status: 400 })
        }

        const analysisResults = []
        for (const symbol of symbols.slice(0, 3)) { // Limit to 3 stocks per request
          try {
            // Get current stock data
            const stockData = await scrapeStockData(symbol)
            
            // Generate AI analysis
            const analysis = await generateStockAnalysis(symbol, { query, analysisType, riskTolerance, investmentAmount, timeframe })
            const validatedAnalysis = validateStockAnalysis(analysis)
            
            analysisResults.push(validatedAnalysis)
            dataSources.push(...stockData.data.map(d => d.source))
          } catch (error) {
            logger.error(`[${requestId}] Failed to analyze ${symbol}:`, error)
          }
        }
        
        responseData.analysis = analysisResults
        dataSources = [...new Set(dataSources), 'AI Analysis']
        confidence = analysisResults.length > 0 ? 80 : 30
        break

      case 'portfolio':
        logger.info(`[${requestId}] Starting portfolio optimization`)
        const portfolioResult = await generatePortfolioOptimization({ query, analysisType, riskTolerance, investmentAmount, timeframe })
        const validatedPortfolio = validatePortfolioRecommendation(portfolioResult)
        responseData.portfolio = validatedPortfolio
        dataSources = ['AI Analysis', 'Market Data', 'Risk Models']
        confidence = validatedPortfolio.stocks.length > 0 ? 90 : 40
        break

      case 'alerts':
        logger.info(`[${requestId}] Starting market alerts generation`)
        
        // Get market indices data for context
        const marketData = await scrapeMarketIndices()
        
        const alertsResult = await generateMarketAlerts({ query, analysisType, riskTolerance, investmentAmount, timeframe })
        const processedAlerts = processMarketAlerts(alertsResult)
        responseData.alerts = processedAlerts
        dataSources = ['Market Data', 'News Sources', 'AI Analysis']
        confidence = processedAlerts.length > 0 ? 75 : 35
        break

      default:
        return NextResponse.json({
          error: 'Invalid analysis type',
          validTypes: ['screening', 'analysis', 'portfolio', 'alerts'],
          provided: analysisType
        }, { status: 400 })
    }

    const executionTime = Date.now() - startTime
    const riskLevel = determineRiskLevel(riskTolerance, responseData)

    const response: IndianStocksV1Response = {
      success: true,
      query,
      analysisType,
      timestamp: new Date().toISOString(),
      data: responseData,
      metadata: {
        executionTime,
        dataSources: [...new Set(dataSources)],
        confidence,
        riskLevel
      }
    }

    logger.info(`[${requestId}] Analysis completed successfully`, {
      executionTime,
      analysisType,
      confidence,
      dataSources: response.metadata.dataSources.length
    })

    return NextResponse.json(response)

  } catch (error) {
    const executionTime = Date.now() - startTime
    logger.error(`[${requestId}] Analysis failed:`, error)
    
    return NextResponse.json({
      success: false,
      query: 'Unknown',
      analysisType: 'unknown',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        executionTime,
        dataSources: [],
        confidence: 0,
        riskLevel: 'UNKNOWN'
      }
    }, { status: 500 })
  }
}

/**
 * Extracts stock symbols from natural language query
 */
function extractStockSymbols(query: string): string[] {
  const symbols: string[] = []
  
  // Common Indian stock symbols to look for
  const commonStocks = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'HINDUNILVR', 'SBIN', 'BHARTIARTL',
    'KOTAKBANK', 'LT', 'ITC', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'M&M', 'ASIANPAINT',
    'HCLTECH', 'NESTLEIND', 'TATAMOTORS', 'POWERGRID', 'BAJFINANCE', 'TITAN', 'DRREDDY',
    'WIPRO', 'ONGC', 'CIPLA', 'JSWSTEEL', 'TATASTEEL', 'COALINDIA', 'DIVISLAB', 'BPCL',
    'HEROMOTOCO', 'HINDALCO', 'UPL', 'SBILIFE', 'TECHM', 'GRASIM', 'SHRICHNG', 'ADANIPORTS',
    'NTPC', 'ULTRACEMCO', 'EICHERMOT', 'HDFCLIFE', 'TATACONSUM', 'BRITANNIA', 'DABUR',
    'PIDILITIND', 'IOC', 'GAIL', 'LUPIN', 'GMRINFRA', 'TATACOMM', 'GODREJCP', 'COLPAL'
  ]
  
  // Extract symbols from query
  const upperQuery = query.toUpperCase()
  
  for (const stock of commonStocks) {
    if (upperQuery.includes(stock)) {
      symbols.push(stock)
    }
  }
  
  // Also look for patterns like "SYMBOL:" or "SYMBOL "
  const symbolPattern = /\b([A-Z]{2,6})\b/g
  const matches = query.match(symbolPattern)
  
  if (matches) {
    for (const match of matches) {
      if (!symbols.includes(match) && match.length >= 2 && match.length <= 6) {
        symbols.push(match)
      }
    }
  }
  
  return [...new Set(symbols)] // Remove duplicates
}

/**
 * Determines risk level based on tolerance and analysis results
 */
function determineRiskLevel(tolerance: string, responseData: any): string {
  // Base risk level from user tolerance
  let riskLevel = tolerance.toUpperCase()
  
  // Adjust based on analysis results
  if (responseData.screening?.screenedStocks) {
    const highRiskStocks = responseData.screening.screenedStocks.filter((stock: any) => 
      stock.riskLevel === 'HIGH'
    ).length
    
    if (highRiskStocks > responseData.screening.screenedStocks.length / 2) {
      riskLevel = 'HIGH'
    }
  }
  
  if (responseData.portfolio?.riskScore) {
    if (responseData.portfolio.riskScore > 70) {
      riskLevel = 'HIGH'
    } else if (responseData.portfolio.riskScore < 40) {
      riskLevel = 'LOW'
    } else {
      riskLevel = 'MEDIUM'
    }
  }
  
  return riskLevel
}

/**
 * GET /api/indian-stocks-v1/query
 * Health check and API information
 */
export async function GET() {
  return NextResponse.json({
    name: 'Indian Stocks V1 API',
    version: '1.0.0',
    description: 'Autonomous AI-powered Indian stock market analysis agent',
    capabilities: [
      'Stock screening and analysis',
      'Portfolio optimization',
      'Technical and fundamental analysis',
      'Market sentiment analysis',
      'Real-time alerts',
      'Risk assessment'
    ],
    dataSources: [
      'NSE (National Stock Exchange)',
      'Moneycontrol',
      'Yahoo Finance',
      'Economic Times',
      'AI-powered analysis'
    ],
    analysisTypes: [
      'screening - Find best stocks based on criteria',
      'analysis - Deep dive into specific stocks',
      'portfolio - Optimize investment allocation',
      'alerts - Real-time market opportunities'
    ],
    endpoints: {
      'POST /api/indian-stocks-v1/query': 'Main analysis endpoint',
      'GET /api/indian-stocks-v1/query': 'API information'
    },
    features: {
      'autonomous': true,
      'real_time': true,
      'ai_powered': true,
      'multi_source': true,
      'risk_assessment': true
    }
  })
}
