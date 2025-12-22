import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'
import type { FyersQuoteParams } from './types'

const logger = createLogger('FyersQuoteTool')

export const fyersQuoteTool: ToolConfig<FyersQuoteParams, any> = {
  id: 'fyers_quote',
  name: 'Fyers Quote',
  description: 'Get live stock quotes from Fyers API for Indian stocks (NSE/BSE)',
  version: '1.0.0',

  params: {
    symbols: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Comma-separated stock symbols (e.g., "NSE:RELIANCE-EQ,NSE:TCS-EQ")',
    },
  },

  request: {
    url: () => '/api/fyers/quote',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: FyersQuoteParams) => ({
      symbols: params.symbols,
    }),
  },

  transformResponse: async (response: Response, params?: FyersQuoteParams) => {
    try {
      logger.info('Processing Fyers quote response', {
        status: response.status,
        symbols: params?.symbols,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Response not ok', { status: response.status, errorText })
        throw new Error(`Fyers API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Fyers quote response received', {
        success: data.success,
        quotesCount: data.quotes?.length || 0,
      })

      if (!data.success) {
        throw new Error(`Fyers API error: ${data.error || 'Unknown error'}`)
      }

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Fyers quote request failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  },
}
