/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
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
    })

    expect(requests.filter((r) => 'deleteTableRow' in r)).toHaveLength(4)
    expect(requests.filter((r) => 'deleteTableColumn' in r)).toHaveLength(2)

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
})
