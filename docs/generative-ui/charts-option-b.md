# Generative UI Charts — Option B (ECharts Pass-through)

LLM (or upstream Chart Generator) supplies a full ECharts `option`. Generative UI
validates lightly, sanitizes, SSR-renders SVG, and places it in the page layout.

See also: [charts-overview.md](./charts-overview.md) · [charts-option-a.md](./charts-option-a.md)

## When to use

- Need chart types beyond bar/line/area/pie (radar, heatmap, funnel, …) without catalog churn
- Workflow already produces Chart Generator `charts[]` (ECharts options)
- Power-user / agent flows that emit ECharts JSON reliably

## Catalog: EChart

Prefer a **separate component name** so the model doesn’t mix Option A and B shapes:

```ts
EChart: {
  props: z.object({
    title: z.string().nullable(), // page chrome / aria; option.title still allowed
    height: z.number().min(160).max(720).nullable(),
    width: z.number().min(320).max(1200).nullable(),
    /**
     * Full Apache ECharts option object. Must include non-empty series[].
     * No JavaScript functions. animation will be forced off at render time.
     */
    option: z.record(z.string(), z.unknown()).nullable(),
    /**
     * Resolve option from request `charts` input instead of embedding in Spec.
     * e.g. "0" or "spend-by-day"
     */
    optionRef: z.string().nullable(),
    /**
     * Optional advanced: refill series from request data. MVP may leave unused.
     */
    dataPath: z.string().nullable(),
  }),
  description:
    'Renders a full ECharts option as SVG. Provide option (inline) or optionRef (index/name into request charts[]). option.series must be a non-empty array of objects with a string type. Prefer this when upstream already produced ECharts JSON. Do not wrap option in markdown. Keep series data ≤ 5000 points (server truncates).',
}
```

Require at least one of `option` | `optionRef` via catalog description + post-validate
(or `superRefine` if you keep Zod at the catalog layer).

Also add shared `Grid`, `Metric`, and `Table` from the [overview](./charts-overview.md).

### Discriminated alternative (single `Chart` type)

```ts
Chart: {
  props: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('simple'),
      // …all Option A fields
    }),
    z.object({
      mode: z.literal('echarts'),
      title: z.string().nullable(),
      height: z.number().min(160).max(720).nullable(),
      width: z.number().min(320).max(1200).nullable(),
      option: z.record(z.string(), z.unknown()).nullable(),
      optionRef: z.string().nullable(),
      dataPath: z.string().nullable(),
    }),
  ]),
  description:
    'mode=simple for constrained charts; mode=echarts for full option JSON.',
}
```

**Prefer separate `EChart` for introducing B:** simpler prompts and clearer failures.

## Post-catalog validation

Zod `z.record` is not enough. After `catalog.validate`:

```ts
function resolveEChartOption(
  props: { option: unknown; optionRef: string | null },
  charts: EChartsOptionLike[] | undefined
): EChartsOptionLike {
  if (props.optionRef != null && props.optionRef !== '') {
    const byIndex = charts?.[Number(props.optionRef)]
    const byName = charts?.find((c) => c.id === props.optionRef) // if you stamp ids
    const resolved = byIndex ?? byName
    if (!resolved || !isEChartsOption(resolved)) {
      throw new Error(`EChart.optionRef "${props.optionRef}" did not resolve`)
    }
    return resolved
  }

  if (!isEChartsOption(props.option)) {
    throw new Error('EChart.option must be a valid ECharts option with series[].type')
  }
  return props.option
}
```

Walk Spec elements of type `EChart` and resolve/validate each before or during render.

At render:

```ts
const option = sanitizeEChartsOption(resolved)
const ssrOption = { ...option, animation: false }
```

### Defensive cleanup

Mirror Chart Generator rules: no JS functions in JSON.

```ts
/** Drop or null out string values that look like function bodies. */
function stripFunctionLikeFields(value: unknown): unknown
```

`sanitizeEChartsOption` already truncates series data at 5000 points.

## Prompt rules (B)

```
- EChart: provide either props.option (full ECharts option) or props.optionRef into the provided charts list.
- option must be a single bare ECharts option object (not an array, not { charts: [...] }).
- option.series must be a non-empty array; each entry needs a string type (bar, line, pie, …).
- Valid JSON only: no markdown fences, no JavaScript functions, no trailing commas.
- Use only metrics from provided source data / charts; never invent values.
- For multiple charts on one page: one EChart element per chart, not one option array.
- Prefer Card > EChart for chrome; put human title on Card or EChart.title.
- Keep Spec small: prefer optionRef when charts[] is supplied instead of pasting large options.
```

Reuse wording from Chart Generator’s `ECHARTS_JSON_GENERATOR_SKILL` / system prompt where useful.

## Build / render path

```
EChart props
  → resolve option | optionRef → charts[]
  → isEChartsOption
  → sanitizeEChartsOption
  → force animation: false
  → renderChartToSvg({ option, width, height })
  → HTML wrapper + aria-label from title
```

### Optional data merge

MVP: **skip** `dataPath` merge — require `option` / upstream `charts` to embed data.

Advanced (later): refill `series[i].data` from rows when a convention field is present.

## Example Spec fragment (inline option)

```json
{
  "type": "EChart",
  "props": {
    "title": "Spend by day",
    "height": 320,
    "width": 640,
    "optionRef": null,
    "dataPath": null,
    "option": {
      "title": { "text": "Spend by day" },
      "tooltip": { "trigger": "axis" },
      "xAxis": {
        "type": "category",
        "data": ["Aug 4", "Aug 5", "Aug 6"]
      },
      "yAxis": { "type": "value" },
      "series": [
        {
          "type": "line",
          "name": "Spend",
          "smooth": true,
          "data": [6200, 7100, 6800]
        }
      ]
    }
  },
  "children": []
}
```

## Example Spec fragment (`optionRef`)

```json
{
  "type": "EChart",
  "props": {
    "title": "Spend by day",
    "height": 320,
    "width": null,
    "option": null,
    "optionRef": "0",
    "dataPath": null
  },
  "children": []
}
```

## Composition with Chart Generator

```
[Data source] → [Chart Generator] → charts[] (ECharts options)
                 ↘
[Generative UI]  → layout Spec with EChart nodes
                 → resolve optionRef → SSR SVG → HTML
```

### Integration styles

1. **LLM layout + inline options** — pass data + chart JSONs in the prompt; model
   copies into `EChart.option`. Token-heavy; fragile.
2. **Code merge via `optionRef` (preferred)** — LLM emits layout placeholders;
   server maps refs to `params.charts[i]`.

### Extended request body (recommended)

```ts
{
  userInput: string
  mode: 'webpage'
  data?: unknown
  charts?: EChartsOptionLike[] // prebuilt options from upstream
}
```

Wire through:

- `apps/sim/lib/api/contracts/tools/generative-ui.ts`
- tool params + block subblock (optional JSON input)
- `generate-html.ts` → `WebpageRenderContext.charts`

## `renderWebpageNode` case

```ts
case 'EChart': {
  const resolved = resolveEChartOption(props, ctx.charts)
  const sanitized = sanitizeEChartsOption(resolved)
  const height = typeof props.height === 'number' ? props.height : 320
  const width = typeof props.width === 'number' ? props.width : 640
  const svg = await renderChartToSvg({
    option: { ...sanitized, animation: false },
    width,
    height,
  })
  const label = asNullableString(props.title) ?? 'Chart'
  return `<div${styleAttr({
    width: '100%',
    minHeight: `${height}px`,
  })} role="img" aria-label="${escapeAttr(label)}">${svg}</div>`
}
```

## Proposed files

```
apps/sim/lib/generative-ui/
  catalogs.ts                 # EChart (+ Grid/Metric/Table)
  generate-html.ts            # data + charts into prompt/context
  render-spec.ts              # case 'EChart'
  dashboard/
    render-chart-svg.ts       # shared with Option A
    resolve-echart-option.ts  # isEChartsOption, optionRef, sanitize
    strip-function-fields.ts
    render-table.ts
    format-metric.ts
```

No `build-echarts-option.ts` required for pure B.

## Tests

| Test | Assert |
|------|--------|
| `resolve-echart-option` | inline option validates; bad series rejected |
| `optionRef` | `"0"` resolves from `charts[]`; missing ref → error card |
| `strip-function-fields` | function-like strings removed |
| `render-chart-svg` | SVG contains `<svg` for a sample option |
| catalog | accepts heatmap/radar series types via pass-through |
| integration | layout Spec + charts[] → HTML with multiple SVGs |

## Pros / cons

**Pros:** full ECharts power; aligns with Chart Generator output; fewer catalog
iterations for new chart types.

**Cons:** larger/more fragile Specs; validation is structural only; bad options
SSR-fail or look wrong; token pressure if options embed large series inline;
harder for Haiku without `optionRef`.

## Implementation order (B)

1. Shared SSR helper + Grid/Metric/Table (if not already from A)
2. `EChart` catalog + prompt rules
3. `resolve-echart-option` + sanitize/strip
4. `charts` / `optionRef` on API + block
5. `render-spec` case + golden fixture with Chart Generator-shaped options
6. Document email unsupported

## Relation to Option A

| Concern | Guidance |
|---------|----------|
| Default Generative UI chart | Ship **A** first |
| Chart Generator → HTML page | Add **B** with `optionRef` |
| One component forever | Optional later merge via `Chart.mode` discriminant |
