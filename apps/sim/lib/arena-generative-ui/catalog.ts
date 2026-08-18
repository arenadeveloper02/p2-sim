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
      }),
      slots: ['default'],
      description:
        'Content section. width defaults to wide (fills up to 1280px); use narrow only for a focused single-column form, full to span the viewport. Leave maxWidth unset unless you need an exact cap.',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).nullable(),
        gap: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
        justify: z.enum(['start', 'center', 'between', 'end']).nullable(),
        wrap: z.boolean().nullable(),
      }),
      slots: ['default'],
      description:
        'Flex stack for vertical or horizontal layout. Use justify to distribute a horizontal row and wrap so it reflows on narrow screens. For collections of equal items use Grid instead.',
    },
    Grid: {
      props: z.object({
        columns: z.enum(['2', '3', '4']).nullable(),
        gap: z.string().nullable(),
        minItemWidth: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Responsive grid that collapses to one column on narrow screens. Use for collections of Cards or Stats and for form fields that belong side by side. columns sets the target track count. For a live array, put Repeat inside the Grid so each item becomes one cell — do not wrap the Grid in Repeat.',
    },
    Repeat: {
      props: z.object({
        statePath: z.string(),
        emptyText: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Renders its children once per element of a host-state array at statePath. Put Repeat inside a Grid or Stack; the children are the per-item template (typically a Card). Bind per-item fields with statePath "item.field" (no braces). Put per-item values into labels, hrefs, and navigation with "{item.field}" — NavLink.to "order?id={item.id}" opens that row\'s detail page. A Button.actionId inside Repeat sends the item\'s fields as the action input. Use Table instead when every item is the same scalar fields with no per-row action. When the array is empty the host shows emptyText (default "No results") — do not add a second Text for that.',
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
      }),
      slots: ['default'],
      description:
        'Page title with optional subtitle; default-slot children render right-aligned as the primary action. Use once at the top of a page instead of a bare Heading.',
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
        description: z.string().nullable(),
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Card container with an optional title and a one-line description under it. Groups related content into a legible chunk.',
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
      }),
      description:
        'Displays a host-state value at a dotted path (e.g. content or output.content). Markdown is rendered. For stream: true CTAs, bind statePath to content on the page or section that shows the result.',
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
      }),
      description:
        'Single metric with a label and a primary value. Use value for static numbers or statePath to read one from host state. delta is a short change indicator such as "+14.2%" and deltaTone colours it. Place several inside a Grid.',
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
      description: 'Inline status message. Markdown is rendered.',
    },
    Spinner: {
      props: z.object({
        label: z.string().nullable(),
      }),
      description:
        'Small inline loading label shown while an API action is in flight. Prefer Skeleton for a region that will fill with data.',
    },
    Skeleton: {
      props: z.object({
        variant: z.enum(['text', 'stat', 'table', 'card', 'form']).nullable(),
        lines: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      description:
        'Loading placeholder shown only while a CTA is pending. variant picks the shape (text lines, stat block, table rows, card, form rows) and lines sets how many rows. Table, Stat, KeyValue and DataText bound to a statePath already show a placeholder automatically, so add Skeleton for regions you build from static children.',
    },
    ProgressSteps: {
      props: z.object({
        steps: z.string(),
        durationMs: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      description:
        'Optional. Newline-separated step labels shown while a CTA is pending. Ticks complete over durationMs (default 150000). Include only when the user asked for stepped progress; put it on the page that shows the streaming result.',
    },
    Form: {
      props: z.object({
        actionId: z.string().nullable(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable(),
      }),
      slots: ['default'],
      description:
        'Form wrapper. actionId must match a manifest actions key that calls a declared API. align controls cross-axis placement of its rows and defaults to stretch; use align "center" only when the user asked for a centred form.',
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
        variant: z.enum(['primary', 'secondary', 'ghost', 'destructive']).nullable(),
        size: z.enum(['sm', 'md']).nullable(),
      }),
      description:
        'Button. Prefer navigateTo for in-app pages, actionId for APIs, href only for true outbound links. variant sets emphasis and defaults to secondary: use primary for the single main action of a page, secondary for ordinary actions, ghost for low-emphasis ones such as Back or Cancel, destructive for delete.',
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
      description: 'Content image only. Do not use for logos, wordmarks, or app branding.',
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

/** Role framing prepended to the generator system prompt. */
export const ARENA_GENERATIVE_UI_PERSONA =
  'You are an expert principal frontend engineer specializing in design systems, dashboards, and enterprise research platforms. Your only output is a single valid JSON object conforming to the schema below. Emit no markdown fences, no explanation, no preamble, and no trailing text.'

export const ARENA_GENERATIVE_UI_OUTPUT_RULES = [
  'Output a single complete JSON object. Do NOT wrap it in markdown fences. Do NOT output JSONL patches.',
  'Shape: { "title": string, "content": string, "manifest": { "entryPath": string, "pages": { [path]: { "title", "path", "spec", "onLoad?" } }, "actions": { [actionId]: { "apiKey", "inputMapping?", "onSuccess?", "onError?" } } } }',
  'manifest.pages MUST be an object keyed by kebab-case path, never an array. Example: { "home": { "path": "home", "title": "People", "spec": { ... } }, "person": { "path": "person", "title": "Profile", "spec": { ... } } }.',
  'Return one JSON object only. Do not emit a short summary object before the manifest.',
  'Each page spec is a json-render Spec: { "root": string, "elements": { [key]: { type, props, children } } }.',
  'Every page Spec root element must be type Page.',
  'Every element must include a children array (use [] for leaves).',
  'Only use component types from the catalog.',
  'Use NavLink.to or Button.navigateTo for in-app navigation. Never use href for another page in this app.',
  'CTA forms that call APIs must set Form.actionId or SubmitButton.actionId to a key in manifest.actions.',
  'Every manifest.actions[actionId].apiKey MUST be one of the declared API binding keys. Do not invent API keys.',
  'If no API bindings were declared, omit manifest.actions or leave it empty and use navigation only.',
  'onSuccess.navigate and NavLink.to / Button.navigateTo / navigate action `to` must be existing page paths, optionally followed by a query string such as "report?range=30d".',
  'Every page must be reachable from entryPath via NavLink, navigateTo, navigate, or onSuccess.navigate.',
  'DataText, Text, Alert, and ListItem render markdown. Put a prose API body on a single DataText; do not split markdown into Heading/List elements.',
  'Layout: each page is a full-page app screen. Page → Section (leave width at the wide default so it fills up to 1280px) → content. Use the horizontal space; do not stack every element in one narrow centre column. Do not set maxWidth unless the brief demands an exact cap.',
  'Measure: dashboards, collections and tables stay wide, but a narrative block — a report body, an analysis, a long DataText — goes in its own Section with width "narrow" or in the main column of Columns. Never let prose run the full 1280px.',
  'Spacing: group related elements into a Card or Stack so data reads as chunks, and leave real space between groups. gap and padding take CSS lengths such as "16px" or "24px", never size words like "md" or "lg".',
  'Surfaces: there are exactly two — the page canvas and the white Card/Stat surface, both supplied by the host. Do not set backgroundColor unless the brief names a specific colour. Build hierarchy from heading level, weight and whitespace instead of coloured fills or borders.',
  'Collections: when each item is the same scalar fields with no per-row action, use Table. When each item needs its own Card, Badge, button, or link, put a Repeat inside a Grid (columns 2 or 3) or Stack, bound to the array statePath; Repeat\'s children are the per-item template and render once per element. Never unroll a live array into one static Card per item, and never wrap Grid in Repeat (that produces N grids). Bind per-item fields with statePath "item.field". Put per-item values into navigation and hrefs with "{item.id}" — NavLink.to "order?id={item.id}" opens the detail page so its onLoad receives that id. A Button.actionId inside Repeat sends the item fields as the action input.',
  'Tabular data goes in Table, metrics go in Stat inside a Grid, record details go in KeyValue, short statuses go in Badge.',
  'Forms: every interactive field carries an explicit label. Pair short related fields (TextInput, NumberInput, DateInput, Select) side by side in a Grid (columns 2) and keep long free-text, RadioGroup, MultiSelect, Checkbox, and Switch full width. Forms have one SubmitButton and an optional Back NavLink, and default to left-aligned.',
  'Form controls: TextInput (one line), TextArea (prose), NumberInput (counts and amounts; min/max/step as decimal strings), DateInput (YYYY-MM-DD), Select (one of a comma-separated options list), RadioGroup (a short visible exclusive list — use Select when there are more than five options), MultiSelect (several of that list, submitted as an array), Checkbox (must-tick boolean), Switch (on/off preference). Every field needs name and label. defaultValue seeds the control (comma-separated for MultiSelect); Checkbox/Switch also accept defaultChecked. statePath reads a host-state key instead when set. showWhen hides a field until a sibling matches: "notify" means that field is truthy, "channel=email" means equality, "channel!=sms" inequality, and comma-separated clauses are AND. Hidden fields are not submitted and are not validated. required plus optional errorText run on submit — do not add a second Text for the error. There is no file-upload field.',
  'Centring: only centre when the user asked for it, and use the props that actually centre — a search field beside its button is {"type":"Stack","props":{"direction":"horizontal","justify":"center","align":"end","gap":"12px"}} wrapping the TextInput and SubmitButton, and a whole form centres with Form align "center". justify accepts exactly start, center, between, end (never "space-between" or a CSS value), and SubmitButton has no align or width prop of its own — wrap it instead.',
  'Chrome: start a page with PageHeader (title, subtitle, primary action as its child) instead of a bare Heading. Use Toolbar for a row of filters or secondary buttons, and Columns for a main area beside a supporting sidebar.',
  'Emphasis: at most one Button with variant "primary" per page, and none on a page whose main action is a SubmitButton (that is already primary). Ordinary actions are "secondary", Back / Cancel / dismiss are "ghost", and delete or disconnect is "destructive". Never express emphasis with a colour — there is no colour prop on Button.',
  'Navigation: when the app has three or more pages, put a Tabs element with one "Label|path" line per top-level page at the top of each page and set activePath to the current path. Detail pages are reached with NavLink/navigateTo and offer a Back NavLink.',
  'Typography: one h1-level page title per page (PageHeader.title counts), then a short supporting subtitle. Never title a page "Page 1" or use lorem ipsum.',
  'Heading order: nest levels sequentially and never skip or invert them. PageHeader.title is the page h1 and Card.title renders an h2, so a Heading inside a Card starts at h3.',
  'Loading: any region that fills from a CTA response must have a loading state. Table, Repeat, Stat, KeyValue and DataText bound to a statePath show a placeholder automatically, but only while that state value is still empty — so bind the result region to a statePath rather than hard-coding static children. A Stat with a literal value prop and a Table with literal rows never show one. For a region built from static children add {"type":"Skeleton","props":{"variant":"card","lines":3},"children":[]} — variant is text, stat, table, card or form. Use Spinner only for a short inline wait, never as the sole feedback for a long run.',
  'Empty results: when a bound Table, Repeat, or KeyValue has loaded and the value is empty, the host shows emptyText (defaults: "No results" for Table and Repeat, "No details" for KeyValue). Do not add a second Text or Alert for that. A DataText fallback is the empty copy for prose. Customise emptyText when the brief names the collection ("No matching articles").',
  'Result pages: when onSuccess.navigate sends the user to another page, the host navigates there immediately and the action stays pending, so put the loading state on the destination page — its bound Table/Repeat/Stat/KeyValue/DataText, or an explicit Skeleton — not on the form page the user has already left.',
  'Do not include a logo, wordmark, or decorative Image for branding. The host already provides the outer shell.',
] as const

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ACTION_RESULT_RULE = [
  'CTA results: when an action succeeds the host merges the response object top-level keys into app state, so a statePath is the response key itself — use "articles", never "data.articles", "output.articles", or "response.articles". A response that is an array or a plain value lands under "result". "content" always holds a text rendering of the whole response.',
  'When a binding declares outputSchema, bind its field names as statePath instead of dumping "content": an array field such as "articles" with children "articles[].title" becomes Table statePath="articles" with columns from those child names, or Repeat inside a Grid when each item needs its own Card, link, or action; a single number or string becomes Stat or KeyValue; only fall back to DataText statePath="content" for prose or when the binding declares no outputSchema.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ON_LOAD_RULE = [
  'Data on arrival: a page whose content comes from an API the user did not just submit must fetch it itself. Set page "onLoad" to an array of manifest.actions ids and the host runs them once when the page opens, merging the response into state exactly as a CTA does. A dashboard, a report, a list, or a record detail page needs onLoad; a form page does not.',
  'onLoad receives the page query params as its action input, mapped through the action inputMapping. A navigation target may carry those params — NavLink.to "report?range=30d" opens the report page and its onLoad action receives range "30d", and inside Repeat the same target can be "order?id={item.id}" so each row opens its own record — while the part before "?" must still be an existing page path. Give an onLoad action no onSuccess.navigate: the host ignores it rather than bouncing the user off the page they just opened.',
  'A page with onLoad still needs loading states: bind its Table, Repeat, Stat, KeyValue, and DataText to a statePath so the placeholder shows while the load is in flight.',
].join(' ')

/** Added to the generator prompt only when a declared binding has `stream: true`. */
export const ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE =
  'If a declared API binding has stream: true, still infer a multi-page sitemap from the brief. For prose streams, put DataText with statePath "content" in the section or page that shows that API body (often a results page). If the binding also declares outputSchema, bind those fields as Table, Stat, or KeyValue instead of dumping content — an array field such as companies becomes Table statePath="companies". If the result is not on the form page, set onSuccess.navigate to that page and add a Back NavLink to the form. Include ProgressSteps only when the user asked for stepped progress; otherwise omit it.'
