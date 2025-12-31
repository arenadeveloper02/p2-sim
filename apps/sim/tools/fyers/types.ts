// Fyers API Types for Indian Stock Market

// Popular Nifty 50 stocks for quick selection
export const NIFTY_50_STOCKS = [
  { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance Industries' },
  { symbol: 'NSE:TCS-EQ', name: 'Tata Consultancy Services' },
  { symbol: 'NSE:HDFCBANK-EQ', name: 'HDFC Bank' },
  { symbol: 'NSE:INFY-EQ', name: 'Infosys' },
  { symbol: 'NSE:ICICIBANK-EQ', name: 'ICICI Bank' },
  { symbol: 'NSE:HINDUNILVR-EQ', name: 'Hindustan Unilever' },
  { symbol: 'NSE:SBIN-EQ', name: 'State Bank of India' },
  { symbol: 'NSE:BHARTIARTL-EQ', name: 'Bharti Airtel' },
  { symbol: 'NSE:ITC-EQ', name: 'ITC Limited' },
  { symbol: 'NSE:KOTAKBANK-EQ', name: 'Kotak Mahindra Bank' },
  { symbol: 'NSE:LT-EQ', name: 'Larsen & Toubro' },
  { symbol: 'NSE:AXISBANK-EQ', name: 'Axis Bank' },
  { symbol: 'NSE:ASIANPAINT-EQ', name: 'Asian Paints' },
  { symbol: 'NSE:MARUTI-EQ', name: 'Maruti Suzuki' },
  { symbol: 'NSE:SUNPHARMA-EQ', name: 'Sun Pharmaceutical' },
  { symbol: 'NSE:TITAN-EQ', name: 'Titan Company' },
  { symbol: 'NSE:BAJFINANCE-EQ', name: 'Bajaj Finance' },
  { symbol: 'NSE:WIPRO-EQ', name: 'Wipro' },
  { symbol: 'NSE:HCLTECH-EQ', name: 'HCL Technologies' },
  { symbol: 'NSE:ULTRACEMCO-EQ', name: 'UltraTech Cement' },
  { symbol: 'NSE:NESTLEIND-EQ', name: 'Nestle India' },
  { symbol: 'NSE:POWERGRID-EQ', name: 'Power Grid Corporation' },
  { symbol: 'NSE:NTPC-EQ', name: 'NTPC Limited' },
  { symbol: 'NSE:ONGC-EQ', name: 'Oil & Natural Gas Corporation' },
  { symbol: 'NSE:TATAMOTORS-EQ', name: 'Tata Motors' },
  { symbol: 'NSE:TATASTEEL-EQ', name: 'Tata Steel' },
  { symbol: 'NSE:JSWSTEEL-EQ', name: 'JSW Steel' },
  { symbol: 'NSE:ADANIENT-EQ', name: 'Adani Enterprises' },
  { symbol: 'NSE:ADANIPORTS-EQ', name: 'Adani Ports' },
  { symbol: 'NSE:TECHM-EQ', name: 'Tech Mahindra' },
  { symbol: 'NSE:INDUSINDBK-EQ', name: 'IndusInd Bank' },
  { symbol: 'NSE:BAJAJFINSV-EQ', name: 'Bajaj Finserv' },
  { symbol: 'NSE:COALINDIA-EQ', name: 'Coal India' },
  { symbol: 'NSE:GRASIM-EQ', name: 'Grasim Industries' },
  { symbol: 'NSE:CIPLA-EQ', name: 'Cipla' },
  { symbol: 'NSE:DRREDDY-EQ', name: 'Dr. Reddys Laboratories' },
  { symbol: 'NSE:DIVISLAB-EQ', name: 'Divis Laboratories' },
  { symbol: 'NSE:BRITANNIA-EQ', name: 'Britannia Industries' },
  { symbol: 'NSE:EICHERMOT-EQ', name: 'Eicher Motors' },
  { symbol: 'NSE:HEROMOTOCO-EQ', name: 'Hero MotoCorp' },
  { symbol: 'NSE:BAJAJ-AUTO-EQ', name: 'Bajaj Auto' },
  { symbol: 'NSE:M&M-EQ', name: 'Mahindra & Mahindra' },
  { symbol: 'NSE:APOLLOHOSP-EQ', name: 'Apollo Hospitals' },
  { symbol: 'NSE:SBILIFE-EQ', name: 'SBI Life Insurance' },
  { symbol: 'NSE:HDFCLIFE-EQ', name: 'HDFC Life Insurance' },
  { symbol: 'NSE:BPCL-EQ', name: 'Bharat Petroleum' },
  { symbol: 'NSE:HINDALCO-EQ', name: 'Hindalco Industries' },
  { symbol: 'NSE:TATACONSUM-EQ', name: 'Tata Consumer Products' },
  { symbol: 'NSE:UPL-EQ', name: 'UPL Limited' },
  { symbol: 'NSE:SHREECEM-EQ', name: 'Shree Cement' },
] as const

export const NIFTY_MIDCAP_100_STOCKS = [
  { symbol: 'NSE:ACC-EQ', name: 'ACC Ltd' },
  { symbol: 'NSE:ADANIPOWER-EQ', name: 'Adani Power' },
  { symbol: 'NSE:ASHOKLEY-EQ', name: 'Ashok Leyland' },
  { symbol: 'NSE:AUROPHARMA-EQ', name: 'Aurobindo Pharma' },
  { symbol: 'NSE:BANDHANBNK-EQ', name: 'Bandhan Bank' },
  { symbol: 'NSE:BANKINDIA-EQ', name: 'Bank of India' },
  { symbol: 'NSE:BHEL-EQ', name: 'Bharat Heavy Electricals' },
  { symbol: 'NSE:CANBK-EQ', name: 'Canara Bank' },
  { symbol: 'NSE:COFORGE-EQ', name: 'Coforge' },
  { symbol: 'NSE:CONCOR-EQ', name: 'Container Corporation' },
  { symbol: 'NSE:CUMMINSIND-EQ', name: 'Cummins India' },
  { symbol: 'NSE:DLF-EQ', name: 'DLF Limited' },
  { symbol: 'NSE:FEDERALBNK-EQ', name: 'Federal Bank' },
  { symbol: 'NSE:GODREJPROP-EQ', name: 'Godrej Properties' },
  { symbol: 'NSE:HAL-EQ', name: 'Hindustan Aeronautics' },
  { symbol: 'NSE:IDFCFIRSTB-EQ', name: 'IDFC First Bank' },
  { symbol: 'NSE:INDHOTEL-EQ', name: 'Indian Hotels' },
  { symbol: 'NSE:JINDALSTEL-EQ', name: 'Jindal Steel & Power' },
  { symbol: 'NSE:LUPIN-EQ', name: 'Lupin' },
  { symbol: 'NSE:MARICO-EQ', name: 'Marico' },
  { symbol: 'NSE:MPHASIS-EQ', name: 'Mphasis' },
  { symbol: 'NSE:MRF-EQ', name: 'MRF' },
  { symbol: 'NSE:NAUKRI-EQ', name: 'Info Edge' },
  { symbol: 'NSE:PAGEIND-EQ', name: 'Page Industries' },
  { symbol: 'NSE:PETRONET-EQ', name: 'Petronet LNG' },
  { symbol: 'NSE:PIIND-EQ', name: 'PI Industries' },
  { symbol: 'NSE:POLYCAB-EQ', name: 'Polycab India' },
  { symbol: 'NSE:REC-EQ', name: 'REC Limited' },
  { symbol: 'NSE:SRF-EQ', name: 'SRF Limited' },
  { symbol: 'NSE:TATACOMM-EQ', name: 'Tata Communications' },
  { symbol: 'NSE:TRENT-EQ', name: 'Trent' },
  { symbol: 'NSE:UBL-EQ', name: 'United Breweries' },
  { symbol: 'NSE:VOLTAS-EQ', name: 'Voltas' },
  { symbol: 'NSE:ZEEL-EQ', name: 'Zee Entertainment' },
] as const

export const NIFTY_SMALLCAP_100_STOCKS = [
  { symbol: 'NSE:AMBER-EQ', name: 'Amber Enterprises' },
  { symbol: 'NSE:BEML-EQ', name: 'BEML' },
  { symbol: 'NSE:BSOFT-EQ', name: 'Birlasoft' },
  { symbol: 'NSE:CASTROLIND-EQ', name: 'Castrol India' },
  { symbol: 'NSE:CDSL-EQ', name: 'CDSL' },
  { symbol: 'NSE:CESC-EQ', name: 'CESC' },
  { symbol: 'NSE:CHAMBLFERT-EQ', name: 'Chambal Fertilisers' },
  { symbol: 'NSE:CAMS-EQ', name: 'CAMS' },
  { symbol: 'NSE:CYIENT-EQ', name: 'Cyient' },
  { symbol: 'NSE:DELTACORP-EQ', name: 'Delta Corp' },
  { symbol: 'NSE:GNFC-EQ', name: 'GNFC' },
  { symbol: 'NSE:GRAPHITE-EQ', name: 'Graphite India' },
  { symbol: 'NSE:HAPPSTMNDS-EQ', name: 'Happiest Minds' },
  { symbol: 'NSE:HFCL-EQ', name: 'HFCL' },
  { symbol: 'NSE:IEX-EQ', name: 'IEX' },
  { symbol: 'NSE:INTELLECT-EQ', name: 'Intellect Design' },
  { symbol: 'NSE:KEC-EQ', name: 'KEC International' },
  { symbol: 'NSE:LALPATHLAB-EQ', name: 'Dr. Lal PathLabs' },
  { symbol: 'NSE:LATENTVIEW-EQ', name: 'LatentView Analytics' },
  { symbol: 'NSE:MCX-EQ', name: 'MCX' },
  { symbol: 'NSE:METROPOLIS-EQ', name: 'Metropolis Healthcare' },
  { symbol: 'NSE:NBCC-EQ', name: 'NBCC' },
  { symbol: 'NSE:NATIONALUM-EQ', name: 'National Aluminium' },
  { symbol: 'NSE:RAIN-EQ', name: 'Rain Industries' },
  { symbol: 'NSE:RBLBANK-EQ', name: 'RBL Bank' },
  { symbol: 'NSE:TANLA-EQ', name: 'Tanla Platforms' },
  { symbol: 'NSE:VIPIND-EQ', name: 'VIP Industries' },
] as const

// Fyers API Request Parameters
export interface FyersQuoteParams {
  symbols: string // Comma-separated symbols e.g., "NSE:RELIANCE-EQ,NSE:TCS-EQ"
  accessToken?: string
  appId?: string
}

export interface FyersHistoricalParams {
  symbol: string // Single symbol e.g., "NSE:RELIANCE-EQ"
  resolution: string // "1", "5", "15", "30", "60", "D", "W", "M"
  dateFrom: string // Unix timestamp or YYYY-MM-DD
  dateTo: string // Unix timestamp or YYYY-MM-DD
  accessToken?: string
  appId?: string
}

export interface FyersMarketStatusParams {
  accessToken?: string
  appId?: string
}

export interface FyersSearchParams {
  query: string // Search term e.g., "Reliance"
  accessToken?: string
  appId?: string
}

// Fyers API Response Types
export interface FyersQuoteData {
  symbol: string
  name: string
  exchange: string
  ltp: number // Last traded price
  open: number
  high: number
  low: number
  close: number // Previous close
  volume: number
  change: number // Price change
  changePercent: number // Percentage change
  bid: number
  ask: number
  timestamp: number
  high52Week?: number
  low52Week?: number
}

export interface FyersHistoricalCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface FyersMarketStatus {
  exchange: string
  segment: string
  marketType: string
  status: 'OPEN' | 'CLOSED' | 'PRE_OPEN' | 'POST_CLOSE'
  message?: string
}

export interface FyersSearchResult {
  symbol: string
  name: string
  exchange: string
  segment: string
  instrumentType: string
}

// Tool Response Types
export interface FyersQuoteResponse {
  success: boolean
  quotes: FyersQuoteData[]
  timestamp: string
  error?: string
}

export interface FyersHistoricalResponse {
  success: boolean
  symbol: string
  resolution: string
  candles: FyersHistoricalCandle[]
  timestamp: string
  error?: string
}

export interface FyersMarketStatusResponse {
  success: boolean
  marketStatus: FyersMarketStatus[]
  timestamp: string
  error?: string
}

export interface FyersSearchResponse {
  success: boolean
  results: FyersSearchResult[]
  timestamp: string
  error?: string
}

// Combined response for the block
export interface FyersBlockResponse {
  success: boolean
  operation: string
  data: FyersQuoteResponse | FyersHistoricalResponse | FyersMarketStatusResponse | FyersSearchResponse
  error?: string
}

// Technical Analysis Signals (for Function block preprocessing)
export interface TechnicalSignals {
  symbol: string
  name: string
  ltp: number
  change: number
  changePercent: number
  volume: number
  // Moving Averages
  sma20?: number
  sma50?: number
  sma200?: number
  maSignal?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  // RSI
  rsi14?: number
  rsiSignal?: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL'
  // Volume
  volumeAvg20?: number
  volumeSignal?: 'HIGH' | 'LOW' | 'NORMAL'
  // Overall
  overallSignal?: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  score?: number // 0-100 investment score
}

// Investment Recommendation (Agent output)
export interface InvestmentRecommendation {
  rank: number
  symbol: string
  name: string
  ltp: number
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID'
  confidenceScore: number // 0-100
  targetPrice?: number
  stopLoss?: number
  reasoning: string
  technicalFactors: string[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}
