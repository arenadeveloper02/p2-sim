/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isEChartsOption,
  parseEChartsOptionFromString,
  parseEChartsOptionsFromString,
  resolveEChartsOptionFromContent,
  resolveEChartsOptionsFromContent,
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

  it('rejects series entries without a type string', () => {
    expect(isEChartsOption({ series: [{ data: [1, 2] }] })).toBe(false)
    expect(isEChartsOption({ series: [{ type: '', data: [1] }] })).toBe(false)
  })

  it('accepts any non-empty series type string (extensible chart types)', () => {
    expect(isEChartsOption({ series: [{ type: 'themeRiver', data: [1] }] })).toBe(true)
    expect(isEChartsOption({ series: [{ type: 'customViz', data: [1] }] })).toBe(true)
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
    const fenced = `\`\`\`json\n${JSON.stringify(validOption)}\n\`\`\``
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

const barOption = {
  title: { text: 'Bar' },
  xAxis: { type: 'value' },
  yAxis: { type: 'category', data: ['A', 'B'] },
  series: [{ type: 'bar', data: [1, 2] }],
}

const heatmapOption = {
  title: { text: 'Heatmap' },
  xAxis: { type: 'category', data: ['X1', 'X2'] },
  yAxis: { type: 'category', data: ['Y1', 'Y2'] },
  visualMap: { min: 0, max: 10 },
  series: [
    {
      type: 'heatmap',
      data: [
        [0, 0, 5],
        [1, 1, 3],
      ],
    },
  ],
}

const dashboardPayload = {
  charts: [heatmapOption, barOption],
  count: 2,
}

describe('resolveEChartsOptionsFromContent', () => {
  it('resolves a single option as a one-item array', () => {
    expect(resolveEChartsOptionsFromContent(validOption)).toEqual([validOption])
  })

  it('resolves a dashboard wrapper with multiple charts', () => {
    expect(resolveEChartsOptionsFromContent(dashboardPayload)).toEqual([heatmapOption, barOption])
  })

  it('resolves a dashboard wrapper from a JSON string', () => {
    expect(resolveEChartsOptionsFromContent(JSON.stringify(dashboardPayload))).toEqual([
      heatmapOption,
      barOption,
    ])
  })

  it('parses a fenced dashboard JSON string', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(dashboardPayload)}\n\`\`\``
    expect(parseEChartsOptionsFromString(fenced)).toEqual([heatmapOption, barOption])
  })

  it('resolves a bare JSON array of options', () => {
    expect(resolveEChartsOptionsFromContent([heatmapOption, barOption])).toEqual([
      heatmapOption,
      barOption,
    ])
  })

  it('returns null when charts array is empty or invalid', () => {
    expect(resolveEChartsOptionsFromContent({ charts: [] })).toBeNull()
    expect(resolveEChartsOptionsFromContent({ charts: [{ foo: 'bar' }] })).toBeNull()
    expect(resolveEChartsOptionsFromContent('hello world')).toBeNull()
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
