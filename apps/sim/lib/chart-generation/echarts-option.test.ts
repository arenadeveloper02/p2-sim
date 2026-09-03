/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  extractChartsFromData,
  formatChartDeployOutputForChat,
  formatChartsForChat,
  isEChartsOption,
  parseEChartsOptionFromString,
  parseEChartsOptionsFromString,
  resolveEChartsOptionFromContent,
  resolveEChartsOptionsFromContent,
  sanitizeEChartsOption,
  stripEChartsJsonFromContent,
  stripIncompleteTrailingChartJson,
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

  it('parses dashboard JSON embedded after agent text (deployed chat)', () => {
    const mixed = `Total spend is $1,200.\n\n\`\`\`json\n${JSON.stringify(dashboardPayload)}\n\`\`\``
    expect(resolveEChartsOptionsFromContent(mixed)).toEqual([heatmapOption, barOption])
  })

  it('strips embedded chart JSON from mixed content', () => {
    const mixed = `Total spend is $1,200.\n\n\`\`\`json\n${JSON.stringify(dashboardPayload)}\n\`\`\``
    expect(stripEChartsJsonFromContent(mixed)).toBe('Total spend is $1,200.')
  })

  it('parses un-fenced bare option JSON appended after text (chart generator mixed mode)', () => {
    const mixed = `Campaign A has the best CTR at 4.2%.\n\n${JSON.stringify(barOption, null, 2)}`
    expect(resolveEChartsOptionsFromContent(mixed)).toEqual([barOption])
    expect(stripEChartsJsonFromContent(mixed)).toBe('Campaign A has the best CTR at 4.2%.')
  })

  it('parses un-fenced bare array JSON appended after text', () => {
    const mixed = `Here is the comparison you asked for.\n\n${JSON.stringify([heatmapOption, barOption])}`
    expect(resolveEChartsOptionsFromContent(mixed)).toEqual([heatmapOption, barOption])
    expect(stripEChartsJsonFromContent(mixed)).toBe('Here is the comparison you asked for.')
  })

  it('does not strip non-chart JSON from text', () => {
    const mixed = `Some config:\n\n${JSON.stringify({ foo: 'bar' })}`
    expect(resolveEChartsOptionsFromContent(mixed)).toBeNull()
    expect(stripEChartsJsonFromContent(mixed)).toBe(mixed)
  })
})

describe('formatChartDeployOutputForChat', () => {
  it('formats dashboard output when charts exist', () => {
    expect(formatChartDeployOutputForChat(dashboardPayload)).toContain('"charts"')
  })

  it('returns null for empty dashboard', () => {
    expect(formatChartDeployOutputForChat({ charts: [], count: 0 })).toBeNull()
  })
})

describe('extractChartsFromData', () => {
  it('finds a chart nested in an Agent tool-call result', () => {
    const blockOutput = {
      content: 'Here is your chart.',
      toolCalls: {
        list: [
          {
            name: 'chart_generator',
            result: {
              charts: [barOption],
              count: 1,
              content: JSON.stringify(barOption),
              dashboard: { charts: [barOption], count: 1 },
            },
          },
        ],
        count: 1,
      },
    }
    // De-duplicated: barOption appears via charts, content, and dashboard.
    expect(extractChartsFromData(blockOutput)).toEqual([barOption])
  })

  it('finds multiple distinct charts and de-duplicates identical ones', () => {
    const data = { a: { charts: [barOption] }, b: JSON.stringify(heatmapOption), c: barOption }
    const charts = extractChartsFromData(data)
    expect(charts).toHaveLength(2)
    expect(charts).toEqual(expect.arrayContaining([barOption, heatmapOption]))
  })

  it('returns an empty array for text-only / non-chart data', () => {
    expect(
      extractChartsFromData({ content: 'no chart here', toolCalls: { list: [], count: 0 } })
    ).toEqual([])
    expect(extractChartsFromData('plain text')).toEqual([])
    expect(extractChartsFromData(null)).toEqual([])
  })
})

describe('formatChartsForChat', () => {
  it('returns null for no charts', () => {
    expect(formatChartsForChat([])).toBeNull()
  })

  it('emits a single bare option for one chart', () => {
    const content = formatChartsForChat([barOption])
    expect(content).not.toBeNull()
    expect(resolveEChartsOptionsFromContent(content as string)).toEqual([barOption])
  })

  it('emits a { charts } wrapper for multiple charts', () => {
    const content = formatChartsForChat([barOption, heatmapOption])
    expect(content).not.toBeNull()
    expect(resolveEChartsOptionsFromContent(content as string)).toEqual([barOption, heatmapOption])
  })
})

describe('sanitizeEChartsOption', () => {
  it('returns a defensive copy without mutating the original', () => {
    const result = sanitizeEChartsOption(validOption)
    expect(result).not.toBe(validOption)
    expect(validOption.xAxis).toEqual({ type: 'category', data: ['A', 'B'] })
    expect(validOption).not.toHaveProperty('grid')
  })

  it('truncates oversized series data', () => {
    const big = {
      series: [{ type: 'line', data: Array.from({ length: 6000 }, (_, i) => i) }],
    }
    const result = sanitizeEChartsOption(big)
    expect((result.series[0].data as number[]).length).toBe(5000)
    expect((big.series[0].data as number[]).length).toBe(6000)
  })

  it('centers labels and disables rotate for 8 or fewer categories', () => {
    const option = {
      title: { text: 'Spend vs Conversions by Campaign' },
      legend: {},
      grid: { left: 48, right: 24, top: 56, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['Brand Search', 'Generic Search', 'Retargeting', 'Prospecting', 'Competitor Search'],
        axisLabel: { rotate: 30 },
      },
      yAxis: [
        { type: 'value', name: 'Spend ($)' },
        { type: 'value', name: 'Conversions' },
      ],
      series: [
        { type: 'bar', name: 'Spend', data: [1, 2, 3, 4, 5] },
        { type: 'bar', name: 'Conversions', yAxisIndex: 1, data: [1, 2, 3, 4, 5] },
      ],
    }
    const result = sanitizeEChartsOption(option)
    const xAxis = result.xAxis as Record<string, unknown>
    const axisLabel = xAxis.axisLabel as Record<string, unknown>
    const grid = result.grid as Record<string, unknown>
    expect(axisLabel.rotate).toBe(0)
    expect(axisLabel.interval).toBe(0)
    expect(axisLabel.align).toBe('center')
    expect(grid.containLabel).toBe(true)
    expect(grid.right).toBe(64)
    expect(grid.top).toBe(72)
    expect(grid.bottom).toBe(56)
  })

  it('anchors rotated labels when there are many categories', () => {
    const option = {
      xAxis: {
        type: 'category',
        data: Array.from({ length: 12 }, (_, i) => `Campaign ${i}`),
        axisLabel: { rotate: 30 },
      },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: Array.from({ length: 12 }, () => 1) }],
    }
    const result = sanitizeEChartsOption(option)
    const axisLabel = (result.xAxis as Record<string, unknown>).axisLabel as Record<string, unknown>
    const grid = result.grid as Record<string, unknown>
    expect(axisLabel.rotate).toBe(30)
    expect(axisLabel.align).toBe('right')
    expect(axisLabel.verticalAlign).toBe('middle')
    expect(grid.bottom).toBe(88)
  })

  it('does not add cartesian grid layout to pie charts', () => {
    const pie = {
      series: [{ type: 'pie', data: [{ value: 1, name: 'A' }] }],
    }
    const result = sanitizeEChartsOption(pie)
    expect(result.grid).toBeUndefined()
    expect(result.series).toEqual(pie.series)
  })
})

describe('stripIncompleteTrailingChartJson', () => {
  it('hides an unterminated trailing ```json fence while it streams', () => {
    const streaming = 'CTR improved 12% this week.\n\n```json\n{"title": {"text": "CTR"}, "ser'
    expect(stripIncompleteTrailingChartJson(streaming)).toBe('CTR improved 12% this week.')
  })

  it('hides an unterminated ```echarts fence and a partially streamed language tag', () => {
    expect(stripIncompleteTrailingChartJson('Answer.\n\n```echarts\n{"series"')).toBe('Answer.')
    expect(stripIncompleteTrailingChartJson('Answer.\n\n```jso')).toBe('Answer.')
    expect(stripIncompleteTrailingChartJson('Answer.\n\n```')).toBe('Answer.')
  })

  it('keeps an unterminated fence that is clearly not JSON', () => {
    const code = 'Here is the query:\n\n```sql\nSELECT * FROM campaigns'
    expect(stripIncompleteTrailingChartJson(code)).toBe(code)
  })

  it('hides a trailing bare JSON object whose braces have not balanced yet', () => {
    const streaming = 'Spend by campaign:\n\n{"title": {"text": "Spend"}, "series": [{"type": "bar"'
    expect(stripIncompleteTrailingChartJson(streaming)).toBe('Spend by campaign:')
  })

  it('returns finalized content unchanged (complete fence and balanced bare JSON)', () => {
    const fenced = `Answer.\n\n\`\`\`json\n${JSON.stringify(validOption)}\n\`\`\``
    expect(stripIncompleteTrailingChartJson(fenced)).toBe(fenced)

    const bare = `Answer.\n\n${JSON.stringify(validOption)}`
    expect(stripIncompleteTrailingChartJson(bare)).toBe(bare)
  })

  it('returns plain prose and markdown tables unchanged', () => {
    const prose = 'Impressions rose.\n\n| Campaign | CTR |\n| --- | --- |\n| A | 2.1% |'
    expect(stripIncompleteTrailingChartJson(prose)).toBe(prose)
  })

  it('keeps completed charts visible while a second chart streams in', () => {
    const first = JSON.stringify(validOption)
    const streaming = `Answer.\n\n${first}\n\n{"title": {"text": "Second"}, "ser`
    expect(stripIncompleteTrailingChartJson(streaming)).toBe(`Answer.\n\n${first}`)
  })
})
