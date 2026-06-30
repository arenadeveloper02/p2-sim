/** Table helpers shared by create-from-template and its tests. */

export interface TableDimensions {
  rows: number
  columns: number
}

export interface TableCellTextRequest {
  deleteText: {
    objectId: string
    cellLocation: { rowIndex: number; columnIndex: number }
    textRange: { type: 'ALL' }
  }
}

export interface TableCellInsertRequest {
  insertText: {
    objectId: string
    cellLocation: { rowIndex: number; columnIndex: number }
    insertionIndex: number
    text: string
  }
}

export type TableBatchRequest =
  | TableCellTextRequest
  | TableCellInsertRequest
  | {
      deleteTableRow: {
        tableObjectId: string
        cellLocation: { rowIndex: number; columnIndex: number }
      }
    }
  | {
      deleteTableColumn: {
        tableObjectId: string
        cellLocation: { rowIndex: number; columnIndex: number }
      }
    }
  | {
      updateTableColumnProperties: {
        objectId: string
        columnIndices: number[]
        tableColumnProperties: {
          columnWidth: { magnitude: number; unit: 'EMU' }
        }
        fields: string
      }
    }

/** Google Slides API minimum column width (32 pt). */
const MIN_COLUMN_WIDTH_EMU = 406_400

interface Dimension {
  magnitude?: number
  unit?: string
}

export interface TableColumnLayout {
  columnWidths: number[]
}

interface TableTextElement {
  endIndex?: number
}

interface TableCell {
  location?: { rowIndex?: number; columnIndex?: number }
  text?: { textElements?: TableTextElement[] }
}

interface TableRowPayload {
  tableCells?: TableCell[]
}

interface PresentationElement {
  objectId?: string
  table?: {
    rows?: number
    columns?: number
    tableColumns?: { columnWidth?: Dimension }[]
    tableRows?: TableRowPayload[]
  }
}

interface PresentationSlide {
  pageElements?: PresentationElement[]
}

interface PresentationPayload {
  slides?: PresentationSlide[]
}

/**
 * Normalizes LLM/user table content to a bounded string grid.
 */
export function normalizeTableContent(
  content: unknown,
  maxRows: number,
  maxColumns: number
): string[][] {
  if (!Array.isArray(content)) return []

  return content.slice(0, maxRows).map((row) => {
    if (!Array.isArray(row)) return []
    return row.slice(0, maxColumns).map((cell) => {
      if (typeof cell === 'string') return cell
      if (cell == null) return ''
      return String(cell)
    })
  })
}

function readDimensionEmu(dimension?: Dimension): number {
  if (dimension?.magnitude == null || dimension.magnitude <= 0) return 0
  if (dimension.unit === 'PT') return dimension.magnitude * 12_700
  return dimension.magnitude
}

/**
 * Weight per column from the longest cell in that column (minimum 1).
 * Columns with more text receive a larger share of total table width.
 */
export function computeColumnContentWeights(content: string[][], columnCount: number): number[] {
  const weights = Array.from({ length: columnCount }, () => 1)

  for (const row of content) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cellLength = (row[columnIndex] ?? '').length
      if (cellLength > weights[columnIndex]!) {
        weights[columnIndex] = cellLength
      }
    }
  }

  return weights
}

/** Splits total width across columns proportionally to content weights, respecting API minimums. */
export function distributeColumnWidthsByContent(
  totalWidth: number,
  weights: number[],
  minWidth = MIN_COLUMN_WIDTH_EMU
): number[] {
  const count = weights.length
  if (count === 0 || totalWidth <= 0) return []

  const minTotal = minWidth * count
  if (minTotal >= totalWidth) {
    return Array.from({ length: count }, () => totalWidth / count)
  }

  const normalizedWeights = weights.map((weight) => Math.max(weight, 1))
  const weightSum = normalizedWeights.reduce((sum, weight) => sum + weight, 0)
  const flexibleWidth = totalWidth - minTotal

  return normalizedWeights.map(
    (weight) => minWidth + (flexibleWidth * weight) / weightSum
  )
}

/** Reads per-column widths (EMU) from a fetched presentation payload. */
export function findTableColumnLayout(
  presentationData: PresentationPayload,
  tableObjectId: string
): TableColumnLayout | null {
  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (element.objectId !== tableObjectId || !element.table) continue

      const columnWidths = (element.table.tableColumns ?? []).map((column) =>
        readDimensionEmu(column.columnWidth)
      )

      if (columnWidths.length === 0) return null
      return { columnWidths }
    }
  }
  return null
}

/**
 * Sets column widths to fill the template table width, allocated by content density.
 * Runs after column trimming so wide-content columns expand and narrow columns shrink.
 */
export function buildTableColumnWidthRequests(input: {
  tableObjectId: string
  content: string[][]
  keepColumns: number
  layout: TableColumnLayout
}): TableBatchRequest[] {
  const { tableObjectId, keepColumns, layout, content } = input

  if (keepColumns <= 0 || layout.columnWidths.length === 0) return []

  const totalWidth = layout.columnWidths.reduce((sum, width) => sum + width, 0)
  if (totalWidth <= 0) return []

  const weights = computeColumnContentWeights(content, keepColumns)
  const columnWidths = distributeColumnWidthsByContent(totalWidth, weights)

  return columnWidths.map((columnWidth, columnIndex) => ({
    updateTableColumnProperties: {
      objectId: tableObjectId,
      columnIndices: [columnIndex],
      tableColumnProperties: {
        columnWidth: { magnitude: Math.round(columnWidth), unit: 'EMU' },
      },
      fields: 'columnWidth',
    },
  }))
}

/** Reads table row/column counts from a fetched presentation payload. */
export function findTableDimensions(
  presentationData: PresentationPayload,
  tableObjectId: string
): TableDimensions | null {
  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (element.objectId !== tableObjectId || !element.table) continue
      const rows = element.table.rows ?? 0
      const columns = element.table.columns ?? 0
      if (rows <= 0 || columns <= 0) return null
      return { rows, columns }
    }
  }
  return null
}

function tableCellTextKey(tableObjectId: string, rowIndex: number, columnIndex: number): string {
  return `${tableObjectId}:${rowIndex}:${columnIndex}`
}

/**
 * Maps table cell coordinates to the max text endIndex from a fetched presentation.
 * Cells with no text content are omitted (treated as endIndex 0).
 */
export function buildTableCellTextEndIndexMap(
  presentationData: PresentationPayload
): Record<string, number> {
  const map: Record<string, number> = {}

  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (!element.objectId || !element.table?.tableRows) continue

      for (const tableRow of element.table.tableRows) {
        for (const cell of tableRow.tableCells ?? []) {
          const textElements = cell.text?.textElements
          if (!textElements?.length) continue

          const rowIndex = cell.location?.rowIndex ?? 0
          const columnIndex = cell.location?.columnIndex ?? 0
          let maxIndex = 0
          for (const textElement of textElements) {
            if (textElement.endIndex != null && textElement.endIndex > maxIndex) {
              maxIndex = textElement.endIndex
            }
          }
          if (maxIndex > 0) {
            map[tableCellTextKey(element.objectId, rowIndex, columnIndex)] = maxIndex
          }
        }
      }
    }
  }

  return map
}

/**
 * Builds batchUpdate requests to trim a template table down to the content grid,
 * then replace text in each populated cell. Deletes rows/columns from the end.
 */
export function buildTableContentRequests(input: {
  tableObjectId: string
  content: string[][]
  templateRows: number
  templateColumns: number
  maxRows?: number
  maxColumns?: number
  minRows?: number
  minColumns?: number
  cellTextEndIndexMap?: Record<string, number>
  layout?: TableColumnLayout
}): TableBatchRequest[] {
  const { tableObjectId, templateRows, templateColumns } = input
  const rowCap = Math.min(input.maxRows ?? templateRows, templateRows)
  const columnCap = Math.min(input.maxColumns ?? templateColumns, templateColumns)
  const content = normalizeTableContent(input.content, rowCap, columnCap)
  const contentRows = content.length
  const contentColumns = content.reduce((max, row) => Math.max(max, row.length), 0)
  const minRows = Math.max(1, input.minRows ?? 1)
  const minColumns = Math.max(1, input.minColumns ?? 1)
  const keepRows = Math.min(templateRows, Math.max(contentRows, minRows))
  const keepColumns = Math.min(templateColumns, Math.max(contentColumns, minColumns))

  const requests: TableBatchRequest[] = []

  for (let rowIndex = templateRows - 1; rowIndex >= keepRows; rowIndex -= 1) {
    requests.push({
      deleteTableRow: {
        tableObjectId,
        cellLocation: { rowIndex, columnIndex: 0 },
      },
    })
  }

  for (let columnIndex = templateColumns - 1; columnIndex >= keepColumns; columnIndex -= 1) {
    requests.push({
      deleteTableColumn: {
        tableObjectId,
        cellLocation: { rowIndex: 0, columnIndex },
      },
    })
  }

  if (input.layout) {
    requests.push(
      ...buildTableColumnWidthRequests({
        tableObjectId,
        keepColumns,
        layout: input.layout,
        content,
      })
    )
  }

  for (let rowIndex = 0; rowIndex < contentRows; rowIndex += 1) {
    const row = content[rowIndex] ?? []
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const text = row[columnIndex] ?? ''
      const cellKey = tableCellTextKey(tableObjectId, rowIndex, columnIndex)
      const cellEndIndex = input.cellTextEndIndexMap?.[cellKey] ?? 0

      if (cellEndIndex > 0) {
        requests.push({
          deleteText: {
            objectId: tableObjectId,
            cellLocation: { rowIndex, columnIndex },
            textRange: { type: 'ALL' },
          },
        })
      }

      if (text) {
        requests.push({
          insertText: {
            objectId: tableObjectId,
            cellLocation: { rowIndex, columnIndex },
            insertionIndex: 0,
            text,
          },
        })
      }
    }
  }

  return requests
}
