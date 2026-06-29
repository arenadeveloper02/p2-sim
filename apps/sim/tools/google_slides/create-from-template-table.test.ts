/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTableCellTextEndIndexMap,
  buildTableContentRequests,
  buildTableExpandColumnWidthRequests,
  findTableColumnLayout,
  findTableDimensions,
  normalizeTableContent,
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
                          textElements: [{ endIndex: 9 }, { endIndex: 9, textRun: { content: 'Header 1\n' } }],
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

describe('buildTableExpandColumnWidthRequests', () => {
  it('redistributes original total column width after trimming', () => {
    const requests = buildTableExpandColumnWidthRequests({
      tableObjectId: 'table_1',
      templateColumns: 8,
      keepColumns: 2,
      layout: {
        columnWidths: Array.from({ length: 8 }, () => 1_000_000),
      },
    })

    expect(requests).toEqual([
      {
        updateTableColumnProperties: {
          objectId: 'table_1',
          columnIndices: [0, 1],
          tableColumnProperties: {
            columnWidth: { magnitude: 4_000_000, unit: 'EMU' },
          },
          fields: 'columnWidth',
        },
      },
    ])
  })

  it('skips expand requests when no columns were removed', () => {
    const requests = buildTableExpandColumnWidthRequests({
      tableObjectId: 'table_1',
      templateColumns: 2,
      keepColumns: 2,
      layout: {
        columnWidths: [1_000_000, 1_000_000],
      },
    })

    expect(requests).toEqual([])
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

  it('expands remaining column widths when layout is provided after trimming', () => {
    const requests = buildTableContentRequests({
      tableObjectId: 'table_1',
      templateRows: 8,
      templateColumns: 8,
      minRows: 2,
      minColumns: 2,
      content: [
        ['A', 'B'],
        ['C', 'D'],
      ],
      layout: {
        columnWidths: Array.from({ length: 8 }, () => 1_000_000),
      },
    })

    expect(requests.some((r) => 'updateTableColumnProperties' in r)).toBe(true)
    expect(requests.some((r) => 'updateTableRowProperties' in r)).toBe(false)

    const columnUpdate = requests.find((r) => 'updateTableColumnProperties' in r)
    expect(columnUpdate).toMatchObject({
      updateTableColumnProperties: {
        columnIndices: [0, 1],
        tableColumnProperties: {
          columnWidth: { magnitude: 4_000_000, unit: 'EMU' },
        },
      },
    })
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
