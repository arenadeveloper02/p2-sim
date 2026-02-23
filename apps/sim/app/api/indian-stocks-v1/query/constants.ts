/**
 * Indian Stocks V1 API Constants
 * Market data sources and analysis parameters
 */

export const CURRENT_DATE = new Date().toISOString().split('T')[0]

export const DEFAULT_INVESTMENT_AMOUNT = 100000 // ₹1,00,000

export const ANALYSIS_TIMEFRAMES = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 1095,
  '5Y': 1825
} as const

export const RISK_LEVELS = {
  LOW: { maxVolatility: 15, maxDrawdown: 10, minScore: 70 },
  MEDIUM: { maxVolatility: 25, maxDrawdown: 20, minScore: 60 },
  HIGH: { maxVolatility: 40, maxDrawdown: 35, minScore: 50 }
} as const

export const INDIAN_MARKET_SECTORS = [
  'Technology',
  'Banking',
  'Pharmaceuticals',
  'Automobile',
  'Energy',
  'Telecom',
  'Consumer Goods',
  'Financial Services',
  'Infrastructure',
  'Metals & Mining',
  'Chemicals',
  'Textiles',
  'Real Estate',
  'Healthcare',
  'FMCG',
  'Insurance',
  'Media & Entertainment',
  'Logistics',
  'Agriculture',
  'Renewable Energy'
]

export const NIFTY_50_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'HINDUNILVR', 'SBIN', 'BHARTIARTL',
  'KOTAKBANK', 'LT', 'ITC', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'M&M', 'ASIANPAINT',
  'HCLTECH', 'NESTLEIND', 'TATAMOTORS', 'POWERGRID', 'BAJFINANCE', 'TITAN', 'DRREDDY',
  'WIPRO', 'ONGC', 'CIPLA', 'JSWSTEEL', 'TATASTEEL', 'COALINDIA', 'DIVISLAB', 'BPCL',
  'HEROMOTOCO', 'HINDALCO', 'UPL', 'SBILIFE', 'TECHM', 'GRASIM', 'SHRICHNG', 'ADANIPORTS',
  'NTPC', 'ULTRACEMCO', 'EICHERMOT', 'HDFCLIFE', 'TATACONSUM', 'BRITANNIA', 'DABUR',
  'PIDILITIND', 'IOC', 'GAIL', 'LUPIN', 'GMRINFRA', 'TATACOMM', 'GODREJCP', 'COLPAL',
  'MUTHOOTFIN', 'ICICIGI', 'HDFCAMC', 'PEL', 'BERGEPAINT', 'PAGEIND', 'VEDL', 'SIEMENS'
]

export const MAJOR_INDICES = {
  NIFTY_50: 'NSE:NIFTY-50',
  NIFTY_BANK: 'NSE:NIFTY-BANK',
  SENSEX: 'BSE:SENSEX',
  BANK_NIFTY: 'NSE:BANK-NIFTY'
} as const

export const SCRAPING_SOURCES = {
  NSE: {
    baseUrl: 'https://www.nseindia.com',
    stockUrl: 'https://www.nseindia.com/api/quote-equity',
    indicesUrl: 'https://www.nseindia.com/api/indices'
  },
  MONEYCONTROL: {
    baseUrl: 'https://www.moneycontrol.com',
    stockUrl: 'https://www.moneycontrol.com/financials',
    newsUrl: 'https://www.moneycontrol.com/news'
  },
  YAHOO_FINANCE: {
    baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
    quoteUrl: 'https://query2.finance.yahoo.com/v1/finance/search'
  },
  ECONOMIC_TIMES: {
    baseUrl: 'https://economictimes.indiatimes.com',
    marketUrl: 'https://economictimes.indiatimes.com/markets',
    newsUrl: 'https://economictimes.indiatimes.com/markets/stocks/news'
  }
} as const

export const TECHNICAL_INDICATORS_CONFIG = {
  RSI: { period: 14, overbought: 70, oversold: 30 },
  MACD: { fast: 12, slow: 26, signal: 9 },
  MOVING_AVERAGES: { sma20: 20, sma50: 50, sma200: 200, ema12: 12, ema26: 26 },
  BOLLINGER_BANDS: { period: 20, stdDev: 2 },
  STOCHASTIC: { kPeriod: 14, dPeriod: 3 }
} as const

export const FUNDAMENTAL_THRESHOLDS = {
  PE_RATIO: { min: 5, max: 50, ideal: 20 },
  DEBT_TO_EQUITY: { max: 2, ideal: 0.5 },
  ROE: { min: 10, ideal: 15 },
  CURRENT_RATIO: { min: 1, ideal: 1.5 },
  OPERATING_MARGIN: { min: 5, ideal: 15 },
  NET_MARGIN: { min: 2, ideal: 10 },
  PRICE_TO_BOOK: { min: 1, max: 10, ideal: 3 },
  PRICE_TO_SALES: { min: 1, max: 10, ideal: 3 }
} as const

export const SENTIMENT_THRESHOLDS = {
  VERY_POSITIVE: 0.6,
  POSITIVE: 0.2,
  NEUTRAL: 0,
  NEGATIVE: -0.2,
  VERY_NEGATIVE: -0.6
} as const

export const RECOMMENDATION_THRESHOLDS = {
  STRONG_BUY: { min: 85, confidence: 80 },
  BUY: { min: 70, confidence: 65 },
  HOLD: { min: 40, confidence: 50 },
  SELL: { min: 25, confidence: 40 },
  STRONG_SELL: { min: 0, confidence: 30 }
} as const

export const ALERT_THRESHOLDS = {
  PRICE_CHANGE: { positive: 5, negative: -5 }, // percentage
  VOLUME_SPIKE: { multiplier: 2 }, // 2x average volume
  RSI_EXTREME: { overbought: 80, oversold: 20 },
  SENTIMENT_SHIFT: { change: 0.3 }, // significant sentiment change
  TECHNICAL_BREAKOUT: { volumeMultiplier: 1.5, priceChange: 3 }
} as const

export const PORTFOLIO_CONSTRAINTS = {
  MAX_SINGLE_STOCK: 15, // max 15% in one stock
  MAX_SECTOR_EXPOSURE: 30, // max 30% in one sector
  MIN_DIVERSIFICATION: 8, // minimum 8 stocks
  MAX_TURNOVER: 0.5, // max 50% annual turnover
  REBALANCING_FREQUENCY: 'monthly' // rebalance monthly
} as const

export const SCRAPING_DELAY = 1000 // 1 second delay between requests
export const MAX_RETRIES = 3
export const REQUEST_TIMEOUT = 10000 // 10 seconds

export const CACHE_DURATION = {
  STOCK_PRICES: 60, // 1 minute
  TECHNICAL_INDICATORS: 300, // 5 minutes
  FUNDAMENTAL_DATA: 86400, // 24 hours
  NEWS_SENTIMENT: 1800, // 30 minutes
  MARKET_DATA: 300 // 5 minutes
} as const
