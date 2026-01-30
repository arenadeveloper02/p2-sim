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

function parseRange(range: string): {
  sheetName: string | null
  startRow: number | null
  endRow: number | null
} {
  const parts = range.split('!')
  const sheetName = parts.length > 1 ? parts[0].trim() : null
  const rangePart = parts.length > 1 ? parts[1] : parts[0]

  const rowMatch = rangePart.match(/(\d+):(\d+)/)
  if (rowMatch) {
    const startRow = Number.parseInt(rowMatch[1], 10)
    const endRow = Number.parseInt(rowMatch[2], 10)
    return { sheetName, startRow, endRow }
  }

  const singleRowMatch = rangePart.match(/(\d+)/)
  if (singleRowMatch) {
    const row = Number.parseInt(singleRowMatch[1], 10)
    return { sheetName, startRow: row, endRow: row }
  }

  return { sheetName, startRow: null, endRow: null }
}

async function getSheetIdFromName(params: {
  spreadsheetId: string
  accessToken: string
  sheetName: string
}): Promise<number> {
  const { spreadsheetId, accessToken, sheetName } = params
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!resp.ok) {
    const text = await resp.text()
    logger.error('Failed to fetch spreadsheet metadata', {
      status: resp.status,
      statusText: resp.statusText,
      body: text,
    })
    throw new Error('Unable to resolve sheetId from sheet name.')
  }

  const data = await resp.json()
  const sheet = data.sheets?.find(
    (s: { properties?: { title?: string } }) => s?.properties?.title === sheetName
  )

  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet.`)
  }

  return sheet.properties.sheetId
}

function resolveRowRange(params: GoogleSheetsDeleteParams): {
  startRow: number
  endRow: number
  derivedSheetName: string | null
} {
  if (params.startRow ?? params.endRow) {
    const startRow = params.startRow ?? params.endRow ?? 0
    const endRow = params.endRow ?? params.startRow ?? 0
    return { startRow, endRow, derivedSheetName: params.sheetName ?? null }
  }

  if (params.rowNumber) {
    const row = params.rowNumber
    return { startRow: row, endRow: row, derivedSheetName: params.sheetName ?? null }
  }

  if (params.range) {
    const { startRow, endRow, sheetName } = parseRange(params.range)
    if (startRow !== null && endRow !== null) {
      return {
        startRow,
        endRow,
        derivedSheetName: params.sheetName ?? sheetName,
      }
    }
  }

  throw new Error('You must provide rowNumber or a row range in A1 notation (e.g., "Sheet1!5:7").')
}

export const deleteTool: ToolConfig<GoogleSheetsDeleteParams, GoogleSheetsDeleteResponse> = {
  id: 'google_sheets_delete',
  name: 'Delete rows in Google Sheets',
  description: 'Delete one or more rows from a Google Sheets spreadsheet',
  version: '1.0.0',

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
      description: 'The ID of the spreadsheet to update',
    },
    range: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'A1 notation row range to delete (e.g., "Sheet1!5:7" or "5:5")',
    },
    rowNumber: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Single row number to delete (1-based)',
    },
    sheetId: {
      type: 'number',
      required: false,
      visibility: 'hidden',
      description: 'Sheet ID (numeric). If not provided, sheetName or range is used to resolve it.',
    },
    sheetName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Sheet name to target (used to resolve sheetId when provided).',
    },
  },

  request: {
    url: (params) =>
      `https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheetId}:batchUpdate`,
    method: 'POST',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: async (params) => {
      const spreadsheetId = params.spreadsheetId?.trim()
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID is required.')
      }

      const { startRow, endRow, derivedSheetName } = resolveRowRange(params)
      if (Number.isNaN(startRow) || Number.isNaN(endRow)) {
        throw new Error('Invalid row numbers provided.')
      }

      if (endRow < startRow) {
        throw new Error('endRow must be greater than or equal to startRow.')
      }

      let sheetId = params.sheetId
      const targetSheetName = params.sheetName ?? derivedSheetName

      if (!sheetId && targetSheetName) {
        sheetId = await getSheetIdFromName({
          spreadsheetId,
          accessToken: params.accessToken,
          sheetName: targetSheetName,
        })
      }

      if (sheetId === undefined) {
        sheetId = 0
      }

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

  transformResponse: async (_response: Response, params) => {
    if (!params) {
      throw new Error('Missing parameters for Google Sheets delete response.')
    }

    const { startRow, endRow } = resolveRowRange(params)
    const deletedRows = endRow - startRow + 1

    return {
      success: true,
      output: {
        deletedRows,
        metadata: {
          spreadsheetId: params.spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${params.spreadsheetId}`,
        },
      },
    }
  },

  outputs: {
    deletedRows: { type: 'number', description: 'Number of rows deleted' },
    metadata: { type: 'json', description: 'Spreadsheet metadata (id and URL)' },
  },
}
