import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'
import type { FyersMarketStatusParams } from './types'

const logger = createLogger('FyersMarketStatusTool')

export const fyersMarketStatusTool: ToolConfig<FyersMarketStatusParams, any> = {
  id: 'fyers_market_status',
  name: 'Fyers Market Status',
  description: 'Get current market status (open/closed) for Indian exchanges (NSE/BSE)',
  version: '1.0.0',

  params: {},

  request: {
    url: () => '/api/fyers/market-status',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: () => ({}),
  },

  transformResponse: async (response: Response) => {
    try {
      logger.info('Processing Fyers market status response', {
        status: response.status,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Response not ok', { status: response.status, errorText })
        throw new Error(`Fyers API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Fyers market status response received', {
        success: data.success,
        statusCount: data.marketStatus?.length || 0,
      })

      if (!data.success) {
        throw new Error(`Fyers API error: ${data.error || 'Unknown error'}`)
      }

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Fyers market status request failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
