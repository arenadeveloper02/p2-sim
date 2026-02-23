/**
 * Indian Stocks V1 API Types
 * Autonomous AI-powered Indian stock market analysis
 */

export interface IndianStocksV1Request {
  query: string
  analysisType?: 'screening' | 'analysis' | 'portfolio' | 'alerts'
  riskTolerance?: 'low' | 'medium' | 'high'
  investmentAmount?: number
  timeframe?: '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y'
}

export interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  peRatio?: number
  debtToEquity?: number
  roe?: number
  revenueGrowth?: number
  eps?: number
  sector: string
  industry: string
  lastUpdated: string
}

export interface TechnicalIndicators {
  rsi: number
  macd: {
    signal: number
    histogram: number
    macd: number
  }
  movingAverages: {
    sma20: number
    sma50: number
    sma200: number
    ema12: number
    ema26: number
  }
  bollingerBands: {
    upper: number
    middle: number
    lower: number
  }
  stochastic: {
    k: number
    d: number
  }
}

export interface FundamentalData {
  marketCap: number
  revenue: number
  netIncome: number
  totalDebt: number
  bookValue: number
  currentRatio: number
  quickRatio: number
  grossMargin: number
  operatingMargin: number
  netMargin: number
  roe: number
  roa: number
  debtToEquity: number
  priceToBook: number
  priceToSales: number
  eps: number
  pegRatio?: number
}

export interface SentimentData {
  overall: number // -1 to 1 (negative to positive)
  news: number
  socialMedia: number
  analyst: number
  recentNews: Array<{
    title: string
    sentiment: number
    source: string
    timestamp: string
    url?: string
  }>
}

export interface StockAnalysis {
  symbol: string
  name: string
  currentPrice: number
  technicalScore: number // 0-100
  fundamentalScore: number // 0-100
  sentimentScore: number // 0-100
  overallScore: number // 0-100
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  targetPrice: number
  potentialReturn: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  timeHorizon: 'SHORT' | 'MEDIUM' | 'LONG'
  confidence: number // 0-100
  reasons: string[]
  warnings: string[]
  technicalIndicators: TechnicalIndicators
  fundamentalData: FundamentalData
  sentimentData: SentimentData
}

export interface PortfolioRecommendation {
  stocks: Array<{
    symbol: string
    name: string
    allocation: number // percentage
    buyPrice: number
    targetPrice: number
    stopLoss: number
    quantity: number
    reasoning: string
  }>
  expectedReturn: number
  riskScore: number // 0-100
  diversificationScore: number // 0-100
  rebalancingFrequency: string
  totalInvestment: number
}

export interface MarketAlert {
  type: 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'PRICE_ALERT' | 'NEWS_ALERT' | 'RISK_WARNING'
  symbol: string
  name: string
  message: string
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  currentPrice: number
  targetPrice?: number
  stopLoss?: number
  reasoning: string
  timestamp: string
  actionRequired: boolean
}

export interface MarketScreeningResult {
  totalStocks: number
  screenedStocks: StockAnalysis[]
  criteria: {
    marketCapMin?: number
    marketCapMax?: number
    peRatioMin?: number
    peRatioMax?: number
    debtToEquityMax?: number
    roeMin?: number
    sectors?: string[]
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  }
  sortBy: 'overall_score' | 'technical_score' | 'fundamental_score' | 'potential_return'
  sortOrder: 'desc' | 'asc'
  timestamp: string
}

export interface IndianStocksV1Response {
  success: boolean
  query: string
  analysisType: string
  timestamp: string
  data: {
    screening?: MarketScreeningResult
    analysis?: StockAnalysis
    portfolio?: PortfolioRecommendation
    alerts?: MarketAlert[]
  }
  metadata: {
    executionTime: number
    dataSources: string[]
    confidence: number
    riskLevel: string
  }
}

export interface ScrapedStockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  peRatio?: number
  sector?: string
  source: string
  timestamp: string
}

export interface AIProvider {
  provider: 'openai' | 'xai'
  model: string
  apiKey: string
}

export interface ScrapingResult {
  success: boolean
  data: ScrapedStockData[]
  errors: string[]
  source: string
  timestamp: string
}
