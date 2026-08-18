# Generative UI Charts — Option A (Constrained)

LLM speaks a small chart DSL. Code builds a valid ECharts option, then SSR-renders
SVG into the static HTML page.

See also: [charts-overview.md](./charts-overview.md) · [charts-option-b.md](./charts-option-b.md)

## When to use

- Marketing / reporting HTML pages from a prompt + JSON `data`
- Haiku (or similar) single-shot Spec generation
- Predictable bar / line / area / pie only

## Catalog: Chart

```ts
const chartTypeSchema = z.enum(['bar', 'line', 'area', 'pie'])

const chartSeriesSchema = z.object({
  name: z.string(),
  /** Inline data when no server binding; omit/empty when using dataPath */
  data: z.array(z.number()).nullable(),
  color: z.string().nullable(),
})

Chart: {
  props: z.object({
    title: z.string().nullable(),
    chartType: chartTypeSchema,
    /** Category axis labels (bar/line/area). Ignored for pie categories-as-names. */
    categories: z.array(z.string()).nullable(),
    series: z.array(chartSeriesSchema).min(1).max(8),
    /**
     * Dot-path into the request `data` payload, e.g. "campaigns" or "summary.byChannel".
     * When set, server builds categories/series from that array and ignores inline
     * series.data (still uses series[].name as metric field names unless valueFields set).
     */
    dataPath: z.string().nullable(),
    /**
     * For binding mode: field on each row used as category label.
     * Default: "name" | "label" | "date" | first string field.
     */
    categoryField: z.string().nullable(),
    /**
     * For binding mode: metric field per series entry.
     * If omitted, series[i].name is treated as the row field key.
     */
    valueFields: z.array(z.string()).nullable(),
    height: z.number().min(160).max(720).nullable(),
    showLegend: z.boolean().nullable(),
    stacked: z.boolean().nullable(), // bar/area only
  }),
  description:
    'Bar, line, area, or pie chart. Prefer dataPath + series names as field keys when source data is provided; otherwise fill series.data and categories from numbers stated in the user request. Never invent metrics when data is provided.',
}
```

Also add shared `Grid`, `Metric`, and `Table` from the [overview](./charts-overview.md).

## Prompt rules (A)

Append to webpage custom rules / `GENERATIVE_UI_OUTPUT_RULES`:

```
- For dashboards: use Grid for KPI/chart rows; Metric for single numbers; Chart for trends/comparisons; Table for ranked breakdowns.
- Chart.chartType must be one of: bar, line, area, pie.
- When source data JSON is provided: set dataPath (and categoryField / series names as field keys). Do NOT invent numeric series.data.
- When no source data is provided: you may fill categories + series.data only from numbers explicitly stated in the user request.
- Keep each series.data length ≤ 60 points. Cap Table rows at 20 unless asked otherwise.
- Do not use Chart in email mode.
```

## Build path

```
Chart props + ctx.data
  → bind-data (if dataPath)
  → build-echarts-option.ts   // constrained → EChartsOptionLike
  → sanitizeEChartsOption + isEChartsOption
  → renderChartToSvg
  → <div role="img">svg</div>
```

## `build-echarts-option.ts` (sketch)

```ts
import {
  type EChartsOptionLike,
  isEChartsOption,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

export interface ChartProps {
  title: string | null
  chartType: 'bar' | 'line' | 'area' | 'pie'
  categories: string[] | null
  series: Array<{ name: string; data: number[] | null; color: string | null }>
  dataPath: string | null
  categoryField: string | null
  valueFields: string[] | null
  height: number | null
  showLegend: boolean | null
  stacked: boolean | null
}

export function buildEChartsOptionFromChartProps(
  props: ChartProps,
  rows: Record<string, unknown>[] | null
): { option: EChartsOptionLike; width: number; height: number } {
  const height = props.height ?? 320
  const width = 640
  const { categories, series } = resolveSeries(props, rows) // truncate ≤ 60

  const option: EChartsOptionLike = {
    animation: false,
    title: props.title
      ? {
          text: props.title,
          left: 'left',
          textStyle: { fontSize: 14, fontWeight: 600, color: '#0f172a' },
        }
      : undefined,
    tooltip: { trigger: props.chartType === 'pie' ? 'item' : 'axis' },
    legend: props.showLegend === false ? { show: false } : { top: 28 },
    grid: { left: 48, right: 16, top: props.title ? 56 : 32, bottom: 40 },
    ...(props.chartType !== 'pie'
      ? {
          xAxis: { type: 'category', data: categories },
          yAxis: { type: 'value' },
        }
      : {}),
    series: series.map((s) => ({
      type: props.chartType === 'area' ? 'line' : props.chartType,
      name: s.name,
      data:
        props.chartType === 'pie'
          ? categories.map((c, i) => ({ name: c, value: s.data[i] ?? 0 }))
          : s.data,
      stack: props.stacked ? 'total' : undefined,
      areaStyle: props.chartType === 'area' ? {} : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      smooth: props.chartType === 'line' || props.chartType === 'area',
    })),
  }

  const sanitized = sanitizeEChartsOption(option)
  if (!isEChartsOption(sanitized)) {
    throw new Error('Built chart option failed validation')
  }
  return { option: sanitized, width, height }
}
```

## Binding rules (`bind-data.ts`)

```ts
getByPath(data, 'daily') → unknown
assertArrayOfRecords → Record<string, unknown>[]
pickCategory(row, categoryField) → string
pickNumber(row, field) → number // Number(...); non-finite → 0
```

- If `dataPath` is set but path missing → render a visible HTML error card
  (“No data at path …”), don’t fail the whole page.
- Category fallbacks: `categoryField` → `name` | `label` | `date` | first string field.
- Values: `valueFields[i]` or `series[i].name` as numeric field key.

## `renderWebpageNode` case

```ts
case 'Chart': {
  const rows = props.dataPath ? getRows(ctx.data, props.dataPath) : null
  const built = buildEChartsOptionFromChartProps(props, rows)
  const svg = await renderChartToSvg(built)
  return `<div${styleAttr({
    width: '100%',
    minHeight: `${built.height}px`,
  })} role="img" aria-label="${escapeAttr(built.title ?? 'Chart')}">${svg}</div>`
}
```

On build/SSR failure, fallback to an inline error card instead of failing the document.

## Example Spec (marketing weekly report)

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "Page",
      "props": { "title": "Paid Social Weekly Report", "backgroundColor": "#f8fafc" },
      "children": ["hero", "kpis", "charts", "table-sec"]
    },
    "hero": {
      "type": "Section",
      "props": { "padding": "32px 24px", "maxWidth": "1100px", "backgroundColor": null },
      "children": ["h1", "sub"]
    },
    "h1": {
      "type": "Heading",
      "props": { "text": "Paid Social — Week of Aug 4", "level": "h1", "color": null },
      "children": []
    },
    "sub": {
      "type": "Text",
      "props": {
        "text": "Meta + TikTok performance vs prior week.",
        "color": null,
        "size": null
      },
      "children": []
    },
    "kpis": {
      "type": "Section",
      "props": { "padding": "0 24px 24px", "maxWidth": "1100px", "backgroundColor": null },
      "children": ["kpi-grid"]
    },
    "kpi-grid": {
      "type": "Grid",
      "props": { "columns": "4", "gap": "16px" },
      "children": ["m1", "m2", "m3", "m4"]
    },
    "m1": {
      "type": "Metric",
      "props": {
        "label": "Impressions",
        "value": "1.2M",
        "delta": "+8.2%",
        "deltaTone": "positive",
        "hint": null,
        "dataPath": null
      },
      "children": []
    },
    "m2": {
      "type": "Metric",
      "props": {
        "label": "Spend",
        "value": "$48.2k",
        "delta": "+3.1%",
        "deltaTone": "neutral",
        "hint": null,
        "dataPath": null
      },
      "children": []
    },
    "m3": {
      "type": "Metric",
      "props": {
        "label": "CTR",
        "value": "1.84%",
        "delta": "-0.12pp",
        "deltaTone": "negative",
        "hint": null,
        "dataPath": null
      },
      "children": []
    },
    "m4": {
      "type": "Metric",
      "props": {
        "label": "CPA",
        "value": "$14.20",
        "delta": "-6%",
        "deltaTone": "positive",
        "hint": null,
        "dataPath": null
      },
      "children": []
    },
    "charts": {
      "type": "Section",
      "props": { "padding": "8px 24px 24px", "maxWidth": "1100px", "backgroundColor": null },
      "children": ["chart-grid"]
    },
    "chart-grid": {
      "type": "Grid",
      "props": { "columns": "2", "gap": "16px" },
      "children": ["c1-card", "c2-card"]
    },
    "c1-card": {
      "type": "Card",
      "props": { "title": null, "padding": "16px", "backgroundColor": "#ffffff" },
      "children": ["c1"]
    },
    "c1": {
      "type": "Chart",
      "props": {
        "title": "Spend by day",
        "chartType": "line",
        "categories": null,
        "series": [{ "name": "spend", "data": null, "color": "#0f172a" }],
        "dataPath": "daily",
        "categoryField": "date",
        "valueFields": ["spend"],
        "height": 320,
        "showLegend": false,
        "stacked": false
      },
      "children": []
    },
    "c2-card": {
      "type": "Card",
      "props": { "title": null, "padding": "16px", "backgroundColor": "#ffffff" },
      "children": ["c2"]
    },
    "c2": {
      "type": "Chart",
      "props": {
        "title": "Spend by channel",
        "chartType": "pie",
        "categories": null,
        "series": [{ "name": "spend", "data": null, "color": null }],
        "dataPath": "byChannel",
        "categoryField": "channel",
        "valueFields": ["spend"],
        "height": 320,
        "showLegend": true,
        "stacked": null
      },
      "children": []
    },
    "table-sec": {
      "type": "Section",
      "props": { "padding": "0 24px 48px", "maxWidth": "1100px", "backgroundColor": null },
      "children": ["tbl-card"]
    },
    "tbl-card": {
      "type": "Card",
      "props": { "title": "Top campaigns", "padding": "16px", "backgroundColor": "#ffffff" },
      "children": ["tbl"]
    },
    "tbl": {
      "type": "Table",
      "props": {
        "title": null,
        "columns": [
          { "key": "campaign", "label": "Campaign", "align": "left" },
          { "key": "spend", "label": "Spend", "align": "right" },
          { "key": "ctr", "label": "CTR", "align": "right" },
          { "key": "cpa", "label": "CPA", "align": "right" }
        ],
        "rows": null,
        "dataPath": "campaigns",
        "maxRows": 10
      },
      "children": []
    }
  }
}
```

Example request `data`:

```json
{
  "daily": [{ "date": "Aug 4", "spend": 6200 }],
  "byChannel": [
    { "channel": "Meta", "spend": 31000 },
    { "channel": "TikTok", "spend": 17200 }
  ],
  "campaigns": [
    { "campaign": "Prospecting A", "spend": 12000, "ctr": 0.021, "cpa": 11.4 }
  ]
}
```

## Proposed files

```
apps/sim/lib/generative-ui/
  catalogs.ts                 # add Grid, Metric, Chart, Table
  generate-html.ts            # pass data into prompt + render context
  render-spec.ts              # async walker + new cases
  dashboard/
    bind-data.ts
    build-echarts-option.ts
    render-chart-svg.ts       # shared with Option B
    format-metric.ts
    render-table.ts
```

## Tests

| Test | Assert |
|------|--------|
| `build-echarts-option.test.ts` | bar/line/area/pie from inline props |
| binding | `dataPath` + `categoryField` fills series; missing path → error card |
| sanitize / `isEChartsOption` | built options pass |
| `render-chart-svg.test.ts` | SVG string contains `<svg` |
| `render-spec` integration | Spec with Chart → HTML doc includes SVG |
| catalog validate | rejects `chartType: 'heatmap'` |

## Pros / cons

**Pros:** reliable LLM output; small tokens; safe defaults; easy to document; data binding is natural.

**Cons:** limited chart types; custom ECharts features (markLine, visualMap, dual axis) need code changes; not a drop-in for Chart Generator JSON.

## Implementation order (A)

1. Zod catalog entries + prompt rules
2. `build-echarts-option` + `bind-data` + unit tests
3. `render-chart-svg` + `Chart` case in `render-spec`
4. `Grid` / `Metric` / `Table` cases
5. `data` on API / block / generate-html
6. Tracing include for `echarts`
7. Golden fixture: marketing weekly report Spec → HTML snapshot
