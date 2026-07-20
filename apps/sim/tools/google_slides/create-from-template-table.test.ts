/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  appendTableContinuationTitleSuffix,
  buildTableCellTextEndIndexMap,
  buildTableColumnWidthRequests,
  buildTableContentRequests,
  computeColumnContentWeights,
  distributeColumnWidthsByContent,
  estimateCellLineCount,
  estimateRowHeightEmu,
  expandSlidesForTableOverflow,
  findTableColumnLayout,
  findTableDimensions,
  findTableFontSizePt,
  findTableVerticalBudget,
  normalizeTableContent,
  packBodyRowsByCapacity,
  resolveColumnWidthsForEstimate,
  splitTableContentAcrossSlides,
} from '@/tools/google_slides/create-from-template-table'

describe('normalizeTableContent', () => {
  it('bounds rows and columns to template max', () => {
    expect(
      normalizeTableContent(
        [
          ['A', 'B', 'C', 'D', 'E', 'F'],
          ['1', '2', '3'],
        ],
        6,
        5
      )
    ).toEqual([
      ['A', 'B', 'C', 'D', 'E'],
      ['1', '2', '3'],
    ])
  })

  it('coerces non-string cells to strings', () => {
    expect(normalizeTableContent([[42, null]], 1, 1)).toEqual([['42']])
  })
})

describe('computeColumnContentWeights', () => {
  it('uses the longest cell in each column as the weight', () => {
    expect(
      computeColumnContentWeights(
        [
          ['Tealium', 'Long strength text here', 'Short'],
          ['Segment', 'Another long one', 'X'],
        ],
        3
      )
    ).toEqual([7, 23, 5])
  })
})

describe('distributeColumnWidthsByContent', () => {
  it('gives wider columns to heavier content weights', () => {
    const widths = distributeColumnWidthsByContent(8_000_000, [5, 50, 10])
    expect(widths[1]).toBeGreaterThan(widths[0])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(widths[2]).toBeGreaterThan(widths[0])
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(8_000_000, -2)
  })

  it('falls back to equal widths when minimums consume the total', () => {
    const widths = distributeColumnWidthsByContent(500_000, [10, 90])
    expect(widths[0]).toBeCloseTo(250_000, 0)
    expect(widths[1]).toBeCloseTo(250_000, 0)
  })
})

describe('findTableDimensions', () => {
  it('returns table rows and columns from presentation payload', () => {
    const dimensions = findTableDimensions(
      {
        slides: [
          {
            pageElements: [
              { objectId: 'other' },
              { objectId: 'table_1', table: { rows: 6, columns: 5 } },
            ],
          },
        ],
      },
      'table_1'
    )

    expect(dimensions).toEqual({ rows: 6, columns: 5 })
  })
})

describe('buildTableCellTextEndIndexMap', () => {
  it('records endIndex only for cells that contain text', () => {
    const map = buildTableCellTextEndIndexMap({
      slides: [
        {
          pageElements: [
            {
              objectId: 'table_1',
              table: {
                tableRows: [
                  {
                    tableCells: [
                      { location: {}, tableCellProperties: {} },
                      {
                        location: { columnIndex: 1 },
                        text: {
                          textElements: [
                            { endIndex: 9 },
                            { endIndex: 9, textRun: { content: 'Header 1\n' } },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(map['table_1:0:0']).toBeUndefined()
    expect(map['table_1:0:1']).toBe(9)
  })
})

describe('findTableColumnLayout', () => {
  it('returns column widths in EMU', () => {
    const layout = findTableColumnLayout(
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                table: {
                  tableColumns: [
                    { columnWidth: { magnitude: 800_000, unit: 'EMU' } },
                    { columnWidth: { magnitude: 1_200_000, unit: 'EMU' } },
                  ],
                },
              },
            ],
          },
        ],
      },
      'table_1'
    )

    expect(layout).toEqual({
      columnWidths: [800_000, 1_200_000],
    })
  })
})

describe('buildTableColumnWidthRequests', () => {
  it('allocates more width to columns with longer content after trimming', () => {
    const requests = buildTableColumnWidthRequests({
      tableObjectId: 'table_1',
      keepColumns: 2,
      layout: {
        columnWidths: Array.from({ length: 8 }, () => 1_000_000),
      },
      content: [
        ['A', 'Much longer content in column two'],
        ['B', 'Still much longer'],
      ],
    })

    expect(requests).toHaveLength(2)

    const narrowColumn = requests[0] as {
      updateTableColumnProperties: { tableColumnProperties: { columnWidth: { magnitude: number } } }
    }
    const wideColumn = requests[1] as {
      updateTableColumnProperties: { tableColumnProperties: { columnWidth: { magnitude: number } } }
    }

    expect(
      wideColumn.updateTableColumnProperties.tableColumnProperties.columnWidth.magnitude
    ).toBeGreaterThan(
      narrowColumn.updateTableColumnProperties.tableColumnProperties.columnWidth.magnitude
    )
  })

  it('applies content-based widths even when no columns were removed', () => {
    const requests = buildTableColumnWidthRequests({
      tableObjectId: 'table_1',
      keepColumns: 3,
      layout: {
        columnWidths: [2_000_000, 2_000_000, 2_000_000],
      },
      content: [['Vendor', 'Very long descriptive strength text', 'Short']],
    })

    expect(requests).toHaveLength(3)
    const widths = requests.map(
      (request) =>
        (
          request as {
            updateTableColumnProperties: {
              tableColumnProperties: { columnWidth: { magnitude: number } }
            }
          }
        ).updateTableColumnProperties.tableColumnProperties.columnWidth.magnitude
    )
    expect(widths[1]).toBeGreaterThan(widths[0])
    expect(widths[1]).toBeGreaterThan(widths[2])
  })
})

describe('buildTableContentRequests', () => {
  it('deletes unused trailing rows/columns then replaces cell text', () => {
    const requests = buildTableContentRequests({
      tableObjectId: 'table_1',
      templateRows: 6,
      templateColumns: 5,
      content: [
        ['Row 1', 'A', 'B'],
        ['Row 2', 'C', 'D'],
      ],
      cellTextEndIndexMap: {
        'table_1:0:0': 8,
        'table_1:0:1': 8,
        'table_1:0:2': 8,
        'table_1:1:0': 8,
        'table_1:1:1': 8,
        'table_1:1:2': 8,
      },
    })

    expect(requests.filter((r) => 'deleteTableRow' in r)).toHaveLength(4)
    expect(requests.filter((r) => 'deleteTableColumn' in r)).toHaveLength(2)

    const deletes = requests.filter((r) => 'deleteText' in r)
    expect(deletes).toHaveLength(6)

    const inserts = requests.filter((r) => 'insertText' in r)
    expect(inserts).toHaveLength(6)
    expect(inserts[0]).toMatchObject({
      insertText: {
        objectId: 'table_1',
        cellLocation: { rowIndex: 0, columnIndex: 0 },
        text: 'Row 1',
      },
    })
  })

  it('sets content-proportional column widths when layout is provided', () => {
    const requests = buildTableContentRequests({
      tableObjectId: 'table_1',
      templateRows: 8,
      templateColumns: 8,
      minRows: 2,
      minColumns: 2,
      content: [
        ['Short', 'Much longer cell content here'],
        ['Tiny', 'Another long cell value'],
      ],
      layout: {
        columnWidths: Array.from({ length: 8 }, () => 1_000_000),
      },
    })

    const columnUpdates = requests.filter((r) => 'updateTableColumnProperties' in r)
    expect(columnUpdates).toHaveLength(2)

    const widths = columnUpdates.map(
      (request) =>
        (
          request as {
            updateTableColumnProperties: {
              tableColumnProperties: { columnWidth: { magnitude: number } }
            }
          }
        ).updateTableColumnProperties.tableColumnProperties.columnWidth.magnitude
    )
    expect(widths[1]).toBeGreaterThan(widths[0]!)
  })

  it('respects minRows and minColumns when trimming trailing rows/columns', () => {
    const requests = buildTableContentRequests({
      tableObjectId: 'table_1',
      templateRows: 10,
      templateColumns: 10,
      minRows: 2,
      minColumns: 2,
      content: [['Only', 'Row']],
    })

    expect(requests.filter((r) => 'deleteTableRow' in r)).toHaveLength(8)
    expect(requests.filter((r) => 'deleteTableColumn' in r)).toHaveLength(8)
  })

  it('skips deleteText for empty template cells and inserts new text', () => {
    const requests = buildTableContentRequests({
      tableObjectId: 'table_1',
      templateRows: 6,
      templateColumns: 5,
      content: [['Heuristic', 'Area']],
      cellTextEndIndexMap: {
        'table_1:0:1': 9,
      },
    })

    const deletes = requests.filter((r) => 'deleteText' in r)
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toMatchObject({
      deleteText: {
        cellLocation: { rowIndex: 0, columnIndex: 1 },
      },
    })

    const inserts = requests.filter((r) => 'insertText' in r)
    expect(inserts).toHaveLength(2)
    expect(inserts[0]).toMatchObject({
      insertText: {
        cellLocation: { rowIndex: 0, columnIndex: 0 },
        text: 'Heuristic',
      },
    })
  })
})

describe('splitTableContentAcrossSlides', () => {
  const longCell = 'A'.repeat(120)

  it('returns a single chunk when body rows fit within the template row count', () => {
    const chunks = splitTableContentAcrossSlides({
      content: [
        ['H1', 'H2', 'H3'],
        ['Row 1', 'A', 'B'],
      ],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(2)
  })

  it('keeps more than 6 body rows on one slide when the template can actually hold them', () => {
    const bodyRows = Array.from({ length: 8 }, (_, index) => [
      `Row ${index + 1}`,
      longCell,
      longCell,
    ])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(9)
  })

  it('never splits fewer than 6 body rows even without a known template row count', () => {
    const bodyRows = Array.from({ length: 4 }, (_, index) => [`Row ${index + 1}`, 'A', 'B'])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: null,
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(5)
  })

  it('splits into chunks sized to the template capacity (not a fixed 6) once the template row count is exceeded, repeating the header', () => {
    const bodyRows = Array.from({ length: 13 }, (_, index) => [
      `Row ${index + 1}`,
      longCell,
      longCell,
    ])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
    })

    // templateRowCount 10 with a header row leaves a 9-body-row capacity per slide.
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk[0]).toEqual(['Col A', 'Col B', 'Col C'])
    }

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    expect(bodyChunkSizes.slice(0, -1)).toEqual(bodyChunkSizes.slice(0, -1).map(() => 9))
    expect(bodyChunkSizes.at(-1)).toBeLessThanOrEqual(9)

    const totalBodyRows = bodyChunkSizes.reduce((sum, size) => sum + size, 0)
    expect(totalBodyRows).toBe(13)
  })

  it('sizes overflow chunks to a small template capacity instead of the old fixed 6-row default', () => {
    const bodyRows = Array.from({ length: 10 }, (_, index) => [`Row ${index + 1}`, 'A', 'B'])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 1,
      headerRow: true,
      // Only 4 physical rows in the template -> 3 body rows/slide once a header is repeated.
      templateRowCount: 4,
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    expect(bodyChunkSizes).toEqual([3, 3, 3, 1])
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(10)
  })

  it('sizes overflow chunks to a large template capacity instead of the old fixed 6-row default', () => {
    const bodyRows = Array.from({ length: 25 }, (_, index) => [
      `Row ${index + 1}`,
      longCell,
      longCell,
    ])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 30,
      maxColumns: 3,
      minRows: 1,
      headerRow: true,
      // 13 physical rows in the template -> 12 body rows/slide once a header is repeated.
      templateRowCount: 13,
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    expect(bodyChunkSizes).toEqual([12, 12, 1])
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(25)
  })

  it('caps chunk size at maxRows when the template capacity exceeds maxRows', () => {
    const bodyRows = Array.from({ length: 20 }, (_, index) => [`Row ${index + 1}`, 'A', 'B'])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 5,
      maxColumns: 3,
      minRows: 1,
      headerRow: true,
      // Template physically holds far more rows than the block's configured maxRows allows.
      templateRowCount: 50,
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    // maxRows: 5 with a header leaves a 4-body-row cap per slide, overriding the larger template capacity.
    expect(bodyChunkSizes).toEqual([4, 4, 4, 4, 4])
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(20)
  })

  it('chunks without a header row use the full template row count as capacity', () => {
    const bodyRows = Array.from({ length: 22 }, (_, index) => [`Row ${index + 1}`, 'A', 'B'])
    const chunks = splitTableContentAcrossSlides({
      content: bodyRows,
      maxRows: 30,
      maxColumns: 3,
      minRows: 1,
      headerRow: false,
      templateRowCount: 8,
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length)
    expect(bodyChunkSizes).toEqual([8, 8, 6])
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(22)
  })

  // Column width chosen so a single line holds exactly 20 characters at the default 11pt
  // font: usableWidth = 1_587_500 - (12_700 * 4) = 1_536_700; charWidth = 11 * 12_700 * 0.55
  // = 76_835; 1_536_700 / 76_835 = 20 exactly.
  const WRAP_COLUMN_WIDTH_EMU = 1_587_500
  const SHORT_CELL = 'A'.repeat(15) // 1 line at 11pt
  const LONG_CELL = 'B'.repeat(25) // 2 lines at 11pt (ceil(25 / 20))

  it('splits a table whose rows visually overflow the slide even though the template row count says it fits', () => {
    // Template reports 10 physical rows (9 body rows/slide), but the table sits low on the
    // slide leaving only ~1,486,300 EMU of real vertical room — not enough for 9 two-line
    // wrapped rows, which is exactly the reported bug (row count "fits", content overflows).
    const bodyRows = Array.from({ length: 9 }, () => [LONG_CELL, 'x', 'y'])
    const chunks = splitTableContentAcrossSlides({
      content: [['ID', 'Status', 'Owner'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
      availableHeightEmu: 1_486_300,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU],
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    expect(chunks.length).toBeGreaterThan(1)
    expect(bodyChunkSizes[0]).toBeLessThan(9)
    for (const chunk of chunks) {
      expect(chunk[0]).toEqual(['ID', 'Status', 'Owner'])
    }
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(9)
  })

  it('still fills a slide to its full row-slot capacity when there is genuinely enough vertical room (guards the historical sparse-slide regression)', () => {
    // Same 9-row-capacity template, but the table sits near the top of the slide, leaving
    // plenty of real vertical room, and the content is short (no wrapping). A prior
    // height-estimate attempt produced only ~2 rows/slide here regardless of available
    // space — this asserts the fix does not regress into that.
    const bodyRows = Array.from({ length: 9 }, () => [SHORT_CELL, 'x', 'y'])
    const chunks = splitTableContentAcrossSlides({
      content: [['ID', 'Status', 'Owner'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
      availableHeightEmu: 3_000_000,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU],
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(10)
  })

  it('falls back to pure row-count capacity when availableHeightEmu is not supplied, regardless of wrapping cell text', () => {
    const bodyRows = Array.from({ length: 9 }, () => [LONG_CELL, 'x', 'y'])
    const chunks = splitTableContentAcrossSlides({
      content: [['ID', 'Status', 'Owner'], ...bodyRows],
      maxRows: 20,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      templateRowCount: 10,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU, WRAP_COLUMN_WIDTH_EMU],
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(10)
  })

  it('estimates taller rows (and fits fewer per slide) at a larger font size', () => {
    const bodyRows = Array.from({ length: 5 }, () => [SHORT_CELL])

    const defaultFontChunks = splitTableContentAcrossSlides({
      content: [[SHORT_CELL], ...bodyRows],
      maxRows: 20,
      maxColumns: 1,
      minRows: 1,
      headerRow: true,
      templateRowCount: 20,
      availableHeightEmu: 1_600_000,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU],
      fontSizePt: 11,
    })

    const largeFontChunks = splitTableContentAcrossSlides({
      content: [[SHORT_CELL], ...bodyRows],
      maxRows: 20,
      maxColumns: 1,
      minRows: 1,
      headerRow: true,
      templateRowCount: 20,
      availableHeightEmu: 1_600_000,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU],
      fontSizePt: 24,
    })

    expect(defaultFontChunks).toHaveLength(1)
    expect(largeFontChunks.length).toBeGreaterThan(defaultFontChunks.length)
  })

  it('greedily packs rows so chunk sizes vary with actual content length instead of a uniform split', () => {
    const bodyRows = [
      [SHORT_CELL],
      [SHORT_CELL],
      [SHORT_CELL],
      [LONG_CELL],
      [SHORT_CELL],
      [SHORT_CELL],
      [LONG_CELL],
      [LONG_CELL],
    ]
    const chunks = splitTableContentAcrossSlides({
      content: [[SHORT_CELL], ...bodyRows],
      maxRows: 30,
      maxColumns: 1,
      minRows: 1,
      headerRow: true,
      templateRowCount: 30,
      availableHeightEmu: 1_300_000,
      columnWidths: [WRAP_COLUMN_WIDTH_EMU],
    })

    const bodyChunkSizes = chunks.map((chunk) => chunk.length - 1)
    expect(new Set(bodyChunkSizes).size).toBeGreaterThan(1)
    expect(bodyChunkSizes.reduce((sum, size) => sum + size, 0)).toBe(8)
  })
})

describe('findTableVerticalBudget', () => {
  it('computes available height from the table transform and page size', () => {
    const budget = findTableVerticalBudget(
      {
        pageSize: {
          width: { magnitude: 9_144_000, unit: 'EMU' },
          height: { magnitude: 5_143_500, unit: 'EMU' },
        },
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                transform: { translateY: 3_200_000, unit: 'EMU' },
                table: { rows: 10, columns: 3 },
              },
            ],
          },
        ],
      },
      'table_1'
    )

    // 5_143_500 - 3_200_000 - (36pt bottom margin = 457_200) = 1_486_300
    expect(budget).toEqual({ availableHeightEmu: 1_486_300 })
  })

  it('returns null when the page size is missing from the payload', () => {
    const budget = findTableVerticalBudget(
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                transform: { translateY: 3_200_000, unit: 'EMU' },
                table: { rows: 10, columns: 3 },
              },
            ],
          },
        ],
      },
      'table_1'
    )

    expect(budget).toBeNull()
  })

  it('returns null when the table has no transform (position unknown)', () => {
    const budget = findTableVerticalBudget(
      {
        pageSize: { height: { magnitude: 5_143_500, unit: 'EMU' } },
        slides: [
          {
            pageElements: [{ objectId: 'table_1', table: { rows: 10, columns: 3 } }],
          },
        ],
      },
      'table_1'
    )

    expect(budget).toBeNull()
  })

  it('returns null when the table sits too low on the slide for any room to remain', () => {
    const budget = findTableVerticalBudget(
      {
        pageSize: { height: { magnitude: 5_143_500, unit: 'EMU' } },
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                transform: { translateY: 5_000_000, unit: 'EMU' },
                table: { rows: 10, columns: 3 },
              },
            ],
          },
        ],
      },
      'table_1'
    )

    expect(budget).toBeNull()
  })
})

describe('findTableFontSizePt', () => {
  it('reads the real font size from the first styled cell text run', () => {
    const fontSizePt = findTableFontSizePt(
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {
                          text: {
                            textElements: [
                              { textRun: { style: { fontSize: { magnitude: 18, unit: 'PT' } } } },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      'table_1'
    )

    expect(fontSizePt).toBe(18)
  })

  it('falls back to the default font size when the template has no styled font size', () => {
    const fontSizePt = findTableFontSizePt(
      {
        slides: [{ pageElements: [{ objectId: 'table_1', table: { tableRows: [] } }] }],
      },
      'table_1'
    )

    expect(fontSizePt).toBe(11)
  })
})

describe('resolveColumnWidthsForEstimate', () => {
  it('mirrors the final content-based width redistribution', () => {
    const widths = resolveColumnWidthsForEstimate(
      { columnWidths: [1_000_000, 1_000_000, 1_000_000] },
      3,
      [['A', 'Much longer content in this column', 'B']]
    )

    expect(widths[1]).toBeGreaterThan(widths[0]!)
    expect(widths[1]).toBeGreaterThan(widths[2]!)
  })

  it('falls back to the minimum column width when no layout is known', () => {
    const widths = resolveColumnWidthsForEstimate(null, 2, [['A', 'B']])
    expect(widths).toHaveLength(2)
    expect(widths[0]).toBeGreaterThan(0)
  })
})

describe('estimateCellLineCount and estimateRowHeightEmu', () => {
  it('estimates one line for text within the per-line character budget', () => {
    expect(estimateCellLineCount('A'.repeat(15), 1_587_500, 11)).toBe(1)
  })

  it('estimates two lines once text exceeds the per-line character budget', () => {
    expect(estimateCellLineCount('B'.repeat(25), 1_587_500, 11)).toBe(2)
  })

  it('estimates more lines at a larger font size for the same text and column width', () => {
    const smallFontLines = estimateCellLineCount('A'.repeat(15), 1_587_500, 11)
    const largeFontLines = estimateCellLineCount('A'.repeat(15), 1_587_500, 24)
    expect(largeFontLines).toBeGreaterThan(smallFontLines)
  })

  it('estimates row height from the tallest wrapping cell in the row', () => {
    const shortRowHeight = estimateRowHeightEmu(['A'.repeat(15), 'x'], [1_587_500, 1_587_500], 11)
    const longRowHeight = estimateRowHeightEmu(['B'.repeat(25), 'x'], [1_587_500, 1_587_500], 11)
    expect(longRowHeight).toBeGreaterThan(shortRowHeight)
  })
})

describe('packBodyRowsByCapacity', () => {
  it('always keeps at least one row per chunk even when a single row exceeds the available height', () => {
    const chunks = packBodyRowsByCapacity({
      bodyRows: [['B'.repeat(25)], ['B'.repeat(25)]],
      rowSlotCapacity: 20,
      availableHeightEmu: 1,
      columnWidths: [1_587_500],
      fontSizePt: 11,
      headerRowHeightEmu: 0,
    })

    expect(chunks).toHaveLength(2)
    expect(chunks.every((chunk) => chunk.length === 1)).toBe(true)
  })

  it('ignores the height budget and packs by row-slot capacity alone when availableHeightEmu is null', () => {
    const bodyRows = Array.from({ length: 7 }, () => ['B'.repeat(25)])
    const chunks = packBodyRowsByCapacity({
      bodyRows,
      rowSlotCapacity: 3,
      availableHeightEmu: null,
      columnWidths: [1_587_500],
      fontSizePt: 11,
      headerRowHeightEmu: 0,
    })

    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1])
  })
})

describe('expandSlidesForTableOverflow', () => {
  it('duplicates slide entries when table content requires continuation slides', () => {
    const longCell = 'A'.repeat(120)
    const slides = expandSlidesForTableOverflow(
      [
        {
          order: 1,
          templateSlideObjectId: 'slide_tpl',
          blocks: [
            { type: 'TEXT', role: 'TITLE', shapeId: 'title_1', content: 'My Table' },
            {
              type: 'TABLE',
              shapeId: 'table_1',
              headerRow: true,
              maxRows: 10,
              maxColumns: 3,
              minRows: 2,
              content: [
                ['Col A', 'Col B', 'Col C'],
                ...Array.from({ length: 10 }, (_, index) => [
                  `Row ${index + 1}`,
                  longCell,
                  longCell,
                ]),
              ],
            },
          ],
        },
      ],
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                table: {
                  rows: 10,
                  columns: 3,
                  tableColumns: columnWidthsToTableColumns([900_000, 900_000, 900_000]),
                },
              },
            ],
          },
        ],
      }
    )

    expect(slides.length).toBeGreaterThan(1)
    expect(slides.every((slide) => slide.templateSlideObjectId === 'slide_tpl')).toBe(true)
    const tableChunks = slides.map(
      (slide) => slide.blocks.find((block) => block.type === 'TABLE')?.content
    )
    expect(tableChunks[0]?.[0]).toEqual(['Col A', 'Col B', 'Col C'])
    expect(tableChunks[1]?.[0]).toEqual(['Col A', 'Col B', 'Col C'])

    expect(slides[0]?.blocks.find((block) => block.type === 'TEXT')?.content).toBe('My Table')
    expect(slides[1]?.blocks.find((block) => block.type === 'TEXT')?.content).toBe(
      'My Table (continued)'
    )
  })

  it('does not duplicate slides when content fits the template row count, even with long wrapping text', () => {
    const longCell = 'Word '.repeat(40).trim()
    const slides = expandSlidesForTableOverflow(
      [
        {
          order: 1,
          templateSlideObjectId: 'slide_tpl',
          blocks: [
            { type: 'TEXT', role: 'TITLE', shapeId: 'title_1', content: 'My Table' },
            {
              type: 'TABLE',
              shapeId: 'table_1',
              headerRow: true,
              maxRows: 20,
              maxColumns: 3,
              minRows: 2,
              content: [
                ['Col A', 'Col B', 'Col C'],
                ...Array.from({ length: 8 }, (_, index) => [
                  `Row ${index + 1}`,
                  longCell,
                  longCell,
                ]),
              ],
            },
          ],
        },
      ],
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                table: {
                  rows: 10,
                  columns: 3,
                  tableColumns: columnWidthsToTableColumns([900_000, 900_000, 900_000]),
                },
              },
            ],
          },
        ],
      }
    )

    expect(slides).toHaveLength(1)
    const tableContent = slides[0]?.blocks.find((block) => block.type === 'TABLE')?.content
    expect(tableContent).toHaveLength(9)
  })

  it('splits into additional continuation slides when the template payload reveals the table has too little real vertical room, even though the row count alone would fit', () => {
    const longCell = 'B'.repeat(25)
    const slides = expandSlidesForTableOverflow(
      [
        {
          order: 1,
          templateSlideObjectId: 'slide_tpl',
          blocks: [
            { type: 'TEXT', role: 'TITLE', shapeId: 'title_1', content: 'My Table' },
            {
              type: 'TABLE',
              shapeId: 'table_1',
              headerRow: true,
              maxRows: 20,
              maxColumns: 3,
              minRows: 2,
              content: [
                ['ID', 'Status', 'Owner'],
                ...Array.from({ length: 9 }, () => [longCell, 'x', 'y']),
              ],
            },
          ],
        },
      ],
      {
        pageSize: { height: { magnitude: 5_143_500, unit: 'EMU' } },
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                // Table sits low on the slide, leaving little real room below it —
                // this is what the row-count-only check could not see.
                transform: { translateY: 3_200_000, unit: 'EMU' },
                table: {
                  rows: 10,
                  columns: 3,
                  tableColumns: columnWidthsToTableColumns([1_587_500, 1_587_500, 1_587_500]),
                },
              },
            ],
          },
        ],
      }
    )

    expect(slides.length).toBeGreaterThan(1)
    const tableChunks = slides.map(
      (slide) => slide.blocks.find((block) => block.type === 'TABLE')?.content as string[][]
    )
    const totalBodyRows = tableChunks.reduce((sum, chunk) => sum + (chunk.length - 1), 0)
    expect(totalBodyRows).toBe(9)
    // The row-count cap alone (9 body rows/slide) would have kept this on one slide;
    // the vertical-space estimate should have forced an earlier cut.
    expect((tableChunks[0]?.length ?? 0) - 1).toBeLessThan(9)
  })
})

describe('appendTableContinuationTitleSuffix', () => {
  it('appends (continued) to non-empty titles', () => {
    expect(appendTableContinuationTitleSuffix('My Table')).toBe('My Table (continued)')
  })

  it('does not double-append when already continued', () => {
    expect(appendTableContinuationTitleSuffix('My Table (continued)')).toBe('My Table (continued)')
  })

  it('uses Continued for empty titles', () => {
    expect(appendTableContinuationTitleSuffix('')).toBe('Continued')
  })
})

function columnWidthsToTableColumns(widths: number[]) {
  return widths.map((magnitude) => ({ columnWidth: { magnitude, unit: 'EMU' as const } }))
}
