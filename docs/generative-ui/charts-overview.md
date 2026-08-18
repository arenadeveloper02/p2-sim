# Generative UI — Chart & Dashboard Support (Overview)

Design sketch for adding chart/dashboard components to the Generative UI
(`generative_ui`) block, which uses json-render catalogs and renders a **static
HTML string**.

| Doc | Contents |
|-----|----------|
| [charts-overview.md](./charts-overview.md) | Shared context, primitives, SSR, phased plan |
| [charts-option-a.md](./charts-option-a.md) | Constrained Chart DSL → build ECharts option |
| [charts-option-b.md](./charts-option-b.md) | Full ECharts `option` pass-through (+ `optionRef`) |

## Scope

- **Mode in scope:** `webpage` (MVP)
- **Out of scope (MVP):** email charts, interactive hydrate, streaming Spec patches
- **Existing assets to reuse:**
  - `echarts` (already in `apps/sim/package.json`)
  - `lib/chart-generation/echarts-option.ts` — `isEChartsOption`, `sanitizeEChartsOption`
  - Chart Generator block + prompts/skills

## Current pipeline

```
userInput (+ optional data)
  → catalog.prompt()
  → LLM Spec JSON { root, elements }
  → catalog.validate()
  → renderGenerativeUiSpecToHtml(mode, spec)
       email: @json-render/react-email
       webpage: hand-rolled HTML string walker (render-spec.ts)
  → { html, spec, mode }
```

Relevant code:

- `apps/sim/lib/generative-ui/catalogs.ts`
- `apps/sim/lib/generative-ui/render-spec.ts`
- `apps/sim/lib/generative-ui/generate-html.ts`
- `apps/sim/blocks/blocks/generative_ui.ts`
- `apps/sim/lib/api/contracts/tools/generative-ui.ts`

## Why two chart options?

| | Option A — Constrained | Option B — ECharts pass-through |
|--|------------------------|----------------------------------|
| LLM emits | `chartType`, categories, series / dataPath | Full ECharts `option` object |
| Reliability | Higher (small vocabulary) | Lower (huge surface, easy to break JSON) |
| Expressiveness | bar / line / area / pie | Any ECharts type (radar, heatmap, …) |
| Validation | Tight Zod + builder | Loose Zod + `isEChartsOption` |
| Best for | Marketing report pages, predictable HTML | Power users / Chart Generator → page layout |

**Recommendation:** ship **Option A** as the default catalog `Chart`. Add Option B as
`EChart` (or a discriminated `Chart.mode`) when composing with Chart Generator output.

## Shared dashboard primitives

Add these to `webpageCatalog` regardless of A vs B.

### Grid

```ts
Grid: {
  props: z.object({
    columns: z.enum(['2', '3', '4']).nullable(), // default '2'
    gap: z.string().nullable(),
  }),
  slots: ['default'],
  description:
    'CSS grid for dashboard rows. Children: Card, Metric, Chart, Table.',
}
```

Render: `display:grid; grid-template-columns: repeat(N, minmax(0,1fr)); gap:…`

Optional: class `gui-grid` + one document `<style>` for mobile single column:

```css
@media (max-width: 768px) {
  .gui-grid {
    grid-template-columns: 1fr !important;
  }
}
```

### Metric

```ts
Metric: {
  props: z.object({
    label: z.string(),
    value: z.string(), // preformatted display string
    delta: z.string().nullable(),
    deltaTone: z.enum(['positive', 'negative', 'neutral']).nullable(),
    hint: z.string().nullable(),
    dataPath: z.string().nullable(), // optional server fill from request data
  }),
  description: 'KPI / stat card for a single metric.',
}
```

### Table

```ts
Table: {
  props: z.object({
    title: z.string().nullable(),
    columns: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          align: z.enum(['left', 'right', 'center']).nullable(),
        })
      )
      .min(1)
      .max(12),
    rows: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
      .nullable(),
    dataPath: z.string().nullable(),
    maxRows: z.number().min(1).max(50).nullable(),
  }),
  description: 'Simple data table. Prefer dataPath when source data is provided.',
}
```

## Data input (API + block)

```ts
// contract body
{
  userInput: z.string().min(1),
  mode: z.enum(['email', 'webpage']),
  data: z.unknown().optional(),
}
```

- Block: optional `data` long-input (especially for webpage).
- Prompt includes truncated JSON; render-time binding can use the full payload.
- Prompt rule: when `data` is provided, never invent metrics.

## SSR SVG (shared)

```ts
// lib/generative-ui/dashboard/render-chart-svg.ts
export async function renderChartToSvg(built: {
  option: EChartsOptionLike
  width: number
  height: number
}): Promise<string> {
  const echarts = await import('echarts')
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: built.width,
    height: built.height,
  })
  chart.setOption({ ...built.option, animation: false })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}
```

Also update `apps/sim/next.config.ts` `outputFileTracingIncludes` for
`/api/tools/generative_ui/*` to include `echarts` (today only `@json-render` /
`@react-email`).

Wrap SVG for layout:

```html
<div style="width:100%;overflow:hidden" role="img" aria-label="…">
  <!-- svg -->
</div>
```

## Render context

Thread context through the webpage walker (charts make webpage render async):

```ts
interface WebpageRenderContext {
  data?: unknown
  charts?: EChartsOptionLike[] // Option B + optionRef
}

async function renderWebpageNode(
  spec: Spec,
  key: string,
  ctx: WebpageRenderContext
): Promise<string>
```

## Styling tokens

Align with existing webpage defaults (inline styles only):

| Token | Value |
|--------|--------|
| Page bg | `#f8fafc` |
| Card / Metric bg | `#ffffff` |
| Border | `#e2e8f0` |
| Title | `#0f172a` |
| Muted | `#64748b` |
| Radius | `12px` |
| Positive delta | `#15803d` |
| Negative delta | `#b91c1c` |

## Decision guide

| Question | Choose |
|----------|--------|
| Default marketing weekly HTML report from a prompt + JSON data? | **A** |
| Need heatmap / radar / funnel / candlestick without code changes? | **B** |
| Workflow already has Chart Generator `charts` output? | **B + optionRef** |
| Single-block “describe a dashboard” with Haiku? | **A** |
| Want one component type forever? | Discriminated `Chart.mode` (A+B hybrid) |

## Phased plan

1. **Phase 1:** Option A `Chart` + `Grid` + `Metric` + `Table` + `data` input + SSR SVG
2. **Phase 2:** Option B `EChart` + `charts` / `optionRef` for Chart Generator composition
3. **Phase 3:** Email PNG export; optional client hydrate for interactive deployed pages

## Shared implementation checklist

- [ ] Extend `webpageCatalog` (Grid, Metric, Table, Chart and/or EChart)
- [ ] Prompt / `GENERATIVE_UI_OUTPUT_RULES` updates
- [ ] `data` (+ optional `charts`) on contract, tool, block
- [ ] `WebpageRenderContext` threaded through `renderWebpageNode`
- [ ] Async webpage walk (charts SSR)
- [ ] `dashboard/render-chart-svg.ts` with dynamic `import('echarts')`
- [ ] `next.config.ts` tracing includes for `echarts`
- [ ] Unit tests: bind/build (A), validate option (B), SVG contains `<svg`
- [ ] Golden HTML fixture for a sample marketing report Spec
- [ ] Email: document Chart/EChart unsupported (or strip at render)

## Non-goals (both)

- Interactive tooltips/zoom in static `html` output (MVP)
- Email client JS charts
- Accepting Chart Generator `{ charts, count }` wrapper as a Spec root
- Importing this stack into `apps/realtime` / packages that must stay lean
