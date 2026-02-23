import { ChartBarIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

export const IndianStocksV1Block: BlockConfig<ToolResponse> = {
  type: 'indian_stocks_v1',
  name: 'Indian Stocks AI Agent',
  description: 'Autonomous AI-powered Indian stock market analysis and portfolio optimization',
  longDescription:
    'Autonomous AI agent that analyzes Indian stocks, screens for opportunities, optimizes portfolios, and provides real-time alerts. Uses web scraping from NSE, Moneycontrol, and Yahoo Finance with AI-powered decision making.',
  docsLink: 'https://docs.sim.ai/tools/indian-stocks-v1',
  category: 'tools',
  bgColor: '#10b981',
  icon: ChartBarIcon,
  tools: {
    access: ['indian_stocks_v1_query'],
    config: {
      tool: () => 'indian_stocks_v1_query',
      params: (params: any) => ({
        query: params.query,
        analysisType: params.analysisType || 'screening',
        riskTolerance: params.riskTolerance || 'medium',
        investmentAmount: params.investmentAmount || 100000,
        timeframe: params.timeframe || '1Y',
      }),
    },
  },
  subBlocks: [
    {
      id: 'query',
      title: 'Investment Query',
      type: 'long-input',
      placeholder: 'e.g., "Find best technology stocks under ₹1000" or "Analyze RELIANCE stock"',
      rows: 3,
      wandConfig: {
        enabled: true,
        prompt: `You are an Indian stock market analysis assistant. Help users create effective investment queries.

### EXAMPLES OF GOOD QUERIES
- "Find best technology stocks under ₹1000 with strong fundamentals"
- "Analyze RELIANCE stock for investment opportunities"
- "Create portfolio for ₹50000 with medium risk tolerance"
- "Show market alerts for banking sector today"
- "Screen stocks with P/E ratio below 20 and high growth"

### QUERY TYPES
- Stock Screening: Find stocks based on criteria
- Stock Analysis: Deep dive into specific stocks
- Portfolio Optimization: Build optimal portfolios
- Market Alerts: Real-time opportunities and warnings

### TIPS
- Be specific about your investment goals
- Mention risk tolerance (low/medium/high)
- Include investment amount if relevant
- Specify timeframe if important`,
      },
    },
    {
      id: 'analysisType',
      title: 'Analysis Type',
      type: 'dropdown',
      options: [
        { id: 'screening', label: '🔍 Stock Screening - Find best stocks' },
        { id: 'analysis', label: '📊 Stock Analysis - Deep dive into specific stocks' },
        { id: 'portfolio', label: '💼 Portfolio Optimization - Build optimal portfolio' },
        { id: 'alerts', label: '🚨 Market Alerts - Real-time opportunities' },
      ],
      defaultValue: 'screening',
    },
    {
      id: 'riskTolerance',
      title: 'Risk Tolerance',
      type: 'dropdown',
      options: [
        { id: 'low', label: '🛡️ Low Risk - Conservative approach' },
        { id: 'medium', label: '⚖️ Medium Risk - Balanced approach' },
        { id: 'high', label: '🚀 High Risk - Aggressive growth' },
      ],
      defaultValue: 'medium',
    },
    {
      id: 'investmentAmount',
      title: 'Investment Amount (₹)',
      type: 'short-input',
      placeholder: '100000',
      defaultValue: '100000',
    },
    {
      id: 'timeframe',
      title: 'Investment Timeframe',
      type: 'dropdown',
      options: [
        { id: '1M', label: '1 Month - Short term' },
        { id: '3M', label: '3 Months - Short term' },
        { id: '6M', label: '6 Months - Medium term' },
        { id: '1Y', label: '1 Year - Medium term' },
        { id: '3Y', label: '3 Years - Long term' },
        { id: '5Y', label: '5 Years - Long term' },
      ],
      defaultValue: '1Y',
    },
  ],
  inputs: {
    query: {
      type: 'string',
    },
    analysisType: {
      type: 'string',
    },
    riskTolerance: {
      type: 'string',
    },
    investmentAmount: {
      type: 'number',
    },
    timeframe: {
      type: 'string',
    },
  },
  outputs: {
    success: { type: 'boolean', description: 'Whether the analysis succeeded' },
    query: { type: 'string', description: 'Original investment query' },
    analysisType: { type: 'string', description: 'Type of analysis performed' },
    timestamp: { type: 'string', description: 'Analysis timestamp' },
    results: { type: 'json' as any, description: 'Analysis results with recommendations' },
    metadata: { type: 'json', description: 'Execution metadata and confidence' },
  },
}
