import { defineCatalog } from '@json-render/core'
import { schema as reactSchema } from '@json-render/react/schema'
import { z } from 'zod'

function formFieldProps<T extends z.ZodRawShape>(extra: T) {
  return z.object({
    name: z.string(),
    label: z.string().nullable(),
    required: z.boolean().nullable(),
    defaultValue: z.string().nullable(),
    statePath: z.string().nullable(),
    errorText: z.string().nullable(),
    showWhen: z.string().nullable(),
    ...extra,
  })
}

/**
 * Interactive webpage catalog for Arena Generative UI (multi-page + CTA actions).
 */
export const arenaGenerativeUiCatalog = defineCatalog(reactSchema, {
  components: {
    Page: {
      props: z.object({
        title: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Root page wrapper. Always use as the root element for each page Spec.',
    },
    Section: {
      props: z.object({
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        maxWidth: z.string().nullable(),
        width: z.enum(['narrow', 'wide', 'full']).nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Content section. width defaults to wide (fills up to 1280px); use narrow only for a focused single-column form, full to span the viewport. Leave maxWidth unset unless you need an exact cap. showWhen uses the same clause syntax as form fields — hide a markdown region until selectedId is set (`selectedId`) or hide the list while it is set (`!selectedId`).',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).nullable(),
        gap: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
        justify: z.enum(['start', 'center', 'between', 'end']).nullable(),
        wrap: z.boolean().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Flex stack for vertical or horizontal layout. Use justify to distribute a horizontal row and wrap so it reflows on narrow screens. For collections of equal items use Grid instead. showWhen uses the same clause syntax as form fields — wrap a History list in showWhen "!selectedId" so Open can swap to a detail view.',
    },
    Grid: {
      props: z.object({
        columns: z.enum(['2', '3', '4']).nullable(),
        gap: z.string().nullable(),
        minItemWidth: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Responsive grid that collapses to one column on narrow screens. Use for collections of Cards or Stats and for form fields that belong side by side. columns sets the target track count. For a live array, put Repeat inside the Grid so each item becomes one cell — do not wrap the Grid in Repeat. showWhen uses the same clause syntax as form fields.',
    },
    Repeat: {
      props: z.object({
        statePath: z.string(),
        emptyText: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Renders its children once per element of a host-state array at statePath. Put Repeat inside a Grid or Stack; the children are the per-item template (typically a Card). Bind per-item fields with statePath "item.field" (no braces). Put per-item values into labels, hrefs, and navigation with "{item.field}" — NavLink.to "order?id={item.id}" opens that row\'s detail page. A Button.selectItem inside Repeat copies the row into host state without an API call; a Button.actionId sends the item\'s fields as the action input. Never bind a long prose field (output, content, body) inside Repeat. Use Table instead when every item is the same scalar fields with no per-row action. When the array is empty the host shows emptyText (default "No results") — do not add a second Text for that. showWhen "!selectedId" hides the list while a same-page Open detail is showing.',
    },
    Columns: {
      props: z.object({
        layout: z.enum(['equal', 'sidebar-left', 'sidebar-right']).nullable(),
        gap: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Two-column layout for asymmetric content: equal halves, or a 280px sidebar beside the main column. Stacks vertically on narrow screens.',
    },
    PageHeader: {
      props: z.object({
        title: z.string(),
        subtitle: z.string().nullable(),
        kicker: z.string().nullable(),
        align: z.enum(['start', 'center']).nullable(),
      }),
      slots: ['default'],
      description:
        'Page title with optional kicker (small brand-colored label above the title) and subtitle. align "center" stacks kicker/title/subtitle as a hero with a readable measure; children stay top-right (history, secondary). Default align is start. Use once at the top of a page instead of a bare Heading.',
    },
    Toolbar: {
      props: z.object({
        justify: z.enum(['start', 'center', 'between', 'end']).nullable(),
      }),
      slots: ['default'],
      description: 'Horizontal row of controls (filters, buttons, badges) that wraps when narrow.',
    },
    Tabs: {
      props: z.object({
        items: z.string(),
        activePath: z.string().nullable(),
      }),
      description:
        'Top-level navigation across pages. items is newline-separated "Label|path" where each path is a manifest page path. activePath marks the current page.',
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
        description: z.string().nullable(),
        footerText: z.string().nullable(),
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        "Card with optional title, subtitle, and description. The first Icon or Avatar child is media (feature well or entity logo). Button, Chip, NavLink, Link, and Toolbar children render in a footer under a divider with optional footerText. Use this for entity result cards (logo, title, subtitle, truncated body, footer meta + Analyze) and for feature cards with an Icon well. showWhen uses the same clause syntax as form fields (for example selectedId={item.id} to reveal a selected row's markdown).",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3', 'h4']).nullable(),
        color: z.string().nullable(),
      }),
      description: 'Heading text',
    },
    Text: {
      props: z.object({
        text: z.string(),
        color: z.string().nullable(),
        size: z.string().nullable(),
      }),
      description: 'Paragraph text. Markdown is rendered (emphasis, lists, links).',
    },
    DataText: {
      props: z.object({
        statePath: z.string(),
        fallback: z.string().nullable(),
        color: z.string().nullable(),
        size: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      description:
        'Displays a host-state value at a dotted path (e.g. content, selected.output, or item.output). Markdown is rendered. For stream: true CTAs, bind statePath to content on the page or section that shows the result. showWhen uses the same clause syntax as form fields — hide until a Repeat selectItem sets selectedId.',
    },
    Table: {
      props: z.object({
        columns: z.string().nullable(),
        rows: z.string().nullable(),
        statePath: z.string().nullable(),
        emptyText: z.string().nullable(),
      }),
      description:
        'Tabular data. Either static: columns as comma-separated headers plus rows as newline-separated lines with "|" between cells. Or bound: statePath pointing at a host-state array of objects, where columns names the object keys to show. Prefer this over stacked Cards when every item is the same scalar fields. A bound table with no rows shows emptyText (default "No results").',
    },
    Stat: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        statePath: z.string().nullable(),
        hint: z.string().nullable(),
        delta: z.string().nullable(),
        deltaTone: z.enum(['positive', 'negative', 'neutral']).nullable(),
        size: z.enum(['default', 'display']).nullable(),
      }),
      description:
        'Single metric with a label and a primary value. size "display" is the large KPI used on dashboards; default is the compact metric. Use value for static numbers or statePath to read one from host state. delta is a short change indicator such as "+14.2%" and deltaTone colours it. Place several inside a Grid.',
    },
    Sparkline: {
      props: z.object({
        values: z.string().nullable(),
        statePath: z.string().nullable(),
        label: z.string().nullable(),
      }),
      description:
        'Compact numeric series as a line. values is comma-separated numbers, or statePath reads a number array from host state. Use under a Stat or inside a dashboard Card. Not a full chart — do not invent axes, legends, or multiple series.',
    },
    EmptyState: {
      props: z.object({
        title: z.string(),
        body: z.string().nullable(),
        icon: z
          .enum([
            'search',
            'file',
            'chart',
            'shield',
            'building',
            'check',
            'spark',
            'users',
            'globe',
            'message',
            'link',
            'inbox',
            'calendar',
            'star',
            'trend',
          ])
          .nullable(),
      }),
      description:
        'Designed empty region: title, optional body, optional catalog icon. Use when a page has no collection yet and emptyText on Table/Repeat is not enough. Do not use as a loading state.',
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: z.enum(['info', 'success', 'warning', 'error']).nullable(),
      }),
      description: 'Small inline status pill for a state, category, or count.',
    },
    KeyValue: {
      props: z.object({
        items: z.string().nullable(),
        statePath: z.string().nullable(),
        emptyText: z.string().nullable(),
      }),
      description:
        'Two-column detail list. items is newline-separated "key: value" rows, or set statePath to a host-state object to list its entries. A bound list with no entries shows emptyText (default "No details").',
    },
    Alert: {
      props: z.object({
        text: z.string(),
        tone: z.enum(['info', 'success', 'warning', 'error']).nullable(),
      }),
      description:
        'In-content status the brief asked for (a disclaimer or legal note). Markdown is rendered. Do not use for field errors, API failures, save success, or confirm — the host shows those.',
    },
    Spinner: {
      props: z.object({
        label: z.string().nullable(),
      }),
      description:
        'Optional short inline wait. Pending CTAs already show host busy chrome. Do not use Spinner as the only feedback for a long run.',
    },
    Skeleton: {
      props: z.object({
        variant: z.enum(['text', 'stat', 'table', 'card', 'form']).nullable(),
        lines: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      description:
        'Optional placeholder for a region built from static children. Table, Repeat, Stat, KeyValue and DataText bound to a statePath already skeleton automatically. Prefer binding statePath over emitting Skeleton.',
    },
    ProgressSteps: {
      props: z.object({
        steps: z.string(),
        durationMs: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      description:
        'Legacy. Do not emit — timed steps are fake progress. The host shows indeterminate status while a CTA is pending. Existing specs still render.',
    },
    ProgressBar: {
      props: z.object({
        value: z.union([z.number(), z.string()]).nullable(),
        statePath: z.string().nullable(),
        label: z.string().nullable(),
      }),
      description:
        'Horizontal 0–100 track only when a real percent exists (value or statePath from the API). Do not emit as loading theater; the host shows indeterminate status instead.',
    },
    SearchField: {
      props: formFieldProps({
        placeholder: z.string().nullable(),
        actionId: z.string().nullable(),
        suggestions: z.string().nullable(),
        submitLabel: z.string().nullable(),
      }),
      description:
        'One-line search with a nested primary submit inside a pill track. name is the query key. actionId runs when this field is not inside a Form; inside a Form the parent submits. suggestions is a comma-separated list of chips that fill the field. Use this for a one-field search hero — do not fake it with Stack + TextInput + SubmitButton.',
    },
    Chip: {
      props: z.object({
        text: z.string(),
        tone: z.enum(['muted', 'brand', 'info']).nullable(),
        actionId: z.string().nullable(),
        navigateTo: z.string().nullable(),
        setValue: z.string().nullable(),
      }),
      description:
        'Compact pill. tone is muted, brand, or info. Optional actionId, navigateTo, or setValue (the string to put in a named field, as "query=Stripe" or a bare value that fills the page SearchField). Use for suggestion chips and entity meta.',
    },
    Icon: {
      props: z.object({
        name: z.enum([
          'search',
          'file',
          'chart',
          'shield',
          'building',
          'check',
          'spark',
          'users',
          'globe',
          'message',
          'link',
          'inbox',
          'calendar',
          'star',
          'trend',
        ]),
        well: z.enum(['circle', 'square', 'none']).nullable(),
      }),
      description:
        'Catalog icon. well "circle" or "square" paints a 40px brand-tinted well with a 20px icon — the feature-card mark. well "none" is the bare glyph.',
    },
    Avatar: {
      props: z.object({
        src: z.string().nullable(),
        initials: z.string().nullable(),
        statePath: z.string().nullable(),
      }),
      description:
        'Content logo or initials. src is an image URL, initials are two letters, statePath reads a URL or name from host state (including item.logo / item.name inside Repeat). Allowed for companies and people; do not use as an app wordmark.',
    },
    EntityHeader: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
        badge: z.string().nullable(),
        badgeTone: z.enum(['info', 'success', 'warning', 'error']).nullable(),
        logoSrc: z.string().nullable(),
        initials: z.string().nullable(),
        statePath: z.string().nullable(),
        meta: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Identity row: logo, title, badge, description, comma-separated meta chips, and default-slot children for links or actions. Use on dashboards and record pages instead of stacking Avatar + Heading + Badge + Toolbar.',
    },
    Form: {
      props: z.object({
        actionId: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
      }),
      slots: ['default'],
      description:
        'Form wrapper for multi-field forms. actionId must match a manifest actions key that calls a declared API. align controls cross-axis placement of its rows and defaults to stretch. A one-field search uses SearchField on its own instead of Form + TextInput.',
    },
    TextInput: {
      props: formFieldProps({
        placeholder: z.string().nullable(),
      }),
      description:
        'Single-line form field. name is the API input key. defaultValue seeds it; statePath reads host state instead when set. showWhen hides it until a sibling matches (see form-control rule).',
    },
    TextArea: {
      props: formFieldProps({
        placeholder: z.string().nullable(),
      }),
      description:
        'Multi-line form field for prose. Same name / required / showWhen / defaultValue / statePath / errorText as TextInput.',
    },
    Select: {
      props: formFieldProps({
        options: z.string(),
      }),
      description:
        'Dropdown; options is a comma-separated list of labels. Prefer this over RadioGroup when there are more than five choices.',
    },
    RadioGroup: {
      props: formFieldProps({
        options: z.string(),
      }),
      description:
        'Visible radio list for a short exclusive choice. options is comma-separated. Use Select when the list is long.',
    },
    MultiSelect: {
      props: formFieldProps({
        options: z.string(),
      }),
      description:
        'Several of a comma-separated options list. Submits an array of the checked labels. defaultValue is comma-separated selected labels.',
    },
    NumberInput: {
      props: formFieldProps({
        placeholder: z.string().nullable(),
        min: z.string().nullable(),
        max: z.string().nullable(),
        step: z.string().nullable(),
      }),
      description:
        'Numeric field. min, max, and step are decimal strings. Submits a number. Use this instead of TextInput for counts, amounts, and scores.',
    },
    DateInput: {
      props: formFieldProps({
        min: z.string().nullable(),
        max: z.string().nullable(),
      }),
      description: 'Date field. Value is YYYY-MM-DD. min and max are the same format.',
    },
    Checkbox: {
      props: formFieldProps({
        defaultChecked: z.boolean().nullable(),
      }),
      description:
        'Labelled boolean. Submits true when checked. required means the user must check it. defaultChecked seeds it; defaultValue "true" also works.',
    },
    Switch: {
      props: formFieldProps({
        defaultChecked: z.boolean().nullable(),
      }),
      description:
        'On/off setting. Submits true when on. Use for preferences; use Checkbox for an acknowledgement the user must tick.',
    },
    SubmitButton: {
      props: z.object({
        label: z.string(),
        actionId: z.string().nullable(),
        size: z.enum(['sm', 'md']).nullable(),
      }),
      description:
        'Submits the nearest Form or runs actionId via run_api. Always renders as the primary action, so a form needs no other primary Button.',
    },
    Button: {
      props: z.object({
        label: z.string(),
        href: z.string().nullable(),
        navigateTo: z.string().nullable(),
        actionId: z.string().nullable(),
        selectItem: z.boolean().nullable(),
        clearItem: z.boolean().nullable(),
        variant: z.enum(['primary', 'secondary', 'ghost', 'outline', 'destructive']).nullable(),
        size: z.enum(['sm', 'md']).nullable(),
        shape: z.enum(['default', 'pill']).nullable(),
        showWhen: z.string().nullable(),
      }),
      description:
        'Button. Prefer navigateTo for in-app pages, actionId for APIs, href only for true outbound links. Inside Repeat, selectItem true copies that row into host state (selected, selectedId, content from output/content) without calling an API — combine with navigateTo a results page that has no onLoad, or stay on the list page with no navigateTo and a sibling detail showWhen "selectedId". It does not restamp inputs; Results chips still use the form field names. clearItem true drops that copied row so Back can restore the list; it must not set selectItem or actionId. variant sets emphasis and defaults to secondary: use primary for the single main action of a page, secondary for ordinary actions, outline for a brand-bordered pill such as "View analysis history", ghost for low-emphasis ones such as Back or Cancel, destructive for delete. shape "pill" fully rounds the control. showWhen hides the button until host state or a form field matches (same syntax as form fields) — use "hasMore" for Load more and "selectedId" for a same-page Back.',
    },
    NavLink: {
      props: z.object({
        label: z.string(),
        to: z.string(),
      }),
      description: 'In-app navigation link. `to` must be a page path in the manifest.',
    },
    Link: {
      props: z.object({
        label: z.string(),
        href: z.string(),
        color: z.string().nullable(),
      }),
      description: 'Outbound hyperlink (leaves the app)',
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().nullable(),
        width: z.string().nullable(),
        height: z.string().nullable(),
      }),
      description:
        'Content photograph or figure only. Company and person marks use Avatar or EntityHeader. Do not use Image for an app wordmark.',
    },
    Divider: {
      props: z.object({
        color: z.string().nullable(),
      }),
      description: 'Horizontal rule',
    },
    List: {
      props: z.object({
        ordered: z.boolean().nullable(),
      }),
      slots: ['default'],
      description: 'List container; children should be ListItem',
    },
    ListItem: {
      props: z.object({
        text: z.string(),
      }),
      description: 'List item text. Markdown is rendered.',
    },
  },
  actions: {
    navigate: {
      params: z.object({
        to: z.string(),
      }),
      description: 'Navigate to another page path in this app (no API call)',
    },
    run_api: {
      params: z.object({
        actionId: z.string(),
      }),
      description: 'Call a declared CTA action (workflow or HTTP) via the host proxy',
    },
    set_state: {
      params: z.object({
        values: z.record(z.string(), z.unknown()),
      }),
      description: 'Merge values into host state',
    },
  },
})

const COMPONENTS_HEADING = /^AVAILABLE COMPONENTS/
const SECTION_HEADING = /^[A-Z][A-Z0-9 ,/()-]*:$/

let componentReference: string | null = null

/**
 * The `AVAILABLE COMPONENTS` block of the `@json-render/core` catalog prompt — the
 * only part of it this generator can use.
 *
 * The rest of that prompt documents a runtime this app does not implement. Its
 * output contract is RFC 6902 JSONL patches (`{"op":"add","path":"/elements/…"}`),
 * with worked examples and rules 1-4, while this generator parses one manifest
 * object; and it documents `$state`, `$bindState`, `visible`, `watch`, `on.press`,
 * a `repeat` element field, and `setState`/`pushState` actions, none of which
 * `gui-apps/[identifier]/spec-renderer.tsx` reads — it renders type/props/children
 * plus this module's own `statePath` / `showWhen` / `Repeat` / `actionId`
 * conventions. Two of its rules ("ALWAYS include a state field with realistic
 * sample data", "Never leave data empty") also defeat the loading-state contract in
 * {@link ARENA_GENERATIVE_UI_OUTPUT_RULES}, which needs bound regions left empty.
 *
 * Shipping both contracts made the model emit patch operations, which cost every
 * scoped edit its first turn. So the rules come from this module alone.
 */
function arenaGenerativeUiComponentReference(): string {
  if (componentReference !== null) {
    return componentReference
  }
  const lines = arenaGenerativeUiCatalog.prompt().split('\n')
  const start = lines.findIndex((line) => COMPONENTS_HEADING.test(line))
  if (start < 0) {
    throw new Error(
      'The json-render catalog prompt no longer has an AVAILABLE COMPONENTS section; arena-generative-ui/catalog.ts must be updated to match it.'
    )
  }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => SECTION_HEADING.test(line))
  componentReference = (end < 0 ? lines.slice(start) : lines.slice(start, start + 1 + end))
    .join('\n')
    .trim()
  return componentReference
}

/**
 * Generator system prompt section: the component reference, then the numbered rules
 * for this run. Sim owns every rule, so rule 1 is the output envelope.
 */
export function buildArenaGenerativeUiPrompt(options: { customRules: string[] }): string {
  return [
    arenaGenerativeUiComponentReference(),
    ['RULES:', ...options.customRules.map((rule, index) => `${index + 1}. ${rule}`)].join('\n'),
  ].join('\n\n')
}

/** Role framing prepended to the generator system prompt. */
export const ARENA_GENERATIVE_UI_PERSONA =
  'You are an expert principal frontend engineer specializing in design systems, dashboards, multi-step forms, and operational tools. Your only output is a single valid JSON object conforming to the schema below. Emit no markdown fences, no explanation, no preamble, and no trailing text.'

export const ARENA_GENERATIVE_UI_OUTPUT_RULES = [
  'Output a single complete JSON object. Do NOT wrap it in markdown fences. Do NOT output JSONL patches.',
  'Shape: { "title": string, "content": string, "manifest": { "entryPath": string, "theme?", "pages": { [path]: { "title", "path", "spec", "onLoad?" } }, "actions": { [actionId]: { "apiKey", "inputMapping?", "append?", "onSuccess?", "onError?" } } } }',
  'manifest.pages MUST be an object keyed by kebab-case path, never an array. Example: { "home": { "path": "home", "title": "People", "spec": { ... } }, "person": { "path": "person", "title": "Profile", "spec": { ... } } }.',
  'Return one JSON object only. Do not emit a short summary object before the manifest.',
  'Each page spec is a json-render Spec: { "root": string, "elements": { [key]: { type, props, children } } }.',
  'Every page Spec root element must be type Page.',
  'Every element must include a children array (use [] for leaves).',
  'Every element needs type, props, and children, under a unique descriptive key in its page elements map ("home-header", "stat-revenue").',
  'Before finishing a page, walk its tree from root: every key in every children array must exist as its own entry in that page elements map. Add any element you referenced but did not define.',
  'Only use component types from the catalog.',
  'Use NavLink.to or Button.navigateTo for in-app navigation. Never use href for another page in this app.',
  'CTA forms that call APIs must set Form.actionId or SubmitButton.actionId to a key in manifest.actions.',
  'Every manifest.actions[actionId].apiKey MUST be one of the declared API binding keys. Do not invent API keys.',
  'If no API bindings were declared, omit manifest.actions or leave it empty and use navigation only.',
  'onSuccess.navigate and NavLink.to / Button.navigateTo / navigate action `to` must be existing page paths, optionally followed by a query string such as "report?range=30d".',
  'Every page must be reachable from entryPath via NavLink, navigateTo, navigate, or onSuccess.navigate.',
  'DataText, Text, Alert, and ListItem render markdown. Put a prose API body on a single DataText; do not split markdown into Heading/List elements.',
  'Layout: compose for a full page up to 1280px (Section width wide). Grid and Columns collapse to one column in a narrow Arena iframe — do not design as a permanently narrow single column, and do not assume the iframe is 1280px. Do not set maxWidth unless the brief demands an exact cap.',
  'Measure: dashboards, collections and tables stay wide, but a narrative block — a report body, an analysis, a long DataText — goes in its own Section with width "narrow" or in the main column of Columns. A PageHeader subtitle and a search-hero subtitle keep a readable measure (the host caps them) even on a wide Section. Never let prose run the full 1280px.',
  'Spacing: group related elements into a Card or Stack so data reads as chunks, and leave real space between groups. gap and padding take CSS lengths such as "16px" or "24px", never size words like "md" or "lg".',
  'Surfaces: there are exactly two — the page canvas and the Card/Stat surface, both supplied by the host from the Arena Design System (manifest.theme or host defaults). Do not set backgroundColor unless the brief names a specific colour. Build hierarchy from PageHeader, Card grouping, heading level, and 24px gaps between groups — never coloured fills or borders.',
  'Collections: when each item is the same scalar fields with no per-row action, use Table. When items have a name, description, and action, use Repeat inside a Grid (columns 2) of entity Cards — Avatar, title, subtitle, truncated description, footerText plus a footer Button. When each item needs its own Card, Badge, button, or link more generally, put a Repeat inside a Grid (columns 2 or 3) or Stack, bound to the array statePath; Repeat\'s children are the per-item template and render once per element. Never unroll a live array into one static Card per item, and never wrap Grid in Repeat (that produces N grids). Bind per-item fields with statePath "item.field". Put per-item values into navigation and hrefs with "{item.id}" — NavLink.to "order?id={item.id}" opens the detail page so its onLoad receives that id. A Button.selectItem inside Repeat copies the row into host state without an API call; a Button.actionId sends the item fields as the action input. Never bind a long prose field (output, content, body) inside Repeat — not item.output, not Card.description, not a Table column.',
  'Loaded row selection: when list items already include a prose field (history[].output, items[].content), Open is Button selectItem true with no actionId. It copies prose to content plus selected/selectedId — it does not restamp inputs. If the brief opens a separate results/detail page, add navigateTo that page (no onLoad there) so DataText statePath "content" shows the row. If the brief stays on the list page, omit navigateTo: hide the Repeat (or its Grid/Stack/Section) with showWhen "!selectedId", put the markdown in a sibling Section showWhen "selectedId" with a ghost Back Button clearItem true (no navigateTo). Do not append DataText below an always-visible Repeat. Do not invent a second fetch for a field already on the row. When the list API only returns an id, keep the fetch-one detail onLoad instead. History cards bind item.keyword / item.client only inside Repeat. Results after Generate still echo the home form names ({targetKeyword}, {clientBrand}), not those history keys ({keyword}, {client}).',
  'Tabular data goes in Table, metrics go in Stat inside a Grid (size "display" for dashboard KPIs), record details go in KeyValue or EntityHeader, short statuses go in Badge or Chip.',
  'Forms: every interactive field carries an explicit label. Pair short related fields (TextInput, NumberInput, DateInput, Select) side by side in a Grid (columns 2) and keep long free-text, RadioGroup, MultiSelect, Checkbox, and Switch full width. Multi-field forms have one SubmitButton and an optional Back NavLink, and default to left-aligned. A one-field search is SearchField (placeholder is enough; optional label) — never a labelled Grid of one TextInput.',
  'Form controls: SearchField (pill query with nested submit and optional suggestion chips), TextInput (one line), TextArea (prose), NumberInput (counts and amounts; min/max/step as decimal strings), DateInput (YYYY-MM-DD), Select (one of a comma-separated options list), RadioGroup (a short visible exclusive list — use Select when there are more than five options), MultiSelect (several of that list, submitted as an array), Checkbox (must-tick boolean), Switch (on/off preference). Every field needs name; labelled fields also need label. defaultValue seeds the control (comma-separated for MultiSelect); Checkbox/Switch also accept defaultChecked. statePath reads a host-state key instead when set. showWhen hides a field until a sibling matches: "notify" means that field is truthy, "!selectedId" means it is unset, "channel=email" means equality, "channel!=sms" inequality, and comma-separated clauses are AND. Hidden fields are not submitted and are not validated. required plus optional errorText run on submit — do not add a second Text for the error. There is no file-upload field.',
  'Hero: a one-field search page uses PageHeader align "center" with a kicker plus SearchField — that is the default for that page, not an exception. Multi-field forms stay left-aligned. Collections, dashboards, and tables stay wide. A search field beside its button is SearchField, not a centred Stack of TextInput and SubmitButton. justify accepts exactly start, center, between, end (never "space-between" or a CSS value).',
  'Chrome: start a page with PageHeader (kicker, title, subtitle, trailing action as its child) instead of a bare Heading. Use EntityHeader for a company or record identity row. Use Toolbar for a row of filters or secondary buttons, and Columns for a main area beside a supporting sidebar.',
  'Emphasis: at most one Button with variant "primary" per page, and none on a page whose main action is a SubmitButton or SearchField (those are already primary). Ordinary actions are "secondary", outline + shape "pill" is the brand-bordered secondary such as "View analysis history", Back / Cancel / dismiss are "ghost", and delete or disconnect is "destructive". Never express emphasis with a colour — there is no colour prop on Button.',
  'Navigation: when the app has three or more top-level destinations, put a Tabs element with one "Label|path" line per top-level page on those destination pages and set activePath to the current path. A search hero omits Tabs. Detail and progress pages are reached with NavLink/navigateTo and offer a Back NavLink.',
  'Typography: one h1-level page title per page (PageHeader.title counts), then a short supporting subtitle. Never title a page "Page 1" or use lorem ipsum.',
  'Heading order: nest levels sequentially and never skip or invert them. PageHeader.title is the page h1 and Card.title renders an h2, so a Heading inside a Card starts at h3.',
  'Loading: bind every CTA or onLoad result region to a statePath. Table, Repeat, Stat, KeyValue and DataText then show a placeholder automatically while pending and empty. A Stat with a literal value or a Table with literal rows never shows one. For a region built from static children you may add {"type":"Skeleton","props":{"variant":"card","lines":3},"children":[]}. Do not emit ProgressSteps or a filling ProgressBar — the host compiles pending chrome.',
  'Empty results: when a bound Table, Repeat, or KeyValue has loaded and the value is empty, the host shows emptyText (defaults: "No results" for Table and Repeat, "No details" for KeyValue). Do not add a second Text or Alert for that. A DataText fallback is the empty copy for prose. Customise emptyText when the brief names the collection ("No matching articles").',
  'Result pages: when onSuccess.navigate sends the user to another page, the host navigates there immediately and the action stays pending, so bind the destination Table/Repeat/Stat/KeyValue/DataText — not loaders on the form page the user has already left. The host supplies pending chrome.',
  'Avatars: content logos and initials belong on Avatar or EntityHeader (src, initials, or statePath including "{item.logo}"). Do not add a decorative app wordmark or branding Image — the host already provides the outer shell.',
] as const

/**
 * Appended for a page-scoped edit, where the model sees only the pages the change
 * touches. These deliberately restate the envelope and override the whole-manifest
 * shape rules above: the reply is still one complete JSON object with complete page
 * specs, it simply carries fewer page keys. Saying so explicitly matters because
 * the shape rules ban patch formats, and without this the model hedges, abbreviates
 * a spec, or re-emits pages it was told to leave alone.
 */
export const ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES = [
  'SCOPED EDIT — the following overrides the shape rules above.',
  'You are changing specific pages of an app that already exists. You were given the complete spec for those pages, and a short summary of the other pages.',
  'Return ONE complete JSON object in the same envelope as before. This is NOT a patch: no markdown fences, no JSONL, no diff syntax, no operation lists. The only difference is that manifest.pages contains ONLY the pages you were asked to change.',
  'Emit a full valid spec for every page you return — root, elements, and a children array on every element. Never abbreviate a spec, never emit a placeholder, and never use "..." or a comment to stand in for content you are keeping.',
  'Do NOT return any page you were not asked to change. The host keeps those byte-identical; including one is an error and the reply will be rejected.',
  'Keep every Tabs entry, NavLink.to, and Button.navigateTo target already present on the pages you return. The pages they point at still exist even though you were not shown them, and reachability is checked across the whole app after your reply is merged in.',
  'Do not set entryPath. Do not restate theme unless the change request is about branding, colour, density, or typography.',
  'Return manifest.actions only when the change alters a CTA, and then only the entries that changed — the host merges them over the existing actions, so omitting one keeps it.',
  'Apply ONLY the requested change. Inside the pages you return, every element, prop, and copy string the change request does not name must stay byte-identical to what you were given.',
] as const

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ACTION_INPUT_RULE = [
  'CTA inputs: every inputSchema field whose source is "form" (or omitted) must be a form control whose name matches that field — including a field named "email", which is a typed lead/contact address, not the signed-in user. Fields with source "visitorEmail" or "constant" are sent by the host — do not render a visible field for them, and do not invent a placeholder the user has to type.',
  'visitorEmail is the signed-in user only (typical names: userEmail, loggedInEmail, visitorEmail). Set inputMapping { "<name>": "arenaEmailId" } so that start input receives the logged-in address. Do not map a form "email" field to arenaEmailId. Constant fields need no form name and no inputMapping; the host stamps their value on every call.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ACTION_RESULT_RULE = [
  'CTA results: each binding includes layoutPlan — bind only those hostKeys as statePath, never nested schema paths (run_data.history) or envelopes (never "data.articles", "output.articles", or "response.articles"). Nested collections are lifted to the last segment ("history"). A response that is an array or a plain value lands under "result". A markdown string field (article_data, or a typo like artical_data) lands at that key and is copied to "content" as the prose body — not a JSON dump of the object. Bind DataText to "content" or the string field name; never "field.content" unless outputSchema shows an object with a content child.',
  'Submitted form fields land in host state under "inputs" immediately on click — before the API returns. Echo them on the destination with Chip or DataText statePath "inputs.targetKeyword", or "{targetKeyword}" in Chip/Text/Heading/PageHeader. Use the home form name ({targetKeyword}, {clientBrand}), not History row keys ({keyword}, {client}) — those are Repeat item.keyword / item.client only. Field name is camelCase; labels may have spaces. Do not hope the API echoes those fields, and do not write "{Target Keyword}" expecting the label to bind unless it matches the field name after ignoring spaces and case.',
  'When a binding declares outputSchema, bind its field names as statePath instead of dumping "content": an array field such as "articles" with children "articles[].title" becomes Table statePath="articles" with columns from those child names, or Repeat inside a Grid when each item needs its own Card, link, or action; a single number or string becomes Stat or KeyValue; a markdown string becomes DataText on that name or "content", never "field.content"; only fall back to DataText statePath="content" for unstructured prose or when the binding declares no outputSchema.',
  'When a binding has no outputSchema and no outputHint, do not invent Table columns or Stat metrics. Bind DataText to "content" (or Repeat/Table only if the brief names the exact collection keys). Prefer a results page of prose until an output sample is provided.',
  'When list items already include a prose field (history[].output, items[].content), Open is Button selectItem true with no actionId; the host copies that field to content and selected, not inputs. Do not invent a second fetch for a field already on the row. Generate still navigates to Results, which echoes form names. A same-page History Open hides the list with showWhen "!selectedId" and shows the markdown with showWhen "selectedId" plus Back clearItem true.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_PAGINATION_RULE = [
  'Pagination: when a binding declares pagination, the host injects limit and cursor/offset, writes hasMore plus nextCursor (cursor mode) or offset (offset mode) into state, and appends the items array on page 2+ so Load more does not replace the list. Put a Button with the same actionId, showWhen "hasMore", and inputMapping that sends state nextCursor (cursor: "nextCursor") or offset (offset: "offset"). Do not invent a second action for the next page.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ON_LOAD_RULE = [
  'Data on arrival: a page whose content comes from an API the user did not just submit must fetch it itself. Set page "onLoad" to an array of manifest.actions ids and the host runs them once when the page opens, merging the response into state exactly as a CTA does. A dashboard, a report, a list, or a record detail page needs onLoad; a form page does not. A Results page that Generate already navigates to must not onLoad that same action — empty query params would refetch and miss or overwrite the CTA body.',
  'onLoad receives the page query params as its action input, mapped through the action inputMapping. A navigation target may carry those params — NavLink.to "report?range=30d" opens the report page and its onLoad action receives range "30d", and inside Repeat the same target can be "order?id={item.id}" so each row opens its own record — while the part before "?" must still be an existing page path. Give an onLoad action no onSuccess.navigate: the host ignores it rather than bouncing the user off the page they just opened.',
  'A page with onLoad still needs loading states: bind its Table, Repeat, Stat, KeyValue, and DataText to a statePath so the placeholder shows while the load is in flight.',
].join(' ')

/**
 * Branding lives on `manifest.theme`. Always emit Arena DS defaults so the host
 * is never left on a generic Tailwind palette.
 */
export const ARENA_GENERATIVE_UI_THEME_RULE = [
  'Theme: always emit manifest.theme { brandColor: "#1A73E8", radius: "md", density: "comfortable", font: "sans", colorScheme: "light" }. Override brandColor, radius, density, font, or colorScheme only when Design Notes name them. Do not set backgroundColor on Page or Card for branding — the host applies theme as CSS variables.',
].join(' ')

/**
 * Compressed Arena Design System for the generator. The host paints chrome;
 * this tells the model how to compose catalog components so they land well.
 */
export const ARENA_GENERATIVE_UI_DESIGN_GUIDELINES = [
  'ARENA DESIGN SYSTEM',
  'The host already paints Poppins, brand blue #1A73E8, grey text hierarchy, 12px radius, 40px controls, display titles, and shadow-first cards. You compose catalog components; you do not invent hex, fonts, or CSS.',
  'Viewport: full page up to 1280px; the same layout stacks in a narrow Arena iframe because Grid and Columns collapse. Do not author a permanently narrow centre column.',
  'Every generate reply includes the default theme above. Page → Section (width wide, no maxWidth) → PageHeader, then groups of Grid / Columns / Card with gap "24px". A one-field search is a centered PageHeader (kicker + display title) plus SearchField and suggestion Chips, then a Grid of Icon Cards. Multi-field forms pair short fields in a 2-column Grid. Dashboard metrics are a Grid of Stat size "display" under EntityHeader, optional Sparkline, and Tabs. Named collections are Repeat-in-Grid entity Cards (Avatar, subtitle, footer). Record details are EntityHeader or KeyValue. One primary SearchField or SubmitButton per form; history is outline + pill; Back is a ghost Button or NavLink. A page with nothing to show yet uses EmptyState, not a blank canvas.',
  'Copy is specific product language. Never title a page "Page 1" or use lorem ipsum. Content avatars and company logos are allowed; do not add an app wordmark.',
].join('\n')

/** Added to the generator prompt only when a declared binding has `stream: true`. */
export const ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE =
  'If a declared API binding has stream: true, still infer a multi-page sitemap from the brief. For prose streams, put DataText with statePath "content" in the section or page that shows that API body (often a results page). If the binding has outputHint, treat it as an example of the streamed body — match that shape in DataText and page copy; do not invent Table columns from it. If the binding also declares outputSchema, bind those fields as Table, Stat, or KeyValue instead of dumping content — an array field such as companies becomes Table statePath="companies". If the result is not on the form page, set onSuccess.navigate to that page and add a Back NavLink to the form. Do not emit ProgressSteps; the host shows pending chrome on that page.'
