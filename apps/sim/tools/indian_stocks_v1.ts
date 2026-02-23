/**
 * Indian Stocks V1 Tool
 * Autonomous AI-powered Indian stock market analysis and portfolio management
 */

import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('IndianStocksV1Tool')

export const indianStocksV1QueryTool: ToolConfig = {
  id: 'indian_stocks_v1_query',
  name: 'Indian Stocks AI Agent',
  description: 'Autonomous AI-powered Indian stock market analysis, screening, and portfolio optimization',
  version: '1.0.0',

  params: {
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Investment query in natural language (e.g., "Find best tech stocks under ₹1000")',
    },
    analysisType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Type of analysis: screening, analysis, portfolio, or alerts',
    },
    riskTolerance: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Risk tolerance: low, medium, or high',
    },
    investmentAmount: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Investment amount in rupees',
    },
    timeframe: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Investment timeframe: 1M, 3M, 6M, 1Y, 3Y, or 5Y',
    },
  },
  request: {
    url: '/api/indian-stocks-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => JSON.stringify({
      query: params.query,
      analysisType: params.analysisType || 'screening',
      riskTolerance: params.riskTolerance || 'medium',
      investmentAmount: params.investmentAmount || 100000,
      timeframe: params.timeframe || '1Y',
    }),
  },
  transformResponse: async (response: Response) => {
    try {
      const data = await response.json()
      
      if (!response.ok) {
        logger.error('Indian Stocks V1 API error:', data)
        throw new Error(data.error || 'Analysis failed')
      }

      logger.info('Indian Stocks V1 analysis completed successfully')
      return {
        success: true,
        output: data
      }
    } catch (error) {
      logger.error('Error processing Indian Stocks V1 response:', error)
      throw error
    }
  },
}

export default indianStocksV1QueryTool
