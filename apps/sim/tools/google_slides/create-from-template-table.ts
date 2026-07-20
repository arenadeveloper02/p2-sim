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

/** EMUs per point, matching the constant duplicated across this tool's sibling files. */
const PT_TO_EMU = 12_700

interface Dimension {
  magnitude?: number
  unit?: string
}

export interface TableColumnLayout {
  columnWidths: number[]
}

interface PageElementTransform {
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  unit?: string
}

interface TextRunStyle {
  fontSize?: Dimension
}

interface TableTextElement {
  endIndex?: number
  textRun?: { style?: TextRunStyle }
}

interface TableCell {
  location?: { rowIndex?: number; columnIndex?: number }
  text?: { textElements?: TableTextElement[] }
}

interface TableRowPayload {
  tableCells?: TableCell[]
  rowHeight?: Dimension
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

interface PresentationSlide {
  pageElements?: PresentationElement[]
}

interface PresentationPayload {
  slides?: PresentationSlide[]
  pageSize?: { width?: Dimension; height?: Dimension }
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

  return normalizedWeights.map((weight) => minWidth + (flexibleWidth * weight) / weightSum)
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

/**
 * Safety buffer (EMU) below a table's estimated bottom edge — page numbers/footers
 * commonly sit in this zone (visible as the overlapping page number in the reported bug).
 */
const SLIDE_TABLE_BOTTOM_MARGIN_EMU = PT_TO_EMU * 36

/** Fallback font size (pt) used only when the template has no readable cell font size. */
const DEFAULT_TABLE_FONT_SIZE_PT = 11

/**
 * Text-wrap estimate tuning. The Slides REST API never reports a table's true rendered
 * row height once cells wrap — `presentations.get` returns the same `rowHeight` for a
 * one-line and a visibly taller two-line row (confirmed by Google Slides API users and by
 * this repo's own history: see `608a47ba9d`/`116894c3a6`). These multipliers are therefore
 * a deliberately permissive estimate: erring toward fuller slides, since an overly
 * conservative estimate previously caused a "sparse 2-row slide" regression (`8f381f9e23`).
 */
const LINE_HEIGHT_MULTIPLIER = 1.2
const CHAR_WIDTH_MULTIPLIER = 0.55
const CELL_VERTICAL_PADDING_PT = 4

/** Table's top offset on its slide (EMU), from the page element's transform. */
function readTransformOffsetEmu(transform?: PageElementTransform): number {
  if (transform?.translateY == null || transform.translateY <= 0) return 0
  if (transform.unit === 'PT') return transform.translateY * PT_TO_EMU
  return transform.translateY
}

/** Vertical space below a table's top edge on its slide (EMU), reserving a bottom margin. */
function computeAvailableTableHeightOnSlide(input: {
  tableTopEmu: number
  slideHeightEmu: number
  bottomMarginEmu?: number
}): number {
  const bottomMarginEmu = input.bottomMarginEmu ?? SLIDE_TABLE_BOTTOM_MARGIN_EMU
  if (input.slideHeightEmu <= 0 || input.tableTopEmu <= 0) return 0
  return Math.max(0, input.slideHeightEmu - input.tableTopEmu - bottomMarginEmu)
}

export interface TableVerticalBudget {
  availableHeightEmu: number
}

/**
 * Computes the real vertical space available for a table's rows on its slide, from the
 * table's position (`transform`) and the presentation's page height — both already present
 * in the same un-masked `presentations.get` payload used elsewhere in this file. Returns
 * `null` when either is missing, so callers fall back to pure row-count-based capacity
 * (today's behavior) instead of guessing.
 */
export function findTableVerticalBudget(
  presentationData: PresentationPayload,
  tableObjectId: string
): TableVerticalBudget | null {
  const slideHeightEmu = readDimensionEmu(presentationData.pageSize?.height)
  if (slideHeightEmu <= 0) return null

  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (element.objectId !== tableObjectId || !element.table) continue

      const tableTopEmu = readTransformOffsetEmu(element.transform)
      if (tableTopEmu <= 0) return null

      const availableHeightEmu = computeAvailableTableHeightOnSlide({ tableTopEmu, slideHeightEmu })
      return availableHeightEmu > 0 ? { availableHeightEmu } : null
    }
  }
  return null
}

/**
 * Reads the template's real body-cell font size (pt) from its first styled text run,
 * falling back to `DEFAULT_TABLE_FONT_SIZE_PT` when the template has none. Avoids
 * guessing a font size when the template payload already tells us the real one.
 */
export function findTableFontSizePt(
  presentationData: PresentationPayload,
  tableObjectId: string
): number {
  for (const slide of presentationData.slides ?? []) {
    for (const element of slide.pageElements ?? []) {
      if (element.objectId !== tableObjectId || !element.table) continue

      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          for (const textElement of cell.text?.textElements ?? []) {
            const fontSizeEmu = readDimensionEmu(textElement.textRun?.style?.fontSize)
            if (fontSizeEmu > 0) return fontSizeEmu / PT_TO_EMU
          }
        }
      }
    }
  }
  return DEFAULT_TABLE_FONT_SIZE_PT
}

/**
 * Final column widths (EMU) the table will actually render at, mirroring the content-based
 * redistribution `buildTableColumnWidthRequests` applies post-fill. Used only for line-wrap
 * estimation, so estimates aren't computed against narrow, pre-redistribution template
 * widths — doing so previously undercounted how much text fits per line and was the root
 * cause of a "sparse slides" regression (see `116894c3a6`).
 */
export function resolveColumnWidthsForEstimate(
  layout: TableColumnLayout | null,
  keepColumns: number,
  content: string[][]
): number[] {
  if (!layout || keepColumns <= 0 || layout.columnWidths.length === 0) {
    return Array.from({ length: Math.max(keepColumns, 0) }, () => MIN_COLUMN_WIDTH_EMU)
  }

  const totalWidth = layout.columnWidths.reduce((sum, width) => sum + width, 0)
  if (totalWidth <= 0) {
    return Array.from({ length: keepColumns }, () => MIN_COLUMN_WIDTH_EMU)
  }

  const weights = computeColumnContentWeights(content, keepColumns)
  return distributeColumnWidthsByContent(totalWidth, weights)
}

const CHAR_WIDTH_EMU_PER_PT = PT_TO_EMU * CHAR_WIDTH_MULTIPLIER

/** Estimated number of wrapped lines a cell's text occupies at a given column width/font size. */
export function estimateCellLineCount(
  text: string,
  columnWidthEmu: number,
  fontSizePt: number
): number {
  if (!text) return 1
  const charWidthEmu = Math.max(1, fontSizePt * CHAR_WIDTH_EMU_PER_PT)
  const usableWidthEmu = Math.max(columnWidthEmu - PT_TO_EMU * 4, charWidthEmu)
  const charsPerLine = Math.max(1, Math.floor(usableWidthEmu / charWidthEmu))
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

/** Estimated rendered row height (EMU) from the tallest wrapping cell in the row. */
export function estimateRowHeightEmu(
  row: string[],
  columnWidths: number[],
  fontSizePt: number
): number {
  const lineHeightEmu = fontSizePt * PT_TO_EMU * LINE_HEIGHT_MULTIPLIER
  const verticalPaddingEmu = CELL_VERTICAL_PADDING_PT * PT_TO_EMU

  let maxLines = 1
  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    const columnWidth = columnWidths[columnIndex] ?? columnWidths[0] ?? MIN_COLUMN_WIDTH_EMU
    const lines = estimateCellLineCount(row[columnIndex] ?? '', columnWidth, fontSizePt)
    if (lines > maxLines) maxLines = lines
  }

  return maxLines * lineHeightEmu + verticalPaddingEmu
}

/**
 * Greedily packs body rows into per-slide chunks, cutting a new chunk when adding the next
 * row would exceed either the template's row-slot capacity or the real available vertical
 * space on the slide (when known — `availableHeightEmu` is `null` when the payload lacked
 * table position/page-height geometry, in which case only the row-slot cap applies, matching
 * pre-existing behavior). Always keeps at least one row per chunk so a single
 * pathologically tall row cannot stall the pack.
 */
export function packBodyRowsByCapacity(input: {
  bodyRows: string[][]
  rowSlotCapacity: number
  availableHeightEmu: number | null
  columnWidths: number[]
  fontSizePt: number
  headerRowHeightEmu: number
}): string[][][] {
  const {
    bodyRows,
    rowSlotCapacity,
    availableHeightEmu,
    columnWidths,
    fontSizePt,
    headerRowHeightEmu,
  } = input
  const chunks: string[][][] = []

  let currentChunk: string[][] = []
  let currentHeightEmu = headerRowHeightEmu

  for (const row of bodyRows) {
    const rowHeightEmu = estimateRowHeightEmu(row, columnWidths, fontSizePt)
    const wouldExceedHeight =
      availableHeightEmu != null &&
      currentChunk.length > 0 &&
      currentHeightEmu + rowHeightEmu > availableHeightEmu
    const wouldExceedRowSlots = currentChunk.length >= rowSlotCapacity

    if (currentChunk.length > 0 && (wouldExceedHeight || wouldExceedRowSlots)) {
      chunks.push(currentChunk)
      currentChunk = []
      currentHeightEmu = headerRowHeightEmu
    }

    currentChunk.push(row)
    currentHeightEmu += rowHeightEmu
  }

  if (currentChunk.length > 0) chunks.push(currentChunk)

  return chunks
}

/**
 * Splits table content across one or more slides when body rows exceed the smaller of
 * (a) the template's real physical row count (read live from the fetched template
 * presentation) and (b) a text-wrap height estimate of the real available vertical space
 * on the slide (when known — see `findTableVerticalBudget`). Repeats the header row on
 * continuation slides when `headerRow` is set.
 *
 * Row count alone is not a reliable capacity signal: a template authored with N short,
 * single-line rows reports capacity N regardless of how tall those rows become once real
 * (longer, wrapping) content is inserted — Slides lets the table visually overflow past the
 * slide edge without changing the row count. `availableHeightEmu` closes that gap. When it
 * is `null` (payload lacked table position/page-height geometry), only the row-count cap
 * applies, matching this function's original behavior.
 */
export function splitTableContentAcrossSlides(input: {
  content: unknown
  maxRows: number
  maxColumns: number
  minRows: number
  headerRow?: boolean
  /** Real physical row count of the template's table (from `findTableDimensions`), when known. */
  templateRowCount: number | null
  /** Real available vertical space (EMU) for rows on the slide, from `findTableVerticalBudget`. */
  availableHeightEmu?: number | null
  /** Final column widths (EMU) for line-wrap estimation; see `resolveColumnWidthsForEstimate`. */
  columnWidths?: number[]
  /** Template's actual body-cell font size (pt), from `findTableFontSizePt`. */
  fontSizePt?: number
}): string[][][] {
  const contentRowCount = Array.isArray(input.content) ? input.content.length : 0
  const normalized = normalizeTableContent(
    input.content,
    contentRowCount > 0 ? contentRowCount : input.maxRows,
    input.maxColumns
  )
  if (normalized.length === 0) return []

  const header = input.headerRow ? normalized[0] : undefined
  const bodyRows = input.headerRow ? normalized.slice(1) : normalized

  if (bodyRows.length === 0) {
    return header ? [[header]] : []
  }

  const maxBodyRowsPerSlide = input.headerRow ? Math.max(1, input.maxRows - 1) : input.maxRows

  const templateBodyCapacity =
    input.templateRowCount != null
      ? Math.max(1, input.headerRow ? input.templateRowCount - 1 : input.templateRowCount)
      : maxBodyRowsPerSlide

  const rowSlotCapacity = Math.min(templateBodyCapacity, maxBodyRowsPerSlide)

  const availableHeightEmu = input.availableHeightEmu ?? null
  const columnWidths = input.columnWidths ?? []
  const fontSizePt = input.fontSizePt ?? DEFAULT_TABLE_FONT_SIZE_PT
  const headerRowHeightEmu = header ? estimateRowHeightEmu(header, columnWidths, fontSizePt) : 0

  const bodyChunks = packBodyRowsByCapacity({
    bodyRows,
    rowSlotCapacity,
    availableHeightEmu,
    columnWidths,
    fontSizePt,
    headerRowHeightEmu,
  })

  return bodyChunks.map((chunkBody) => (header ? [header, ...chunkBody] : chunkBody))
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
  minColumns?: number
  headerRow?: boolean
}

export interface TableExpandableSlide {
  order: number
  templateSlideObjectId: string
  blocks: TableExpandableBlock[]
}

/**
 * Duplicates slide entries when a table block's content exceeds the template's real
 * physical row count. Each continuation slide reuses the same template and repeats
 * the header row when present.
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

    const templateDimensions = findTableDimensions(templatePresentation, tableBlock.shapeId)
    const templateColumnLayout = findTableColumnLayout(templatePresentation, tableBlock.shapeId)
    const verticalBudget = findTableVerticalBudget(templatePresentation, tableBlock.shapeId)
    const fontSizePt = findTableFontSizePt(templatePresentation, tableBlock.shapeId)

    const normalizedContent = normalizeTableContent(
      tableContent,
      tableContent.length,
      tableBlock.maxColumns
    )
    const contentColumns = normalizedContent.reduce((max, row) => Math.max(max, row.length), 0)
    const minColumns = Math.max(1, tableBlock.minColumns ?? 1)
    const keepColumns = Math.min(
      templateDimensions?.columns ?? tableBlock.maxColumns,
      Math.max(contentColumns, minColumns)
    )
    const estimateColumnWidths = resolveColumnWidthsForEstimate(
      templateColumnLayout,
      keepColumns,
      normalizedContent
    )

    const chunks = splitTableContentAcrossSlides({
      content: tableContent,
      maxRows: tableBlock.maxRows,
      maxColumns: tableBlock.maxColumns,
      minRows: tableBlock.minRows ?? 1,
      headerRow: tableBlock.headerRow,
      templateRowCount: templateDimensions?.rows ?? null,
      availableHeightEmu: verticalBudget?.availableHeightEmu ?? null,
      columnWidths: estimateColumnWidths,
      fontSizePt,
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
