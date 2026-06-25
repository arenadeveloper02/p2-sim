/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTableCellTextEndIndexMap,
  buildTableContentRequests,
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
