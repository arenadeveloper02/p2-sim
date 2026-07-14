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
  rowHeight?: Dimension
}

interface PageElementTransform {
  scaleX?: number
  scaleY?: number
  translateX?: number
  translateY?: number
  unit?: string
}

interface PresentationElement {
  objectId?: string
  size?: { width?: Dimension; height?: Dimension }
  transform?: PageElementTransform
  table?: {
    rows?: number
    columns?: number
    tableColumns?: { columnWidth?: Dimension }[]
    tableRows?: TableRowPayload[]
  }
}

/** Vertical layout of a table shape on the slide (from a fetched presentation). */
export interface TableSlideLayout {
  /** Rendered height of the table bounding box on the slide (EMU). */
  heightBudgetEmu: number
  /** Per-row heights from the template before content fill (EMU). */
  templateRowHeightsEmu: number[]
}

/** Google Slides API: 1 pt = 12_700 EMU. Heuristic defaults for body table text. */
const PT_TO_EMU = 12_700
const ESTIMATED_TABLE_FONT_SIZE_PT = 11
const ESTIMATED_LINE_HEIGHT_EMU = Math.round(ESTIMATED_TABLE_FONT_SIZE_PT * PT_TO_EMU * 1.2)
const ESTIMATED_CHAR_WIDTH_EMU = Math.round(ESTIMATED_TABLE_FONT_SIZE_PT * PT_TO_EMU * 0.55)
const ESTIMATED_CELL_VERTICAL_PADDING_EMU = PT_TO_EMU * 2

interface PresentationSlide {
  pageElements?: PresentationElement[]
}

interface PresentationPayload {
  slides?: PresentationSlide[]
  pageSize?: { width?: Dimension; height?: Dimension }
}

/** Reserve space for slide footer / page number when sizing tables. */
const SLIDE_TABLE_BOTTOM_MARGIN_EMU = PT_TO_EMU * 36

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

function readTransformOffsetEmu(transform?: PageElementTransform): number {
  if (transform?.translateY == null || transform.translateY <= 0) return 0
  if (transform.unit === 'PT') return transform.translateY * PT_TO_EMU
  return transform.translateY
}

/**
 * Vertical space below the table's top edge on the slide (EMU).
 * Google Slides tables grow with wrapped cell text, so the budget should reflect
 * remaining slide area—not only the template table's initial bounding height.
 */
export function computeAvailableTableHeightOnSlide(input: {
  tableTopEmu: number
  slideHeightEmu: number
  bottomMarginEmu?: number
}): number {
  const { tableTopEmu, slideHeightEmu } = input
  const bottomMarginEmu = input.bottomMarginEmu ?? SLIDE_TABLE_BOTTOM_MARGIN_EMU
  if (slideHeightEmu <= 0 || tableTopEmu <= 0) return 0
  return Math.max(0, slideHeightEmu - tableTopEmu - bottomMarginEmu)
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

/** Reads table bounding height and template row heights from a fetched presentation. */
export function findTableSlideLayout(
  presentationData: PresentationPayload,
  tableObjectId: string
): TableSlideLayout | null {
  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (element.objectId !== tableObjectId || !element.table) continue

      const scaleY = Math.abs(element.transform?.scaleY ?? 1)
      const sizeHeight = readDimensionEmu(element.size?.height)
      const templateRowHeightsEmu = (element.table.tableRows ?? []).map((row) =>
        readDimensionEmu(row.rowHeight)
      )

      let heightBudgetEmu = sizeHeight > 0 ? sizeHeight * scaleY : 0
      if (heightBudgetEmu <= 0 && templateRowHeightsEmu.length > 0) {
        heightBudgetEmu = templateRowHeightsEmu.reduce((sum, height) => sum + height, 0)
      }

      const tableTopEmu = readTransformOffsetEmu(element.transform)
      const slideHeightEmu = readDimensionEmu(presentationData.pageSize?.height)
      const availableSlideHeight = computeAvailableTableHeightOnSlide({
        tableTopEmu,
        slideHeightEmu,
      })
      if (availableSlideHeight > 0) {
        heightBudgetEmu = Math.max(heightBudgetEmu, availableSlideHeight)
      }

      if (heightBudgetEmu <= 0) return null

      return { heightBudgetEmu, templateRowHeightsEmu }
    }
  }
  return null
}

/**
 * Estimates wrapped line count for cell text given a column width (EMU).
 */
export function estimateCellLineCount(text: string, columnWidthEmu: number): number {
  if (!text) return 1
  const usableWidth = Math.max(MIN_COLUMN_WIDTH_EMU, columnWidthEmu - PT_TO_EMU * 4)
  const charsPerLine = Math.max(1, Math.floor(usableWidth / ESTIMATED_CHAR_WIDTH_EMU))
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

/**
 * Estimates rendered row height from the tallest cell in the row (EMU).
 */
export function estimateRowHeightEmu(row: string[], columnWidths: number[]): number {
  let maxLines = 1
  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    const columnWidth = columnWidths[columnIndex] ?? columnWidths[0] ?? MIN_COLUMN_WIDTH_EMU
    maxLines = Math.max(maxLines, estimateCellLineCount(row[columnIndex] ?? '', columnWidth))
  }
  return maxLines * ESTIMATED_LINE_HEIGHT_EMU + ESTIMATED_CELL_VERTICAL_PADDING_EMU
}

/**
 * Returns how many content rows fit in the table's vertical budget on the slide.
 */
export function computeMaxRowsThatFitOnSlide(input: {
  content: string[][]
  slideLayout: TableSlideLayout
  columnWidths: number[]
  minRows: number
  maxRows: number
}): number {
  const { content, slideLayout, minRows, maxRows } = input
  if (content.length === 0) return minRows

  const columnWidths =
    input.columnWidths.length > 0
      ? input.columnWidths
      : [MIN_COLUMN_WIDTH_EMU]

  const templateRows = slideLayout.templateRowHeightsEmu.length
  const avgTemplateRowHeight =
    templateRows > 0
      ? slideLayout.templateRowHeightsEmu.reduce((sum, height) => sum + height, 0) / templateRows
      : slideLayout.heightBudgetEmu / Math.max(maxRows, content.length)

  let usedHeight = 0
  let fitRows = 0

  for (let rowIndex = 0; rowIndex < content.length && fitRows < maxRows; rowIndex += 1) {
    const row = content[rowIndex] ?? []
    const estimatedHeight = estimateRowHeightEmu(row, columnWidths)
    const templateHeight = slideLayout.templateRowHeightsEmu[rowIndex] ?? avgTemplateRowHeight
    const rowHeight = Math.max(estimatedHeight, templateHeight)

    if (fitRows >= minRows && usedHeight + rowHeight > slideLayout.heightBudgetEmu) {
      break
    }

    usedHeight += rowHeight
    fitRows += 1
  }

  return Math.min(maxRows, Math.max(minRows, fitRows))
}

/**
 * Splits table content across one or more slides when rows would overflow the template
 * table height. Repeats the header row on continuation slides when `headerRow` is set.
 */
export function splitTableContentAcrossSlides(input: {
  content: unknown
  maxRows: number
  maxColumns: number
  minRows: number
  headerRow?: boolean
  slideLayout: TableSlideLayout | null
  columnWidths: number[]
}): string[][][] {
  const contentRowCount = Array.isArray(input.content) ? input.content.length : 0
  const normalized = normalizeTableContent(
    input.content,
    contentRowCount > 0 ? contentRowCount : input.maxRows,
    input.maxColumns
  )
  if (normalized.length === 0) return []
  if (!input.slideLayout) return [normalized]

  const columnWidths =
    input.columnWidths.length > 0 ? input.columnWidths : [MIN_COLUMN_WIDTH_EMU]

  const header = input.headerRow ? normalized[0] : undefined
  const bodyRows = input.headerRow ? normalized.slice(1) : normalized

  if (bodyRows.length === 0) {
    return header ? [[header]] : []
  }

  const maxBodyRowsPerSlide = input.headerRow
    ? Math.max(1, input.maxRows - 1)
    : input.maxRows

  const chunks: string[][][] = []
  let bodyOffset = 0

  while (bodyOffset < bodyRows.length) {
    const reservedHeight = header ? estimateRowHeightEmu(header, columnWidths) : 0
    const bodyBudget = Math.max(
      ESTIMATED_LINE_HEIGHT_EMU,
      input.slideLayout.heightBudgetEmu - reservedHeight
    )
    const bodySlideLayout: TableSlideLayout = {
      heightBudgetEmu: bodyBudget,
      templateRowHeightsEmu: input.slideLayout.templateRowHeightsEmu.slice(header ? 1 : 0),
    }

    const remainingBody = bodyRows.slice(bodyOffset)
    let bodyFit = computeMaxRowsThatFitOnSlide({
      content: remainingBody,
      slideLayout: bodySlideLayout,
      columnWidths,
      minRows: 1,
      maxRows: maxBodyRowsPerSlide,
    })

    if (bodyFit <= 0 && remainingBody.length > 0) {
      bodyFit = 1
    }
    if (bodyFit <= 0) break

    const chunkBody = remainingBody.slice(0, bodyFit)
    chunks.push(header ? [header, ...chunkBody] : chunkBody)
    bodyOffset += bodyFit
  }

  if (chunks.length === 0) return [normalized]

  return chunks
}

const TABLE_CONTINUATION_TITLE_SUFFIX = ' (continued)'

/**
 * Appends a continuation suffix to a slide title when table content spans multiple slides.
 */
export function appendTableContinuationTitleSuffix(title: string): string {
  const normalized = title.trimEnd()
  if (!normalized) return 'Continued'
  if (normalized.toLowerCase().endsWith('(continued)')) return normalized
  return `${normalized}${TABLE_CONTINUATION_TITLE_SUFFIX}`
}

function isTableSlideTitleBlock(block: TableExpandableBlock): boolean {
  return block.role === 'TITLE' || block.key === 'title'
}

/** Block shape used when expanding slides for table overflow. */
export interface TableExpandableBlock {
  type: string
  shapeId: string
  key?: string
  role?: string
  content?: unknown
  maxRows?: number
  maxColumns?: number
  minRows?: number
  headerRow?: boolean
}

export interface TableExpandableSlide {
  order: number
  templateSlideObjectId: string
  blocks: TableExpandableBlock[]
}

/**
 * Duplicates slide entries when a table block's content exceeds one slide's height budget.
 * Each continuation slide reuses the same template and repeats the header row when present.
 */
export function expandSlidesForTableOverflow<T extends TableExpandableSlide>(
  slides: T[],
  templatePresentation: PresentationPayload
): T[] {
  const expanded: T[] = []

  for (const slide of slides) {
    const tableBlock = slide.blocks.find((block) => block.type === 'TABLE')
    if (!tableBlock?.maxRows || !tableBlock.maxColumns) {
      expanded.push(slide)
      continue
    }

    const tableContent = tableBlock.content
    if (!Array.isArray(tableContent) || tableContent.length === 0) {
      expanded.push(slide)
      continue
    }

    const slideLayout = findTableSlideLayout(templatePresentation, tableBlock.shapeId)
    const columnLayout = findTableColumnLayout(templatePresentation, tableBlock.shapeId)
    const chunks = splitTableContentAcrossSlides({
      content: tableContent,
      maxRows: tableBlock.maxRows,
      maxColumns: tableBlock.maxColumns,
      minRows: tableBlock.minRows ?? 1,
      headerRow: tableBlock.headerRow,
      slideLayout,
      columnWidths: columnLayout?.columnWidths ?? [],
    })

    if (chunks.length <= 1) {
      expanded.push(slide)
      continue
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex]!
      const isContinuation = chunkIndex > 0

      expanded.push({
        ...slide,
        blocks: slide.blocks.map((block) => {
          if (block.type === 'TABLE' && block.shapeId === tableBlock.shapeId) {
            return { ...block, content: chunk }
          }
          if (
            isContinuation &&
            isTableSlideTitleBlock(block) &&
            typeof block.content === 'string'
          ) {
            return {
              ...block,
              content: appendTableContinuationTitleSuffix(block.content),
            }
          }
          return block
        }),
      } as T)
    }
  }

  return expanded
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
  const minRows = Math.max(1, input.minRows ?? 1)
  const contentColumns = content.reduce((max, row) => Math.max(max, row.length), 0)
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
