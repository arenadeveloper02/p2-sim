import { FyersIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import {
  NIFTY_50_STOCKS,
  NIFTY_MIDCAP_100_STOCKS,
  NIFTY_SMALLCAP_100_STOCKS,
} from '@/tools/fyers/types'

// Create dropdown options from Nifty 50 stocks
const stockOptions = NIFTY_50_STOCKS.map((stock) => ({
  label: stock.name,
  id: stock.symbol,
}))

const midcapStockOptions = NIFTY_MIDCAP_100_STOCKS.map((stock) => ({
  label: stock.name,
  id: stock.symbol,
}))

const smallcapStockOptions = NIFTY_SMALLCAP_100_STOCKS.map((stock) => ({
  label: stock.name,
  id: stock.symbol,
}))

export const FyersBlock: BlockConfig = {
  type: 'fyers',
  name: 'Fyers',
  description: 'Indian stock market data (NSE/BSE)',
  longDescription:
    'Access live quotes, historical data, and market status for Indian stocks via Fyers API. Supports Nifty 50 stocks and custom symbols. Perfect for building investment analysis workflows.',
  docsLink: 'https://docs.sim.ai/tools/fyers',
  category: 'tools',
  bgColor: '#1E88E5',
  icon: FyersIcon,
  subBlocks: [
    // Operation selector
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Get Live Quotes', id: 'quote' },
        { label: 'Get Historical Data', id: 'historical' },
        { label: 'Get Market Status', id: 'market_status' },
      ],
      value: () => 'quote',
    },
    // Stock selection mode
    {
      id: 'stockMode',
      title: 'Stock Selection',
      type: 'dropdown',
      options: [
        { label: 'Select from Nifty 50', id: 'nifty50' },
        { label: 'Select from Nifty Midcap', id: 'nifty_midcap' },
        { label: 'Select from Nifty Smallcap', id: 'nifty_smallcap' },
        { label: 'Enter Custom Symbols', id: 'custom' },
        { label: 'All Nifty 50 Stocks', id: 'all_nifty50' },
        { label: 'All Nifty Midcap Stocks', id: 'all_nifty_midcap' },
        { label: 'All Nifty Smallcap Stocks', id: 'all_nifty_smallcap' },
      ],
      value: () => 'nifty50',
      condition: { field: 'operation', value: ['quote', 'historical'] },
    },
    // Nifty 50 stock selector (multi-select)
    {
      id: 'selectedStocks',
      title: 'Select Stocks (Nifty 50)',
      type: 'dropdown',
      options: stockOptions,
      placeholder: 'Select stocks from Nifty 50...',
      condition: {
        field: 'stockMode',
        value: 'nifty50',
      },
    },
    // Nifty Midcap selector
    {
      id: 'selectedMidcapStocks',
      title: 'Select Stocks (Midcap)',
      type: 'dropdown',
      options: midcapStockOptions,
      placeholder: 'Select stocks from Nifty Midcap...',
      condition: {
        field: 'stockMode',
        value: 'nifty_midcap',
      },
    },
    // Nifty Smallcap selector
    {
      id: 'selectedSmallcapStocks',
      title: 'Select Stocks (Smallcap)',
      type: 'dropdown',
      options: smallcapStockOptions,
      placeholder: 'Select stocks from Nifty Smallcap...',
      condition: {
        field: 'stockMode',
        value: 'nifty_smallcap',
      },
    },
    // Custom symbols input
    {
      id: 'customSymbols',
      title: 'Stock Symbols',
      type: 'long-input',
      placeholder: 'Enter symbols separated by comma (e.g., NSE:RELIANCE-EQ,NSE:TCS-EQ,NSE:INFY-EQ)',
      rows: 2,
      condition: {
        field: 'stockMode',
        value: 'custom',
      },
    },
    // Single symbol for historical data
    {
      id: 'symbol',
      title: 'Stock Symbol',
      type: 'dropdown',
      options: stockOptions,
      placeholder: 'Select a stock...',
      condition: {
        field: 'operation',
        value: 'historical',
      },
    },
    // Resolution for historical data
    {
      id: 'resolution',
      title: 'Candle Resolution',
      type: 'dropdown',
      options: [
        { label: '1 Minute', id: '1' },
        { label: '5 Minutes', id: '5' },
        { label: '15 Minutes', id: '15' },
        { label: '30 Minutes', id: '30' },
        { label: '1 Hour', id: '60' },
        { label: '1 Day', id: 'D' },
        { label: '1 Week', id: 'W' },
        { label: '1 Month', id: 'M' },
      ],
      value: () => 'D',
      condition: { field: 'operation', value: 'historical' },
    },
    // Date range for historical data
    {
      id: 'dateRange',
      title: 'Date Range',
      type: 'dropdown',
      options: [
        { label: 'Last 7 Days', id: '7d' },
        { label: 'Last 30 Days', id: '30d' },
        { label: 'Last 90 Days', id: '90d' },
        { label: 'Last 1 Year', id: '1y' },
        { label: 'Custom Range', id: 'custom' },
      ],
      value: () => '30d',
      condition: { field: 'operation', value: 'historical' },
    },
    // Custom date from
    {
      id: 'dateFrom',
      title: 'From Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: {
        field: 'dateRange',
        value: 'custom',
      },
    },
    // Custom date to
    {
      id: 'dateTo',
      title: 'To Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: {
        field: 'dateRange',
        value: 'custom',
      },
    },
  ],
  tools: {
    access: ['fyers_quote', 'fyers_historical', 'fyers_market_status'],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'quote':
            return 'fyers_quote'
          case 'historical':
            return 'fyers_historical'
          case 'market_status':
            return 'fyers_market_status'
          default:
            return 'fyers_quote'
        }
      },
      params: (params) => {
        const operation = params.operation || 'quote'

        // Helper to get symbols based on mode
        const getSymbols = () => {
          if (params.stockMode === 'all_nifty50') {
            return NIFTY_50_STOCKS.map((s) => s.symbol).join(',')
          }
          if (params.stockMode === 'all_nifty_midcap') {
            return NIFTY_MIDCAP_100_STOCKS.map((s) => s.symbol).join(',')
          }
          if (params.stockMode === 'all_nifty_smallcap') {
            return NIFTY_SMALLCAP_100_STOCKS.map((s) => s.symbol).join(',')
          }
          if (params.stockMode === 'custom' && params.customSymbols) {
            return params.customSymbols
          }
          if (params.stockMode === 'nifty_midcap' && params.selectedMidcapStocks) {
            return Array.isArray(params.selectedMidcapStocks)
              ? params.selectedMidcapStocks.join(',')
              : params.selectedMidcapStocks
          }
          if (params.stockMode === 'nifty_smallcap' && params.selectedSmallcapStocks) {
            return Array.isArray(params.selectedSmallcapStocks)
              ? params.selectedSmallcapStocks.join(',')
              : params.selectedSmallcapStocks
          }
          if (params.selectedStocks) {
            return Array.isArray(params.selectedStocks)
              ? params.selectedStocks.join(',')
              : params.selectedStocks
          }
          // Default to top 10 Nifty 50 stocks
          return NIFTY_50_STOCKS.slice(0, 10)
            .map((s) => s.symbol)
            .join(',')
        }

        // Helper to calculate date range
        const getDateRange = () => {
          const now = new Date()
          let dateFrom: Date
          let dateTo = now

          switch (params.dateRange) {
            case '7d':
              dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
              break
            case '30d':
              dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
              break
            case '90d':
              dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
              break
            case '1y':
              dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
              break
            case 'custom':
              return {
                dateFrom: params.dateFrom || '2024-01-01',
                dateTo: params.dateTo || now.toISOString().split('T')[0],
              }
            default:
              dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          }

          return {
            dateFrom: dateFrom.toISOString().split('T')[0],
            dateTo: dateTo.toISOString().split('T')[0],
          }
        }

        if (operation === 'quote') {
          return {
            symbols: getSymbols(),
          }
        }

        if (operation === 'historical') {
          const dateRange = getDateRange()
          return {
            symbol: params.symbol || 'NSE:RELIANCE-EQ',
            resolution: params.resolution || 'D',
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
          }
        }

        // market_status - no params needed
        return {}
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    stockMode: { type: 'string', description: 'Stock selection mode' },
    selectedStocks: { type: 'string', description: 'Selected Nifty 50 stocks' },
    selectedMidcapStocks: { type: 'string', description: 'Selected Nifty Midcap stocks' },
    selectedSmallcapStocks: { type: 'string', description: 'Selected Nifty Smallcap stocks' },
    customSymbols: { type: 'string', description: 'Custom stock symbols' },
    symbol: { type: 'string', description: 'Single stock symbol for historical data' },
    resolution: { type: 'string', description: 'Candle resolution for historical data' },
    dateRange: { type: 'string', description: 'Date range preset' },
    dateFrom: { type: 'string', description: 'Custom start date' },
    dateTo: { type: 'string', description: 'Custom end date' },
  },
  outputs: {
    quotes: { type: 'json', description: 'Live stock quotes with price, volume, change' },
    candles: { type: 'json', description: 'Historical OHLCV candle data' },
    marketStatus: { type: 'json', description: 'Market open/closed status' },
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    error: { type: 'string', description: 'Error message if operation failed' },
  },
}
