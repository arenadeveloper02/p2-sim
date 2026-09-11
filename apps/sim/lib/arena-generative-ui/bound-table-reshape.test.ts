/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateStatCollection,
  aggregateTableColumn,
  parseBoundTableColumn,
  parseBoundTableColumns,
  parseProseTable,
  parseStatAggregate,
  tableCellValue,
} from '@/lib/arena-generative-ui/bound-table-reshape'

describe('parseBoundTableColumn', () => {
  it('accepts stacked display and aggregate pipes', () => {
    expect(parseBoundTableColumn('amount|currency|sum')).toEqual({
      key: 'amount',
      displayFormat: 'currency',
      aggregate: 'sum',
      indexColumn: false,
    })
    expect(parseBoundTableColumn('date|relative')).toEqual({
      key: 'date',
      displayFormat: 'relative',
      aggregate: undefined,
      indexColumn: false,
    })
    expect(parseBoundTableColumn('#')).toEqual({
      key: '#',
      displayFormat: undefined,
      aggregate: undefined,
      indexColumn: true,
    })
    expect(parseBoundTableColumn('index')).toMatchObject({ indexColumn: true, key: 'index' })
  })

  it('passes unknown pipes through as display format', () => {
    expect(parseBoundTableColumn('status|badge')).toEqual({
      key: 'status',
      displayFormat: 'badge',
      aggregate: undefined,
      indexColumn: false,
    })
  })
})

describe('tableCellValue / aggregates', () => {
  const rows = [
    { amount: 10, name: 'A' },
    { amount: '20', name: 'B' },
    { amount: 'n/a', name: 'C' },
  ]

  it('invents a 1-based index on the visible rows', () => {
    const column = parseBoundTableColumn('#')
    expect(tableCellValue(rows[0], column, 0)).toBe(1)
    expect(tableCellValue(rows[1], column, 1)).toBe(2)
  })

  it('sums numeric cells and skips non-numeric', () => {
    expect(aggregateTableColumn(rows, parseBoundTableColumn('amount|sum'))).toBe(30)
    expect(aggregateTableColumn(rows, parseBoundTableColumn('amount|avg'))).toBe(15)
    expect(aggregateTableColumn(rows, parseBoundTableColumn('name|count'))).toBe(3)
  })

  it('parses Stat aggregate tokens', () => {
    expect(parseStatAggregate('sum:amount')).toEqual({ op: 'sum', field: 'amount' })
    expect(aggregateStatCollection(rows, { op: 'max', field: 'amount' })).toBe(20)
  })
})

describe('parseProseTable', () => {
  it('parses a markdown table', () => {
    const parsed = parseProseTable(`
| Name | Score |
| --- | --- |
| Ada | 12 |
| Lin | 8 |
`)
    expect(parsed?.headers).toEqual(['Name', 'Score'])
    expect(parsed?.records).toEqual([
      { Name: 'Ada', Score: '12' },
      { Name: 'Lin', Score: '8' },
    ])
  })

  it('parses a JSON array of objects', () => {
    const parsed = parseProseTable('[{"title":"One","n":1},{"title":"Two","n":2}]')
    expect(parsed?.headers).toEqual(['title', 'n'])
    expect(parsed?.records).toHaveLength(2)
  })

  it('parses CSV', () => {
    const parsed = parseProseTable('name,amount\nAda,10\nLin,4')
    expect(parsed?.headers).toEqual(['name', 'amount'])
    expect(parsed?.records[1]).toEqual({ name: 'Lin', amount: '4' })
  })

  it('returns undefined for unstructured prose', () => {
    expect(parseProseTable('# Hello\n\nThis is an article.')).toBeUndefined()
    expect(parseBoundTableColumns('#,amount|sum').map((column) => column.key)).toEqual([
      '#',
      'amount',
    ])
  })
})
