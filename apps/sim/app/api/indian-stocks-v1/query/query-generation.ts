/**
 * Query Generation for Indian Stocks V1 API
 * AI-powered natural language to stock analysis conversion
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { getAIProviderConfig } from './ai-provider'
import { STOCK_ANALYSIS_SYSTEM_PROMPT, STOCK_SCREENING_PROMPT, PORTFOLIO_OPTIMIZATION_PROMPT, MARKET_ALERT_PROMPT, TECHNICAL_ANALYSIS_PROMPT } from './prompt'
import type { IndianStocksV1Request, StockAnalysis, MarketScreeningResult, PortfolioRecommendation, MarketAlert } from './types'

const logger = createLogger('IndianStocksQueryGeneration')

/**
 * Generates AI-powered stock screening analysis
 */
export async function generateStockScreening(request: IndianStocksV1Request): Promise<MarketScreeningResult> {
  const startTime = Date.now()
  
  try {
    logger.info(`Starting stock screening for query: ${request.query}`)
    
    const aiProvider = getAIProviderConfig()
    
    // Build screening criteria from request
    const criteria = buildScreeningCriteria(request)
    
    const prompt = STOCK_SCREENING_PROMPT
      .replace('{{marketCapFilter}}', criteria.marketCapFilter)
      .replace('{{peRatioFilter}}', criteria.peRatioFilter)
      .replace('{{debtToEquityFilter}}', criteria.debtToEquityFilter)
      .replace('{{roeFilter}}', criteria.roeFilter)
      .replace('{{sectorsFilter}}', criteria.sectorsFilter)
      .replace('{{riskLevel}}', criteria.riskLevel)
      .replace('{{timeHorizon}}', criteria.timeframe || '1Y')

    logger.info(`Generating AI-powered stock screening with ${aiProvider.provider}`)
    
    const aiResponse = await executeProviderRequest(aiProvider.provider, {
      model: aiProvider.model,
      systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT,
      context: `Screen Indian stocks based on: ${request.query}`,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      apiKey: aiProvider.apiKey,
      temperature: 0.1,
      maxTokens: 4000
    })

    const responseContent = typeof aiResponse === 'string' ? aiResponse : 
      'content' in aiResponse ? aiResponse.content : JSON.stringify(aiResponse)

    let screeningData
    try {
      screeningData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON for stock screening:', parseError)
      throw new Error('Failed to parse AI screening response')
    }

    const screeningResult: MarketScreeningResult = {
      totalStocks: screeningData.total_analyzed || 0,
      screenedStocks: screeningData.screening_results?.map((stock: any) => ({
        symbol: stock.symbol,
        name: stock.name,
        currentPrice: stock.current_price,
        technicalScore: stock.technical_score,
        fundamentalScore: stock.fundamental_score,
        sentimentScore: stock.sentiment_score,
        overallScore: stock.overall_score,
        recommendation: stock.recommendation,
        targetPrice: stock.target_price,
        potentialReturn: stock.potential_return,
        riskLevel: stock.risk_level,
        timeHorizon: stock.time_horizon,
        confidence: stock.confidence,
        reasons: stock.reasoning || [],
        warnings: stock.warnings || [],
        technicalIndicators: stock.technical_indicators,
        fundamentalData: stock.fundamental_data,
        sentimentData: stock.sentiment_data
      })) || [],
      criteria: criteria.screeningCriteria,
      sortBy: 'overall_score',
      sortOrder: 'desc',
      timestamp: new Date().toISOString()
    }

    const executionTime = Date.now() - startTime
    logger.info(`Stock screening completed in ${executionTime}ms. Found ${screeningResult.screenedStocks.length} stocks`)
    
    return screeningResult

  } catch (error) {
    logger.error('Stock screening generation failed:', error)
    throw new Error(`Stock screening failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates AI-powered stock analysis
 */
export async function generateStockAnalysis(symbol: string, request: IndianStocksV1Request): Promise<StockAnalysis> {
  const startTime = Date.now()
  
  try {
    logger.info(`Starting stock analysis for ${symbol}`)
    
    const aiProvider = getAIProviderConfig()
    
    const prompt = `Analyze ${symbol} stock in detail. ${request.query}
    
    Provide comprehensive analysis including:
    - Technical indicators and signals
    - Fundamental metrics and ratios
    - Market sentiment and news impact
    - Buy/sell/hold recommendation
    - Target price and stop-loss levels
    - Risk assessment and confidence level`

    logger.info(`Generating AI-powered stock analysis with ${aiProvider.provider}`)
    
    const aiResponse = await executeProviderRequest(aiProvider.provider, {
      model: aiProvider.model,
      systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT,
      context: `Analyze ${symbol} stock: ${request.query}`,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      apiKey: aiProvider.apiKey,
      temperature: 0.1,
      maxTokens: 3000
    })

    const responseContent = typeof aiResponse === 'string' ? aiResponse : 
      'content' in aiResponse ? aiResponse.content : JSON.stringify(aiResponse)

    let analysisData
    try {
      analysisData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON for stock analysis:', parseError)
      throw new Error('Failed to parse AI analysis response')
    }

    const stockAnalysis: StockAnalysis = {
      symbol: symbol,
      name: analysisData.name || symbol,
      currentPrice: analysisData.current_price || 0,
      technicalScore: analysisData.technical_score || 0,
      fundamentalScore: analysisData.fundamental_score || 0,
      sentimentScore: analysisData.sentiment_score || 0,
      overallScore: analysisData.overall_score || 0,
      recommendation: analysisData.recommendation || 'HOLD',
      targetPrice: analysisData.target_price || 0,
      potentialReturn: analysisData.potential_return || 0,
      riskLevel: analysisData.risk_level || 'MEDIUM',
      timeHorizon: analysisData.time_horizon || 'MEDIUM',
      confidence: analysisData.confidence || 50,
      reasons: analysisData.reasoning || [],
      warnings: analysisData.warnings || [],
      technicalIndicators: analysisData.technical_indicators || {},
      fundamentalData: analysisData.fundamental_data || {},
      sentimentData: analysisData.sentiment_data || {}
    }

    const executionTime = Date.now() - startTime
    logger.info(`Stock analysis completed in ${executionTime}ms for ${symbol}`)
    
    return stockAnalysis

  } catch (error) {
    logger.error(`Stock analysis failed for ${symbol}:`, error)
    throw new Error(`Stock analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates AI-powered portfolio optimization
 */
export async function generatePortfolioOptimization(request: IndianStocksV1Request): Promise<PortfolioRecommendation> {
  const startTime = Date.now()
  
  try {
    logger.info(`Starting portfolio optimization for query: ${request.query}`)
    
    const aiProvider = getAIProviderConfig()
    
    const prompt = PORTFOLIO_OPTIMIZATION_PROMPT
      .replace('{{investmentAmount}}', (request.investmentAmount || 100000).toString())
      .replace('{{riskTolerance}}', request.riskTolerance || 'MEDIUM')
      .replace('{{timeHorizon}}', request.timeframe || '1Y')
      .replace('{{investmentGoals}}', request.query)
      .replace('{{expectedReturn}}', '15-20')
      .replace('{{riskScore}}', request.riskTolerance === 'low' ? '40' : request.riskTolerance === 'high' ? '80' : '60')

    logger.info(`Generating AI-powered portfolio optimization with ${aiProvider.provider}`)
    
    const aiResponse = await executeProviderRequest(aiProvider.provider, {
      model: aiProvider.model,
      systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT,
      context: `Optimize portfolio for: ${request.query}`,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      apiKey: aiProvider.apiKey,
      temperature: 0.1,
      maxTokens: 4000
    })

    const responseContent = typeof aiResponse === 'string' ? aiResponse : 
      'content' in aiResponse ? aiResponse.content : JSON.stringify(aiResponse)

    let portfolioData
    try {
      portfolioData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON for portfolio optimization:', parseError)
      throw new Error('Failed to parse AI portfolio response')
    }

    const recommendation = portfolioData.portfolio_recommendation
    
    const portfolioRecommendation: PortfolioRecommendation = {
      stocks: recommendation.stocks?.map((stock: any) => ({
        symbol: stock.symbol,
        name: stock.name,
        allocation: stock.allocation,
        buyPrice: stock.buy_price,
        targetPrice: stock.target_price,
        stopLoss: stock.stop_loss,
        quantity: stock.quantity,
        reasoning: stock.reasoning
      })) || [],
      expectedReturn: recommendation.expected_return || 0,
      riskScore: recommendation.risk_score || 50,
      diversificationScore: recommendation.diversification_score || 50,
      rebalancingFrequency: recommendation.rebalancing_frequency || 'monthly',
      totalInvestment: recommendation.total_investment || request.investmentAmount || 100000
    }

    const executionTime = Date.now() - startTime
    logger.info(`Portfolio optimization completed in ${executionTime}ms`)
    
    return portfolioRecommendation

  } catch (error) {
    logger.error('Portfolio optimization failed:', error)
    throw new Error(`Portfolio optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates AI-powered market alerts
 */
export async function generateMarketAlerts(request: IndianStocksV1Request): Promise<MarketAlert[]> {
  const startTime = Date.now()
  
  try {
    logger.info(`Starting market alerts generation for query: ${request.query}`)
    
    const aiProvider = getAIProviderConfig()
    
    const prompt = MARKET_ALERT_PROMPT + `\n\nCurrent market context: ${request.query}
    Generate relevant alerts for current market conditions and opportunities.`

    logger.info(`Generating AI-powered market alerts with ${aiProvider.provider}`)
    
    const aiResponse = await executeProviderRequest(aiProvider.provider, {
      model: aiProvider.model,
      systemPrompt: STOCK_ANALYSIS_SYSTEM_PROMPT,
      context: `Generate market alerts: ${request.query}`,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      apiKey: aiProvider.apiKey,
      temperature: 0.1,
      maxTokens: 3000
    })

    const responseContent = typeof aiResponse === 'string' ? aiResponse : 
      'content' in aiResponse ? aiResponse.content : JSON.stringify(aiResponse)

    let alertsData
    try {
      alertsData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON for market alerts:', parseError)
      throw new Error('Failed to parse AI alerts response')
    }

    const marketAlerts: MarketAlert[] = alertsData.market_alerts?.map((alert: any) => ({
      type: alert.type,
      symbol: alert.symbol,
      name: alert.name,
      message: alert.message,
      urgency: alert.urgency,
      currentPrice: alert.current_price,
      targetPrice: alert.target_price,
      stopLoss: alert.stop_loss,
      reasoning: alert.reasoning,
      timestamp: alert.timestamp || new Date().toISOString(),
      actionRequired: alert.action_required || false
    })) || []

    const executionTime = Date.now() - startTime
    logger.info(`Market alerts generation completed in ${executionTime}ms. Generated ${marketAlerts.length} alerts`)
    
    return marketAlerts

  } catch (error) {
    logger.error('Market alerts generation failed:', error)
    throw new Error(`Market alerts failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Builds screening criteria from request
 */
function buildScreeningCriteria(request: IndianStocksV1Request) {
  const criteria: any = {
    marketCapFilter: 'No filter',
    peRatioFilter: 'No filter',
    debtToEquityFilter: 'No filter',
    roeFilter: 'No filter',
    sectorsFilter: 'All sectors',
    riskLevel: request.riskTolerance || 'MEDIUM',
    timeframe: request.timeframe || '1Y',
    screeningCriteria: {}
  }

  // Build screening criteria object
  criteria.screeningCriteria = {
    riskLevel: request.riskTolerance || 'MEDIUM',
    timeframe: request.timeframe || '1Y'
  }

  // Extract specific criteria from query if mentioned
  const queryLower = request.query.toLowerCase()
  
  if (queryLower.includes('large cap') || queryLower.includes('bluechip')) {
    criteria.marketCapFilter = 'Large Cap (>₹20,000 cr)'
    criteria.screeningCriteria.marketCapMin = 200000000000
  } else if (queryLower.includes('mid cap')) {
    criteria.marketCapFilter = 'Mid Cap (₹5,000-20,000 cr)'
    criteria.screeningCriteria.marketCapMin = 50000000000
    criteria.screeningCriteria.marketCapMax = 200000000000
  } else if (queryLower.includes('small cap')) {
    criteria.marketCapFilter = 'Small Cap (<₹5,000 cr)'
    criteria.screeningCriteria.marketCapMax = 50000000000
  }

  if (queryLower.includes('low pe') || queryLower.includes('value')) {
    criteria.peRatioFilter = 'Low P/E (<15)'
    criteria.screeningCriteria.peRatioMax = 15
  } else if (queryLower.includes('high pe') || queryLower.includes('growth')) {
    criteria.peRatioFilter = 'High P/E (>25)'
    criteria.screeningCriteria.peRatioMin = 25
  }

  if (queryLower.includes('low debt')) {
    criteria.debtToEquityFilter = 'Low Debt-to-Equity (<0.5)'
    criteria.screeningCriteria.debtToEquityMax = 0.5
  }

  if (queryLower.includes('high roe') || queryLower.includes('profitable')) {
    criteria.roeFilter = 'High ROE (>15%)'
    criteria.screeningCriteria.roeMin = 15
  }

  return criteria
}
