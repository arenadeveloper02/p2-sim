import { createLogger } from '@sim/logger'
import type {
  GoogleSheetsDeleteResponse,
  GoogleSheetsToolParams,
} from '@/tools/google_sheets/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleSheetsDeleteTool')

interface GoogleSheetsDeleteParams extends GoogleSheetsToolParams {
  rowNumber?: number
  startRow?: number
  endRow?: number
  sheetId?: number
  sheetName?: string
}

/**
 * Parse A1 notation range to extract sheet name and row numbers
 * Examples:
 * - "Sheet1!5:5" -> { sheetName: "Sheet1", startRow: 5, endRow: 5 }
 * - "5:7" -> { sheetName: null, startRow: 5, endRow: 7 }
 * - "Sheet1!A5:B5" -> { sheetName: "Sheet1", startRow: 5, endRow: 5 }
 */
function parseRange(range: string): {
  sheetName: string | null
  startRow: number | null
  endRow: number | null
} {
  const parts = range.split('!')
  const sheetName = parts.length > 1 ? parts[0].trim() : null
  const rangePart = parts.length > 1 ? parts[1] : parts[0]

  // Extract row numbers from range (e.g., "5:5", "5:7", "A5:B5" -> 5, 5 or 5, 7)
  const rowMatch = rangePart.match(/(\d+):(\d+)/)
  if (rowMatch) {
    const startRow = Number.parseInt(rowMatch[1], 10)
    const endRow = Number.parseInt(rowMatch[2], 10)
    return { sheetName, startRow, endRow }
  }

  // Single row number (e.g., "5", "A5")
  const singleRowMatch = rangePart.match(/(\d+)/)
  if (singleRowMatch) {
    const row = Number.parseInt(singleRowMatch[1], 10)
    return { sheetName, startRow: row, endRow: row }
  }

  return { sheetName, startRow: null, endRow: null }
}

/**
 * Get sheetId from sheet name by fetching spreadsheet metadata
 */
async function getSheetIdFromName(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Failed to fetch spreadsheet metadata:', { errorText })
    throw new Error(`Failed to fetch spreadsheet metadata: ${response.statusText}`)
  }

  const data = await response.json()
  const sheets = data.sheets || []

  for (const sheet of sheets) {
    if (sheet.properties?.title === sheetName) {
      return sheet.properties.sheetId
    }
  }

  throw new Error(`Sheet "${sheetName}" not found in spreadsheet`)
}

export const deleteTool: ToolConfig<GoogleSheetsDeleteParams, GoogleSheetsDeleteResponse> = {
  id: 'google_sheets_delete',
  name: 'Delete Rows from Google Sheets',
  description: 'Delete one or more rows from a Google Sheets spreadsheet',
  version: '1.0',

  oauth: {
    required: true,
    provider: 'google-sheets',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Sheets API',
    },
    spreadsheetId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The ID of the spreadsheet',
    },
    range: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'The A1 notation range specifying rows to delete (e.g. "Sheet1!5:5" for row 5, "Sheet1!5:7" for rows 5-7, or "5:5" for row 5 in the first sheet)',
    },
    rowNumber: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Single row number to delete (1-based, e.g. 5 for row 5). Used if range is not provided.',
    },
    startRow: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Starting row number (1-based, inclusive). Used with endRow if range is not provided.',
    },
    endRow: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Ending row number (1-based, exclusive). Used with startRow if range is not provided.',
    },
    sheetId: {
      type: 'number',
      required: false,
      visibility: 'hidden',
      description:
        'The sheet ID (numeric). If not provided, will be resolved from sheetName or range.',
    },
    sheetName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'The name of the sheet (e.g. "Sheet1"). Used if sheetId is not provided and range does not include sheet name.',
    },
  },

  request: {
    url: (params) => {
      const spreadsheetId = params.spreadsheetId?.trim()
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID is required')
      }

      return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`
    },
    method: 'POST',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }
      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    body: async (params) => {
      let sheetId: number | undefined = params.sheetId
      let startRow: number
      let endRow: number

      // Determine row numbers from range or direct parameters
      if (params.range) {
        const parsed = parseRange(params.range)
        if (parsed.startRow === null || parsed.endRow === null) {
          throw new Error(
            `Invalid range format. Expected format: "Sheet1!5:5" or "5:7" or "Sheet1!A5:B5"`
          )
        }
        startRow = parsed.startRow
        endRow = parsed.endRow

        // If range includes sheet name, resolve sheetId
        if (parsed.sheetName && !sheetId) {
          sheetId = await getSheetIdFromName(
            params.accessToken,
            params.spreadsheetId,
            parsed.sheetName
          )
        }
      } else if (params.rowNumber !== undefined) {
        // Single row specified
        startRow = params.rowNumber
        endRow = params.rowNumber
      } else if (params.startRow !== undefined && params.endRow !== undefined) {
        startRow = params.startRow
        endRow = params.endRow
      } else {
        throw new Error('Either range, rowNumber, or both startRow and endRow must be provided')
      }

      // Validate row numbers
      if (startRow < 1) {
        throw new Error('Row numbers must be 1 or greater')
      }
      if (endRow < startRow) {
        throw new Error('End row must be greater than or equal to start row')
      }

      // If sheetId is still not resolved, try to get it from sheetName
      if (!sheetId && params.sheetName) {
        sheetId = await getSheetIdFromName(
          params.accessToken,
          params.spreadsheetId,
          params.sheetName
        )
      }

      // If still no sheetId, default to sheet 0 (first sheet)
      if (!sheetId) {
        sheetId = 0
      }

      // Convert 1-based row numbers to 0-based indices (API requirement)
      // Note: endIndex is exclusive in the API
      const startIndex = startRow - 1
      const endIndex = endRow

      return {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex,
              },
            },
          },
        ],
      }
    },
  },

  transformResponse: async (response: Response, params) => {
    const data = await response.json()

    if (!response.ok) {
      logger.error('Google Sheets API error:', { data })
      throw new Error(data.error?.message || 'Failed to delete rows')
    }

    // Extract spreadsheet ID from params
    const spreadsheetId = params?.spreadsheetId?.trim() || ''

    // Calculate deleted rows count from the request
    let deletedRows = 0
    if (params?.range) {
      const parsed = parseRange(params.range)
      if (parsed.startRow !== null && parsed.endRow !== null) {
        deletedRows = parsed.endRow - parsed.startRow + 1
      }
    } else if (params?.rowNumber !== undefined) {
      deletedRows = 1
    } else if (params?.startRow !== undefined && params?.endRow !== undefined) {
      deletedRows = params.endRow - params.startRow + 1
    }

    return {
      success: true,
      output: {
        deletedRows,
        metadata: {
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        },
      },
    }
  },

  outputs: {
    deletedRows: {
      type: 'number',
      description: 'Number of rows that were deleted',
    },
    metadata: {
      type: 'json',
      description: 'Spreadsheet metadata including ID and URL',
    },
  },
}
