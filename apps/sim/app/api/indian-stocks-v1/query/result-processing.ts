/**
 * Result Processing for Indian Stocks V1 API
 * Processes and formats AI analysis results
 */

import { createLogger } from '@sim/logger'
import { RECOMMENDATION_THRESHOLDS, SENTIMENT_THRESHOLDS, TECHNICAL_INDICATORS_CONFIG } from './constants'
import type { StockAnalysis, MarketScreeningResult, PortfolioRecommendation, MarketAlert, ScrapedStockData, StockData } from './types'

const logger = createLogger('IndianStocksResultProcessing')

/**
 * Processes scraped stock data and normalizes it
 */
export function processScrapedStockData(scrapedData: ScrapedStockData[]): StockData[] {
  const processedData: StockData[] = []
  
  for (const data of scrapedData) {
    try {
      const stockData: StockData = {
        symbol: data.symbol,
        name: data.name,
        price: data.price,
        change: data.change,
        changePercent: data.changePercent,
        volume: data.volume,
        marketCap: data.marketCap,
        peRatio: data.peRatio,
        sector: data.sector || 'Unknown',
        industry: 'Unknown', // Would need additional data
        lastUpdated: data.timestamp
      }
      
      processedData.push(stockData)
    } catch (error) {
      logger.error(`Error processing scraped data for ${data.symbol}:`, error)
    }
  }
  
  logger.info(`Processed ${processedData.length} stock data records`)
  return processedData
}

/**
 * Validates and enhances stock analysis
 */
export function validateStockAnalysis(analysis: StockAnalysis): StockAnalysis {
  // Validate recommendation based on scores
  if (analysis.overallScore >= RECOMMENDATION_THRESHOLDS.STRONG_BUY.min) {
    analysis.recommendation = 'STRONG_BUY'
  } else if (analysis.overallScore >= RECOMMENDATION_THRESHOLDS.BUY.min) {
    analysis.recommendation = 'BUY'
  } else if (analysis.overallScore >= RECOMMENDATION_THRESHOLDS.HOLD.min) {
    analysis.recommendation = 'HOLD'
  } else if (analysis.overallScore >= RECOMMENDATION_THRESHOLDS.SELL.min) {
    analysis.recommendation = 'SELL'
  } else {
    analysis.recommendation = 'STRONG_SELL'
  }

  // Calculate potential return if not provided
  if (analysis.potentialReturn === 0 && analysis.targetPrice > 0 && analysis.currentPrice > 0) {
    analysis.potentialReturn = ((analysis.targetPrice - analysis.currentPrice) / analysis.currentPrice) * 100
  }

  // Determine risk level based on volatility and other factors
  if (analysis.technicalIndicators?.rsi) {
    const rsi = analysis.technicalIndicators.rsi
    if (rsi > 70 || rsi < 30) {
      analysis.riskLevel = 'HIGH'
    } else if (rsi > 60 || rsi < 40) {
      analysis.riskLevel = 'MEDIUM'
    } else {
      analysis.riskLevel = 'LOW'
    }
  }

  // Determine time horizon based on analysis
  if (analysis.technicalScore > analysis.fundamentalScore) {
    analysis.timeHorizon = 'SHORT'
  } else if (analysis.fundamentalScore > analysis.technicalScore) {
    analysis.timeHorizon = 'LONG'
  } else {
    analysis.timeHorizon = 'MEDIUM'
  }

  // Add warnings based on technical indicators
  if (!analysis.warnings) {
    analysis.warnings = []
  }

  if (analysis.technicalIndicators?.rsi > 80) {
    analysis.warnings.push('RSI indicates overbought conditions')
  } else if (analysis.technicalIndicators?.rsi < 20) {
    analysis.warnings.push('RSI indicates oversold conditions')
  }

  if (analysis.fundamentalData?.debtToEquity && analysis.fundamentalData.debtToEquity > 2) {
    analysis.warnings.push('High debt-to-equity ratio')
  }

  if (analysis.fundamentalData?.priceToBook && analysis.fundamentalData.priceToBook > 10) {
    analysis.warnings.push('Very high Price-to-Book ratio may indicate overvaluation')
  }

  return analysis
}

/**
 * Processes market screening results
 */
export function processMarketScreeningResult(result: MarketScreeningResult): MarketScreeningResult {
  // Validate and enhance each stock analysis
  const enhancedStocks = result.screenedStocks.map(stock => validateStockAnalysis(stock))
  
  // Sort by overall score (descending)
  enhancedStocks.sort((a, b) => b.overallScore - a.overallScore)
  
  // Add sector distribution
  const sectorDistribution: Record<string, number> = {}
  enhancedStocks.forEach(stock => {
    const sector = stock.sentimentData?.recentNews?.[0]?.source.includes('Tech') ? 'Technology' :
                   stock.sentimentData?.recentNews?.[0]?.source.includes('Bank') ? 'Banking' :
                   stock.sentimentData?.recentNews?.[0]?.source.includes('Energy') ? 'Energy' :
                   stock.sentimentData?.recentNews?.[0]?.source.includes('Consumer') ? 'Consumer Goods' :
                   stock.sentimentData?.recentNews?.[0]?.source.includes('Pharma') ? 'Pharmaceuticals' : 'Unknown'
    sectorDistribution[sector] = (sectorDistribution[sector] || 0) + 1
  })

  // Filter stocks based on minimum confidence
  const filteredStocks = enhancedStocks.filter(stock => stock.confidence >= 50)

  const processedResult: MarketScreeningResult = {
    ...result,
    screenedStocks: filteredStocks,
    totalStocks: result.totalStocks,
    sortBy: 'overall_score',
    sortOrder: 'desc'
  }

  logger.info(`Processed screening result: ${filteredStocks.length} stocks after filtering`)
  return processedResult
}

/**
 * Validates and enhances portfolio recommendation
 */
export function validatePortfolioRecommendation(portfolio: PortfolioRecommendation): PortfolioRecommendation {
  // Validate total allocation sums to 100%
  const totalAllocation = portfolio.stocks.reduce((sum, stock) => sum + stock.allocation, 0)
  
  if (Math.abs(totalAllocation - 100) > 1) {
    logger.warn(`Portfolio allocation sums to ${totalAllocation}%, adjusting to 100%`)
    
    // Normalize allocations
    const normalizationFactor = 100 / totalAllocation
    portfolio.stocks.forEach(stock => {
      stock.allocation = Math.round(stock.allocation * normalizationFactor * 10) / 10
    })
  }

  // Validate minimum diversification
  if (portfolio.stocks.length < 8) {
    logger.warn(`Portfolio has only ${portfolio.stocks.length} stocks, minimum 8 recommended`)
  }

  // Calculate sector diversification
  const sectorAllocation: Record<string, number> = {}
  portfolio.stocks.forEach(stock => {
    const sector = stock.reasoning.includes('Technology') ? 'Technology' :
                   stock.reasoning.includes('Banking') ? 'Banking' :
                   stock.reasoning.includes('Energy') ? 'Energy' :
                   stock.reasoning.includes('Consumer') ? 'Consumer Goods' :
                   stock.reasoning.includes('Pharma') ? 'Pharmaceuticals' : 'Others'
    
    sectorAllocation[sector] = (sectorAllocation[sector] || 0) + stock.allocation
  })

  // Check for sector concentration risk
  Object.entries(sectorAllocation).forEach(([sector, allocation]) => {
    if (allocation > 30) {
      logger.warn(`High sector concentration: ${sector} at ${allocation}%`)
    }
  })

  // Calculate expected return if not provided
  if (portfolio.expectedReturn === 0) {
    portfolio.expectedReturn = portfolio.stocks.reduce((sum, stock) => {
      const stockReturn = ((stock.targetPrice - stock.buyPrice) / stock.buyPrice) * 100
      return sum + (stockReturn * stock.allocation / 100)
    }, 0)
  }

  // Calculate risk score based on portfolio composition
  if (portfolio.riskScore === 0) {
    portfolio.riskScore = Math.round(portfolio.stocks.reduce((sum, stock) => {
      const stockRisk = stock.reasoning.includes('HIGH') ? 80 :
                       stock.reasoning.includes('MEDIUM') ? 60 : 40
      return sum + (stockRisk * stock.allocation / 100)
    }, 0))
  }

  // Calculate diversification score
  const sectorCount = Object.keys(sectorAllocation).length
  const stockCount = portfolio.stocks.length
  portfolio.diversificationScore = Math.round((sectorCount / 10 * 50) + (stockCount / 20 * 50))

  return portfolio
}

/**
 * Processes and validates market alerts
 */
export function processMarketAlerts(alerts: MarketAlert[]): MarketAlert[] {
  const processedAlerts: MarketAlert[] = []
  
  for (const alert of alerts) {
    try {
      // Validate alert data
      if (!alert.symbol || !alert.type || !alert.message) {
        logger.warn('Invalid alert data, skipping')
        continue
      }

      // Set timestamp if not provided
      if (!alert.timestamp) {
        alert.timestamp = new Date().toISOString()
      }

      // Validate urgency levels
      if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(alert.urgency)) {
        alert.urgency = 'MEDIUM'
      }

      // Set action required based on type and urgency
      if (alert.type === 'BUY_SIGNAL' || alert.type === 'SELL_SIGNAL') {
        alert.actionRequired = true
      } else if (alert.urgency === 'HIGH' || alert.urgency === 'CRITICAL') {
        alert.actionRequired = true
      }

      processedAlerts.push(alert)
    } catch (error) {
      logger.error(`Error processing alert for ${alert.symbol}:`, error)
    }
  }

  // Sort alerts by urgency and timestamp
  processedAlerts.sort((a, b) => {
    const urgencyOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency]
    
    if (urgencyDiff !== 0) return urgencyDiff
    
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  logger.info(`Processed ${processedAlerts.length} market alerts`)
  return processedAlerts
}

/**
 * Calculates technical indicators from price data
 */
export function calculateTechnicalIndicators(prices: number[], volumes: number[]): any {
  if (prices.length < 20) {
    logger.warn('Insufficient data for technical indicators')
    return {}
  }

  const indicators: any = {}

  // Calculate RSI (14-period)
  if (prices.length >= 14) {
    const rsi = calculateRSI(prices, 14)
    indicators.rsi = rsi[rsi.length - 1]
  }

  // Calculate MACD
  if (prices.length >= 26) {
    const macd = calculateMACD(prices)
    indicators.macd = {
      macd: macd.macd[macd.macd.length - 1],
      signal: macd.signal[macd.signal.length - 1],
      histogram: macd.histogram[macd.histogram.length - 1]
    }
  }

  // Calculate Moving Averages
  if (prices.length >= 200) {
    indicators.movingAverages = {
      sma20: calculateSMA(prices, 20),
      sma50: calculateSMA(prices, 50),
      sma200: calculateSMA(prices, 200),
      ema12: calculateEMA(prices, 12),
      ema26: calculateEMA(prices, 26)
    }
  }

  // Calculate Bollinger Bands
  if (prices.length >= 20) {
    const bb = calculateBollingerBands(prices, 20, 2)
    indicators.bollingerBands = {
      upper: bb.upper[bb.upper.length - 1],
      middle: bb.middle[bb.middle.length - 1],
      lower: bb.lower[bb.lower.length - 1]
    }
  }

  return indicators
}

/**
 * Simple Moving Average calculation
 */
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0
  
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0)
  return sum / period
}

/**
 * Exponential Moving Average calculation
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0
  
  const multiplier = 2 / (period + 1)
  let ema = prices[0]
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }
  
  return ema
}

/**
 * RSI calculation
 */
function calculateRSI(prices: number[], period: number): number[] {
  const rsi: number[] = []
  let gains = 0
  let losses = 0
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    
    if (i <= period) {
      gains += change > 0 ? change : 0
      losses += change < 0 ? Math.abs(change) : 0
      
      if (i === period) {
        const avgGain = gains / period
        const avgLoss = losses / period
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
        rsi.push(100 - (100 / (1 + rs)))
      }
    } else {
      const prevGain = gains / period
      const prevLoss = losses / period
      
      gains = (prevGain * (period - 1)) + (change > 0 ? change : 0)
      losses = (prevLoss * (period - 1)) + (change < 0 ? Math.abs(change) : 0)
      
      const avgGain = gains / period
      const avgLoss = losses / period
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      rsi.push(100 - (100 / (1 + rs)))
    }
  }
  
  return rsi
}

/**
 * MACD calculation
 */
function calculateMACD(prices: number[]): any {
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  const macdLine = ema12 - ema26
  
  // For simplicity, using current values
  const signal = macdLine * 0.9 // Simplified signal calculation
  const histogram = macdLine - signal
  
  return {
    macd: [macdLine],
    signal: [signal],
    histogram: [histogram]
  }
}

/**
 * Bollinger Bands calculation
 */
function calculateBollingerBands(prices: number[], period: number, stdDev: number): any {
  const middle: number[] = []
  const upper: number[] = []
  const lower: number[] = []
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1)
    const sma = slice.reduce((a, b) => a + b, 0) / period
    
    const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period
    const standardDeviation = Math.sqrt(variance)
    
    middle.push(sma)
    upper.push(sma + (standardDeviation * stdDev))
    lower.push(sma - (standardDeviation * stdDev))
  }
  
  return { upper, middle, lower }
}
