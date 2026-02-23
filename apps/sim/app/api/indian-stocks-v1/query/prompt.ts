/**
 * Indian Stocks V1 AI Prompts
 * AI-powered stock analysis and recommendation prompts
 */

export const STOCK_ANALYSIS_SYSTEM_PROMPT = `You are an expert Indian stock market analyst with deep knowledge of NSE, BSE, and Indian economy. You have access to real-time market data, technical indicators, fundamental analysis, and market sentiment.

Your expertise includes:
- Technical analysis (RSI, MACD, Moving Averages, Bollinger Bands, Stochastic)
- Fundamental analysis (P/E ratios, debt-to-equity, ROE, profit margins)
- Market sentiment analysis (news, social media, analyst opinions)
- Indian market specifics (sector trends, regulatory environment, economic indicators)
- Risk assessment and portfolio optimization

Always provide:
1. Data-driven analysis with specific metrics
2. Clear buy/sell/hold recommendations
3. Risk assessment (LOW/MEDIUM/HIGH)
4. Confidence level (0-100%)
5. Specific reasoning and warnings
6. Target prices and stop-loss levels

Be conservative but identify opportunities. Prioritize capital preservation while seeking growth.`

export const STOCK_SCREENING_PROMPT = `Analyze and screen Indian stocks based on the following criteria. Return a JSON response with the top recommendations.

SCREENING CRITERIA:
- Market Cap: {{marketCapFilter}}
- P/E Ratio: {{peRatioFilter}}
- Debt-to-Equity: {{debtToEquityFilter}}
- ROE: {{roeFilter}}
- Sectors: {{sectorsFilter}}
- Risk Level: {{riskLevel}}
- Time Horizon: {{timeHorizon}}

ANALYSIS REQUIREMENTS:
1. Technical Analysis (40% weight):
   - RSI, MACD, Moving Averages
   - Chart patterns and trends
   - Volume analysis

2. Fundamental Analysis (40% weight):
   - P/E, P/B, P/S ratios
   - Debt-to-equity, current ratio
   - ROE, ROA, profit margins
   - Revenue and earnings growth

3. Market Sentiment (20% weight):
   - Recent news impact
   - Analyst recommendations
   - Social media sentiment

RETURN FORMAT:
{
  "screening_results": [
    {
      "symbol": "SYMBOL",
      "name": "Company Name",
      "current_price": 1234.56,
      "technical_score": 85,
      "fundamental_score": 78,
      "sentiment_score": 72,
      "overall_score": 82,
      "recommendation": "BUY|HOLD|SELL",
      "target_price": 1450.00,
      "potential_return": 17.5,
      "risk_level": "LOW|MEDIUM|HIGH",
      "time_horizon": "SHORT|MEDIUM|LONG",
      "confidence": 85,
      "reasoning": ["Clear technical breakout", "Strong fundamentals", "Positive sentiment"],
      "warnings": ["High volatility", "Sector risk"],
      "technical_indicators": {
        "rsi": 65.4,
        "macd": {"signal": 1.2, "histogram": 0.8, "macd": 2.0},
        "moving_averages": {"sma20": 1200, "sma50": 1150, "sma200": 1100, "ema12": 1220, "ema26": 1180},
        "bollinger_bands": {"upper": 1300, "middle": 1200, "lower": 1100},
        "stochastic": {"k": 75, "d": 70}
      },
      "fundamental_data": {
        "market_cap": 50000000000,
        "revenue": 10000000000,
        "net_income": 1500000000,
        "total_debt": 2000000000,
        "book_value": 8000000000,
        "current_ratio": 1.5,
        "quick_ratio": 1.2,
        "gross_margin": 25.5,
        "operating_margin": 18.2,
        "net_margin": 15.0,
        "roe": 18.75,
        "roa": 3.0,
        "debt_to_equity": 0.25,
        "price_to_book": 2.5,
        "price_to_sales": 5.0,
        "eps": 75.0
      },
      "sentiment_data": {
        "overall": 0.65,
        "news": 0.7,
        "social_media": 0.6,
        "analyst": 0.65,
        "recent_news": [
          {
            "title": "Company reports strong Q3 earnings",
            "sentiment": 0.8,
            "source": "Economic Times",
            "timestamp": "2026-02-20T10:30:00Z"
          }
        ]
      }
    }
  ],
  "total_analyzed": 150,
  "meeting_criteria": 12,
  "market_conditions": "BULLISH|BEARISH|NEUTRAL",
  "sector_trends": {
    "Technology": "STRONG",
    "Banking": "MODERATE",
    "Pharmaceuticals": "WEAK"
  }
}

Focus on quality over quantity. Only include stocks with strong fundamentals and positive technical signals. Always consider current market conditions and economic outlook.`

export const PORTFOLIO_OPTIMIZATION_PROMPT = `Create an optimal investment portfolio for Indian stocks based on the following parameters. Return a JSON response with detailed portfolio allocation.

INVESTMENT PARAMETERS:
- Investment Amount: ₹{{investmentAmount}}
- Risk Tolerance: {{riskTolerance}}
- Time Horizon: {{timeHorizon}}
- Investment Goals: {{investmentGoals}}

PORTFOLIO REQUIREMENTS:
1. Diversification across 8-12 stocks
2. Maximum 15% allocation to single stock
3. Maximum 30% exposure to any sector
4. Rebalancing frequency: Monthly
5. Expected return: {{expectedReturn}}%
6. Risk score: {{riskScore}}/100

ANALYSIS APPROACH:
1. Modern Portfolio Theory optimization
2. Risk-adjusted return maximization
3. Correlation analysis between stocks
4. Sector rotation strategy
5. Market condition adaptation

RETURN FORMAT:
{
  "portfolio_recommendation": {
    "total_investment": 100000,
    "expected_return": 18.5,
    "risk_score": 65,
    "diversification_score": 85,
    "rebalancing_frequency": "monthly",
    "stocks": [
      {
        "symbol": "RELIANCE",
        "name": "Reliance Industries",
        "allocation": 12.5,
        "buy_price": 2450.00,
        "target_price": 2800.00,
        "stop_loss": 2200.00,
        "quantity": 5,
        "reasoning": "Market leader, strong fundamentals, diversification benefits",
        "sector": "Energy",
        "beta": 0.8,
        "correlation_with_portfolio": 0.3
      }
    ],
    "sector_allocation": {
      "Technology": 25,
      "Banking": 20,
      "Energy": 15,
      "Consumer Goods": 15,
      "Pharmaceuticals": 10,
      "Others": 15
    },
    "risk_metrics": {
      "portfolio_beta": 0.9,
      "sharpe_ratio": 1.2,
      "max_drawdown": 15.5,
      "volatility": 18.2,
      "var_95": 8.5
    },
    "rebalancing_strategy": {
      "frequency": "monthly",
      "threshold": 5.0,
      "method": "target_allocation"
    },
    "market_conditions": "BULLISH",
    "economic_outlook": "POSITIVE",
    "key_risks": [
      "Market volatility",
      "Interest rate changes",
      "Sector rotation"
    ],
    "monitoring_alerts": [
      "Quarterly earnings review",
      "Monthly portfolio rebalancing",
      "Weekly market sentiment check"
    ]
  }
}

Prioritize capital preservation while seeking optimal returns. Consider current market conditions, economic outlook, and risk tolerance.`

export const MARKET_ALERT_PROMPT = `Generate real-time market alerts for Indian stocks based on current market conditions and analysis. Return a JSON response with actionable alerts.

ALERT GENERATION CRITERIA:
1. Price movements > 5% (positive or negative)
2. Volume spikes > 2x average
3. Technical breakouts/breakdowns
4. News sentiment shifts
5. Earnings surprises
6. Sector rotation signals

ALERT TYPES:
- BUY_SIGNAL: Strong technical/fundamental indicators
- SELL_SIGNAL: Negative indicators or overvaluation
- PRICE_ALERT: Significant price movements
- NEWS_ALERT: Market-moving news
- RISK_WARNING: Increased risk factors

RETURN FORMAT:
{
  "market_alerts": [
    {
      "type": "BUY_SIGNAL",
      "symbol": "TCS",
      "name": "Tata Consultancy Services",
      "message": "Strong breakout above resistance with high volume",
      "urgency": "HIGH",
      "current_price": 3850.00,
      "target_price": 4200.00,
      "stop_loss": 3650.00,
      "reasoning": "RSI bullish, MACD crossover, volume confirmation",
      "timestamp": "2026-02-20T10:30:00Z",
      "action_required": true,
      "technical_indicators": {
        "rsi": 72.5,
        "macd_signal": "BULLISH",
        "volume_ratio": 2.5
      },
      "fundamental_factors": [
        "Strong Q3 earnings",
        "Positive analyst outlook"
      ]
    }
  ],
  "market_summary": {
    "overall_sentiment": "BULLISH",
    "market_trend": "UPWARD",
    "volatility_index": "MODERATE",
    "sector_performance": {
      "Technology": "STRONG",
      "Banking": "MODERATE",
      "Energy": "WEAK"
    }
  }
}

Focus on actionable alerts with specific entry/exit points and clear reasoning.`

export const TECHNICAL_ANALYSIS_PROMPT = `Perform comprehensive technical analysis for Indian stock {{symbol}}. Return detailed technical indicators and patterns.

ANALYSIS REQUIREMENTS:
1. Price action analysis
2. Volume analysis
3. Technical indicators calculation
4. Chart pattern recognition
5. Support/resistance levels
6. Trend analysis

TECHNICAL INDICATORS:
- RSI (14-period)
- MACD (12, 26, 9)
- Moving Averages (20, 50, 200 SMA; 12, 26 EMA)
- Bollinger Bands (20, 2)
- Stochastic Oscillator (14, 3)
- ADX (14)
- Williams %R (14)

RETURN FORMAT:
{
  "technical_analysis": {
    "symbol": "SYMBOL",
    "current_price": 1234.56,
    "trend": "UPTREND|DOWNTREND|SIDEWAYS",
    "strength": "STRONG|MODERATE|WEAK",
    "indicators": {
      "rsi": {
        "value": 65.4,
        "signal": "OVERBOUGHT|NEUTRAL|OVERSOLD",
        "trend": "RISING|FALLING|STABLE"
      },
      "macd": {
        "macd": 2.5,
        "signal": 1.8,
        "histogram": 0.7,
        "crossover": "BULLISH|BEARISH|NONE",
        "signal": "BUY|SELL|HOLD"
      },
      "moving_averages": {
        "sma20": 1200,
        "sma50": 1150,
        "sma200": 1100,
        "ema12": 1220,
        "ema26": 1180,
        "crossover_signals": [
          {"type": "GOLDEN_CROSS", "status": "ACTIVE|PENDING|NONE"},
          {"type": "DEATH_CROSS", "status": "ACTIVE|PENDING|NONE"}
        ]
      },
      "bollinger_bands": {
        "upper": 1300,
        "middle": 1200,
        "lower": 1100,
        "bandwidth": 16.7,
        "position": "UPPER|MIDDLE|LOWER",
        "squeeze": "ACTIVE|NONE"
      },
      "stochastic": {
        "k": 75,
        "d": 70,
        "signal": "OVERBOUGHT|NEUTRAL|OVERSOLD"
      },
      "adx": {
        "value": 28.5,
        "trend_strength": "STRONG|MODERATE|WEAK"
      }
    },
    "support_resistance": {
      "support_levels": [1150, 1100, 1050],
      "resistance_levels": [1300, 1350, 1400],
      "key_levels": {
        "pivot": 1200,
        "breakout_target": 1350,
        "breakdown_target": 1050
      }
    },
    "chart_patterns": [
      {
        "pattern": "BULL_FLAG|BEAR_FLAG|HEAD_SHOULDERS|DOUBLE_TOP|DOUBLE_BOTTOM",
        "status": "FORMING|COMPLETED|FAILED",
        "target": 1350,
        "confidence": 75
      }
    ],
    "volume_analysis": {
      "current_volume": 1500000,
      "avg_volume": 1000000,
      "volume_ratio": 1.5,
      "trend": "INCREASING|DECREASING|STABLE",
      "accumulation_distribution": "ACCUMULATION|DISTRIBUTION|NEUTRAL"
    },
    "overall_signal": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
    "confidence": 85,
    "time_horizon": "SHORT|MEDIUM|LONG",
    "key_observations": [
      "RSI showing bullish momentum",
      "Volume confirms price action",
      "Approaching key resistance level"
    ]
  }
}

Provide specific technical insights with actionable recommendations.`
