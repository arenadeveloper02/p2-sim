import { env } from '@/lib/env'
import { isHosted } from '@/lib/environment'
import { createLogger } from '@/lib/logs/console/logger'
import type { SemrushParams, SemrushResponse } from '@/tools/semrush/types'
import type { ToolConfig } from '@/tools/types'
import { parseCsvResponse } from '@/tools/utils/csv-parser'

const logger = createLogger('SemrushTool')

export const semrushQueryTool: ToolConfig<SemrushParams, SemrushResponse> = {
  id: 'semrush_query',
  name: 'Semrush Query',
  description: 'Query Semrush SEO data API for keywords, backlinks, domain rank, and more',
  version: '1.0.0',

  params: {
    reportType: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Semrush report type (e.g., url_organic, domain_rank, backlinks_overview)',
    },
    target: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'URL or domain to analyze (depending on report type)',
    },
    database: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Geographic database code (us, uk, ca, etc.)',
    },
    displayLimit: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Number of results to return',
    },
    exportColumns: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Comma-separated column codes to export (e.g., Ph,Nq,Cp)',
    },
    additionalParams: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Additional Semrush API parameters as URL query string',
    },
    apiKey: {
      type: 'string',
      required: !isHosted,
      visibility: 'user-only',
      description: 'Semrush API key',
    },
  },

  request: {
    url: (params: SemrushParams) => {
      const baseUrl = 'https://api.semrush.com/'
      const queryParams = new URLSearchParams()

      // Get API key: env.SEMRUSH_API_KEY first, then params.apiKey (user input)
      // This matches the pattern used by agent blocks for API keys
      const envApiKey = env.SEMRUSH_API_KEY
      const apiKey = envApiKey || params.apiKey

      if (!apiKey) {
        throw new Error(
          'Semrush API key is required. Set SEMRUSH_API_KEY environment variable or provide it in the block configuration.'
        )
      }

      // Required parameters
      queryParams.append('type', params.reportType)
      queryParams.append('key', apiKey)

      // Determine if target is URL or domain based on report type
      if (params.reportType.startsWith('url_')) {
        queryParams.append('url', params.target)
      } else {
        queryParams.append('domain', params.target)
      }

      // Optional parameters
      // Database/Region is required for most report types, default to 'us' if not provided
      const database = params.database || 'us'
      queryParams.append('database', database)
      if (params.displayLimit) {
        queryParams.append('display_limit', String(params.displayLimit))
      }
      if (params.exportColumns) {
        queryParams.append('export_columns', params.exportColumns)
        console.log('Semrush: Adding export_columns:', params.exportColumns)
        logger.info('Semrush: Adding export_columns', { exportColumns: params.exportColumns })
      } else {
        console.log('Semrush: No export_columns specified - will use API defaults')
        logger.info('Semrush: No export_columns specified')
      }

      // Parse additional parameters if provided
      if (params.additionalParams) {
        try {
          const additional = new URLSearchParams(params.additionalParams)
          additional.forEach((value, key) => {
            queryParams.append(key, value)
          })
        } catch (error) {
          logger.warn('Failed to parse additional parameters', {
            error,
            additionalParams: params.additionalParams,
          })
        }
      }

      const finalUrl = `${baseUrl}?${queryParams.toString()}`
      console.log('Semrush: Final API URL:', finalUrl)
      logger.info('Semrush: Final API URL', { url: finalUrl })
      return finalUrl
    },
    method: 'GET',
    headers: () => ({
      Accept: 'text/plain, text/csv, */*',
      'Content-Type': 'text/plain',
    }),
  },

  transformResponse: async (response: Response, params?: SemrushParams) => {
    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Semrush API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      throw new Error(`Semrush API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    // Check content-type to determine how to read the response
    const contentType = response.headers.get('content-type') || ''
    const isTextResponse =
      contentType.includes('text/') || !contentType.includes('application/json')

    // Semrush returns CSV (text/plain), so we need to read as text
    // If the response body was already consumed (parsed as JSON), try to get it from the mock response
    let csvText: string
    try {
      csvText = await response.text()
      console.log('Semrush API Response:', csvText)
    } catch (error) {
      // If text() fails (body already consumed), try json() and stringify it
      // This handles the case where tools/index.ts already parsed it as JSON
      try {
        const jsonData = await response.json()
        // If we got JSON, it might be an error response or the body was stringified
        if (typeof jsonData === 'string') {
          csvText = jsonData
        } else {
          // If it's an object, try to reconstruct or throw error
          throw new Error('Unexpected JSON response from Semrush API. Expected CSV text.')
        }
      } catch (jsonError) {
        logger.error('Failed to read Semrush response as text or JSON', {
          contentType,
          error: error instanceof Error ? error.message : String(error),
          jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
        })
        throw new Error(
          'Failed to read Semrush API response. Expected CSV text but received invalid format.'
        )
      }
    }

    console.log('Semrush API Response:', {
      contentType,
      isTextResponse,
      length: csvText.length,
      preview: csvText.substring(0, 200),
      fullResponse: csvText,
    })

    // Extract report type from URL or params
    const url = new URL(response.url)
    const reportType = url.searchParams.get('type') || params?.reportType || ''

    // Parse CSV using generic parser (Semrush uses semicolon delimiter)
    const parseResult = parseCsvResponse(csvText, {
      delimiter: ';', // Semrush API returns semicolon-delimited CSV
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      trimValues: true,
    })

    // Log parsing details for debugging
    console.log('Semrush CSV Parsing Result:', {
      totalRows: parseResult.totalRows,
      headers: parseResult.headers,
      headerCount: parseResult.headers.length,
      firstRow: parseResult.data.length > 0 ? (parseResult.data[0] as Record<string, string>) : {},
      hasErrors: parseResult.errors.length > 0,
      errors: parseResult.errors,
    })

    logger.info('Semrush API response parsed', {
      reportType,
      columns: parseResult.headers.length,
      rows: parseResult.totalRows,
      hasErrors: parseResult.errors.length > 0,
    })

    // Type assertion: when header: true, data is Array<Record<string, string>>
    const data = parseResult.data as Array<Record<string, string>>

    return {
      success: true,
      output: {
        reportType,
        data,
        columns: parseResult.headers,
        totalRows: parseResult.totalRows,
        rawCsv: csvText,
      },
    }
  },

  outputs: {
    data: {
      type: 'json',
      description: 'Parsed Semrush data as array of objects',
    },
    columns: {
      type: 'json',
      description: 'Column headers from the response',
    },
    totalRows: {
      type: 'number',
      description: 'Total number of data rows returned',
    },
  },
}
