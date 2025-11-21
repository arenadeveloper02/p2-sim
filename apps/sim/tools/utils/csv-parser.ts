import * as Papa from 'papaparse'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('CsvParser')

export interface CsvParseOptions {
  /**
   * CSV delimiter. Defaults to ',' (comma).
   * Common delimiters: ',' (comma), ';' (semicolon), '\t' (tab)
   */
  delimiter?: string
  /**
   * Whether the first row contains headers. Defaults to true.
   */
  header?: boolean
  /**
   * Whether to skip empty lines. Defaults to true.
   */
  skipEmptyLines?: boolean
  /**
   * Whether to trim whitespace from values. Defaults to true.
   */
  trimHeaders?: boolean
  /**
   * Whether to trim whitespace from values. Defaults to true.
   */
  trimValues?: boolean
}

export interface CsvParseResult {
  /**
   * Parsed data as an array of objects (if header: true) or arrays (if header: false)
   */
  data: Array<Record<string, string>> | string[][]
  /**
   * Column headers (if header: true)
   */
  headers: string[]
  /**
   * Total number of data rows (excluding header)
   */
  totalRows: number
  /**
   * Raw CSV text that was parsed
   */
  rawCsv: string
  /**
   * Any parsing errors encountered
   */
  errors: Papa.ParseError[]
}

/**
 * Generic CSV parser for API responses using papaparse.
 * Supports different delimiters (comma, semicolon, tab) and can be used by any tool
 * that receives CSV responses from external APIs.
 *
 * @param csvText - Raw CSV text from API response
 * @param options - Parsing options
 * @returns Parsed CSV data with headers and rows
 *
 * @example
 * ```typescript
 * // Parse semicolon-delimited CSV (e.g., Semrush)
 * const result = parseCsvResponse(csvText, { delimiter: ';' })
 *
 * // Parse comma-delimited CSV (default)
 * const result = parseCsvResponse(csvText)
 *
 * // Parse CSV without headers
 * const result = parseCsvResponse(csvText, { header: false })
 * ```
 */
export function parseCsvResponse(csvText: string, options: CsvParseOptions = {}): CsvParseResult {
  const {
    delimiter = ',',
    header = true,
    skipEmptyLines = true,
    trimHeaders = true,
    trimValues = true,
  } = options

  if (!csvText || csvText.trim().length === 0) {
    logger.warn('Empty CSV text provided')
    return {
      data: header ? [] : [],
      headers: [],
      totalRows: 0,
      rawCsv: csvText,
      errors: [],
    }
  }

  try {
    const parseOptions: Papa.ParseConfig = {
      delimiter,
      header,
      skipEmptyLines,
      transformHeader: trimHeaders
        ? (header: string) => String(header).trim()
        : (header: string) => String(header),
      transform: trimValues
        ? (value: string) => String(value || '').trim()
        : (value: string) => String(value || ''),
    }

    const parseResult = Papa.parse<string[] | Record<string, string>>(csvText, parseOptions)

    // Log parsing errors if any (non-fatal)
    if (parseResult.errors && parseResult.errors.length > 0) {
      logger.warn('CSV parsing warnings', {
        errors: parseResult.errors,
        errorCount: parseResult.errors.length,
      })
    }

    let headers: string[] = []
    let data: Array<Record<string, string>> | string[][]
    let totalRows: number

    if (header) {
      // Headers are in meta.fields when header: true
      headers = parseResult.meta.fields || []
      data = parseResult.data as Array<Record<string, string>>
      totalRows = data.length
    } else {
      // First row is treated as data when header: false
      const allRows = parseResult.data as string[][]
      if (allRows.length > 0) {
        // Use first row as headers for consistency
        headers = allRows[0] || []
        data = allRows.slice(1)
        totalRows = data.length
      } else {
        headers = []
        data = []
        totalRows = 0
      }
    }

    logger.info('CSV parsed successfully', {
      delimiter,
      header,
      totalRows,
      columnCount: headers.length,
      hasErrors: parseResult.errors && parseResult.errors.length > 0,
    })

    return {
      data,
      headers,
      totalRows,
      rawCsv: csvText,
      errors: parseResult.errors || [],
    }
  } catch (error) {
    logger.error('CSV parsing failed', {
      error: error instanceof Error ? error.message : String(error),
      delimiter,
      preview: csvText.substring(0, 200),
    })
    throw new Error(
      `Failed to parse CSV response: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
