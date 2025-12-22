import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'
import type { FyersHistoricalParams } from './types'

const logger = createLogger('FyersHistoricalTool')

export const fyersHistoricalTool: ToolConfig<FyersHistoricalParams, any> = {
  id: 'fyers_historical',
  name: 'Fyers Historical Data',
  description: 'Get historical OHLCV data from Fyers API for Indian stocks (NSE/BSE)',
  version: '1.0.0',

  params: {
    symbol: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Stock symbol (e.g., "NSE:RELIANCE-EQ")',
    },
    resolution: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Candle resolution: "1", "5", "15", "30", "60" (minutes), "D" (day), "W" (week), "M" (month)',
    },
    dateFrom: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Start date (YYYY-MM-DD or Unix timestamp)',
    },
    dateTo: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'End date (YYYY-MM-DD or Unix timestamp)',
    },
  },

  request: {
    url: () => '/api/fyers/historical',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: FyersHistoricalParams) => ({
      symbol: params.symbol,
      resolution: params.resolution || 'D',
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    }),
  },

  transformResponse: async (response: Response, params?: FyersHistoricalParams) => {
    try {
      logger.info('Processing Fyers historical response', {
        status: response.status,
        symbol: params?.symbol,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Response not ok', { status: response.status, errorText })
        throw new Error(`Fyers API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Fyers historical response received', {
        success: data.success,
        candlesCount: data.candles?.length || 0,
      })

      if (!data.success) {
        throw new Error(`Fyers API error: ${data.error || 'Unknown error'}`)
      }

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Fyers historical request failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
