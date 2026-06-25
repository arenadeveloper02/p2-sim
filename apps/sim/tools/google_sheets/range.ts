/**
 * Parses a legacy Google Sheets range string that combined sheet tab and cell range.
 */
export function parseLegacyGoogleSheetsRange(range: string): {
  sheetName: string
  cellRange?: string
} {
  const trimmed = range.trim()
  if (!trimmed) {
    return { sheetName: '' }
  }

  const separatorIndex = trimmed.indexOf('!')
  if (separatorIndex === -1) {
    return { sheetName: unquoteSheetName(trimmed) }
  }

  const rawSheetName = trimmed.slice(0, separatorIndex)
  const cellRange = trimmed.slice(separatorIndex + 1).trim()

  return {
    sheetName: unquoteSheetName(rawSheetName),
    cellRange: cellRange || undefined,
  }
}

function unquoteSheetName(sheetName: string): string {
  const trimmed = sheetName.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }

  return trimmed
}

/**
 * Resolves v2 sheet name and cell range from params that may still carry legacy `range`
 * or a combined `cellRange` value (`Sheet1!A2:B`).
 */
export function resolveGoogleSheetsV2RangeParams(params: {
  sheetName?: unknown
  cellRange?: unknown
  range?: unknown
}): { sheetName: string; cellRange?: string } {
  let sheetName =
    typeof params.sheetName === 'string' && params.sheetName.trim() ? params.sheetName.trim() : ''

  let cellRange =
    typeof params.cellRange === 'string' && params.cellRange.trim()
      ? params.cellRange.trim()
      : undefined

  if (!sheetName && typeof params.range === 'string' && params.range.trim()) {
    const parsed = parseLegacyGoogleSheetsRange(params.range)
    sheetName = parsed.sheetName
    cellRange = cellRange ?? parsed.cellRange
    return { sheetName, cellRange }
  }

  if (cellRange?.includes('!')) {
    const parsed = parseLegacyGoogleSheetsRange(cellRange)
    if (!sheetName) {
      sheetName = parsed.sheetName
    }
    cellRange = parsed.cellRange
  }

  return { sheetName, cellRange }
}
