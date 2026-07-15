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
  computeMaxRowsThatFitOnSlide,
  distributeColumnWidthsByContent,
  estimateCellLineCount,
  expandSlidesForTableOverflow,
  findTableColumnLayout,
  findTableDimensions,
  findTableSlideLayout,
  normalizeTableContent,
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

describe('findTableSlideLayout', () => {
  it('derives height budget from element size and scaleY', () => {
    const layout = findTableSlideLayout(
      {
        slides: [
          {
            pageElements: [
              {
                objectId: 'table_1',
                size: { height: { magnitude: 2_000_000, unit: 'EMU' } },
                transform: { scaleY: 1.5 },
                table: {
                  tableRows: [
                    { rowHeight: { magnitude: 200_000, unit: 'EMU' } },
                    { rowHeight: { magnitude: 300_000, unit: 'EMU' } },
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
      heightBudgetEmu: 3_000_000,
      templateRowHeightsEmu: [200_000, 300_000],
    })
  })
})

describe('computeMaxRowsThatFitOnSlide', () => {
  it('returns fewer rows when long cell text exceeds the vertical budget', () => {
    const longCell = 'Word '.repeat(40).trim()
    const content = Array.from({ length: 10 }, () => ['Label', longCell])

    const fitRows = computeMaxRowsThatFitOnSlide({
      content,
      slideLayout: {
        heightBudgetEmu: 800_000,
        templateRowHeightsEmu: Array.from({ length: 10 }, () => 80_000),
      },
      columnWidths: [700_000, 700_000],
      minRows: 2,
      maxRows: 10,
    })

    expect(fitRows).toBeLessThan(10)
    expect(fitRows).toBeGreaterThanOrEqual(2)
  })

  it('wraps more text into fewer lines in wider columns', () => {
    const narrowLines = estimateCellLineCount('abcdefghijklmnop', 500_000)
    const wideLines = estimateCellLineCount('abcdefghijklmnop', 2_000_000)
    expect(wideLines).toBeLessThanOrEqual(narrowLines)
  })
})

describe('splitTableContentAcrossSlides', () => {
  const slideLayout = {
    heightBudgetEmu: 900_000,
    templateRowHeightsEmu: Array.from({ length: 10 }, () => 90_000),
  }
  const columnWidths = [900_000, 900_000, 900_000]
  const longCell = 'A'.repeat(120)

  it('returns a single chunk when all rows fit on one slide', () => {
    const chunks = splitTableContentAcrossSlides({
      content: [
        ['H1', 'H2', 'H3'],
        ['Row 1', 'A', 'B'],
      ],
      maxRows: 10,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      slideLayout,
      columnWidths,
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(2)
  })

  it('splits body rows across slides and repeats the header row', () => {
    const bodyRows = Array.from({ length: 10 }, (_, index) => [
      `Row ${index + 1}`,
      longCell,
      longCell,
    ])
    const chunks = splitTableContentAcrossSlides({
      content: [['Col A', 'Col B', 'Col C'], ...bodyRows],
      maxRows: 10,
      maxColumns: 3,
      minRows: 2,
      headerRow: true,
      slideLayout,
      columnWidths,
    })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk[0]).toEqual(['Col A', 'Col B', 'Col C'])
    }

    const totalBodyRows = chunks.reduce((sum, chunk) => sum + chunk.length - 1, 0)
    expect(totalBodyRows).toBe(10)
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
                size: { height: { magnitude: 900_000, unit: 'EMU' } },
                transform: { scaleY: 1 },
                table: {
                  rows: 10,
                  columns: 3,
                  tableColumns: columnWidthsToTableColumns([900_000, 900_000, 900_000]),
                  tableRows: Array.from({ length: 10 }, () => ({
                    rowHeight: { magnitude: 90_000, unit: 'EMU' },
                  })),
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
