/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isEChartsOption,
  parseEChartsOptionFromString,
  resolveEChartsOptionFromContent,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

const validOption = {
  title: { text: 'Impressions' },
  xAxis: { type: 'category', data: ['A', 'B'] },
  yAxis: { type: 'value' },
  series: [{ name: 'Impressions', type: 'bar', data: [1, 2] }],
}

describe('isEChartsOption', () => {
  it('accepts a valid option with typed series', () => {
    expect(isEChartsOption(validOption)).toBe(true)
  })

  it('rejects arbitrary objects without series', () => {
    expect(isEChartsOption({ foo: 'bar' })).toBe(false)
    expect(isEChartsOption({ data: [1, 2, 3] })).toBe(false)
  })

  it('rejects series entries without a recognized type', () => {
    expect(isEChartsOption({ series: [{ data: [1, 2] }] })).toBe(false)
    expect(isEChartsOption({ series: [{ type: 'unknown', data: [1] }] })).toBe(false)
  })

  it('rejects non-objects and empty series', () => {
    expect(isEChartsOption(null)).toBe(false)
    expect(isEChartsOption('bar')).toBe(false)
    expect(isEChartsOption([])).toBe(false)
    expect(isEChartsOption({ series: [] })).toBe(false)
  })
})

describe('parseEChartsOptionFromString', () => {
  it('parses a raw JSON option string', () => {
    expect(parseEChartsOptionFromString(JSON.stringify(validOption))).toEqual(validOption)
  })

  it('parses a fenced json code block', () => {
    const fenced = '```json\n' + JSON.stringify(validOption) + '\n```'
    expect(parseEChartsOptionFromString(fenced)).toEqual(validOption)
  })

  it('returns null for non-option JSON and invalid input', () => {
    expect(parseEChartsOptionFromString(JSON.stringify({ foo: 'bar' }))).toBeNull()
    expect(parseEChartsOptionFromString('not json')).toBeNull()
    expect(parseEChartsOptionFromString('')).toBeNull()
  })
})

describe('resolveEChartsOptionFromContent', () => {
  it('resolves from an object', () => {
    expect(resolveEChartsOptionFromContent(validOption)).toEqual(validOption)
  })

  it('resolves from a string', () => {
    expect(resolveEChartsOptionFromContent(JSON.stringify(validOption))).toEqual(validOption)
  })

  it('returns null for unrelated content', () => {
    expect(resolveEChartsOptionFromContent('hello world')).toBeNull()
    expect(resolveEChartsOptionFromContent({ message: 'hi' })).toBeNull()
  })
})

describe('sanitizeEChartsOption', () => {
  it('returns a defensive copy', () => {
    const result = sanitizeEChartsOption(validOption)
    expect(result).toEqual(validOption)
    expect(result).not.toBe(validOption)
  })

  it('truncates oversized series data', () => {
    const big = {
      series: [{ type: 'line', data: Array.from({ length: 6000 }, (_, i) => i) }],
    }
    const result = sanitizeEChartsOption(big)
    expect((result.series[0].data as number[]).length).toBe(5000)
    expect((big.series[0].data as number[]).length).toBe(6000)
  })
})
