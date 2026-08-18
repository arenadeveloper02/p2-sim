import { defineCatalog } from '@json-render/core'
import { schema as reactSchema } from '@json-render/react/schema'
import { z } from 'zod'

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
        'Responsive grid that collapses to one column on narrow screens. Use for collections of Cards or Stats and for form fields that belong side by side. columns sets the target track count.',
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
        padding: z.string().nullable(),
        backgroundColor: z.string().nullable(),
      }),
      slots: ['default'],
      description: 'Card container with optional title',
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
      }),
      description:
        'Tabular data. Either static: columns as comma-separated headers plus rows as newline-separated lines with "|" between cells. Or bound: statePath pointing at a host-state array of objects, where columns names the object keys to show. Prefer this over one stacked Card per row.',
    },
    Stat: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        statePath: z.string().nullable(),
        hint: z.string().nullable(),
      }),
      description:
        'Single metric with a label. Use value for static numbers or statePath to read one from host state. Place several inside a Grid.',
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
      }),
      description:
        'Two-column detail list. items is newline-separated "key: value" rows, or set statePath to a host-state object to list its entries.',
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
      description: 'Loading indicator shown while an API action is in flight',
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
      }),
      slots: ['default'],
      description:
        'Form wrapper. actionId must match a manifest actions key that calls a declared API.',
    },
    TextInput: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        placeholder: z.string().nullable(),
        required: z.boolean().nullable(),
      }),
      description: 'Single-line form field; name is used for API input mapping',
    },
    TextArea: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        placeholder: z.string().nullable(),
        required: z.boolean().nullable(),
      }),
      description: 'Multi-line form field',
    },
    Select: {
      props: z.object({
        name: z.string(),
        label: z.string().nullable(),
        options: z.string(),
        required: z.boolean().nullable(),
      }),
      description: 'Dropdown; options is a comma-separated list of labels',
    },
    SubmitButton: {
      props: z.object({
        label: z.string(),
        actionId: z.string().nullable(),
      }),
      description: 'Submits the nearest Form or runs actionId via run_api',
    },
    Button: {
      props: z.object({
        label: z.string(),
        href: z.string().nullable(),
        navigateTo: z.string().nullable(),
        actionId: z.string().nullable(),
        backgroundColor: z.string().nullable(),
        color: z.string().nullable(),
      }),
      description:
        'Button. Prefer navigateTo for in-app pages, actionId for APIs, href only for true outbound links.',
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

export const ARENA_GENERATIVE_UI_OUTPUT_RULES = [
  'Output a single complete JSON object. Do NOT wrap it in markdown fences. Do NOT output JSONL patches.',
  'Shape: { "title": string, "content": string, "manifest": { "entryPath": string, "pages": { [path]: { "title", "path", "spec" } }, "actions": { [actionId]: { "apiKey", "inputMapping?", "onSuccess?", "onError?" } } } }',
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
  'onSuccess.navigate and NavLink.to / Button.navigateTo / navigate action `to` must be existing page paths.',
  'Every page must be reachable from entryPath via NavLink, navigateTo, navigate, or onSuccess.navigate.',
  'DataText, Text, Alert, and ListItem render markdown. Put API bodies on DataText (e.g. output.content); do not split markdown into Heading/List elements.',
  'Layout: each page is a full-page app screen. Page → Section (leave width at the wide default so it fills up to 1280px) → content. Use the horizontal space; do not stack every element in one narrow centre column. Do not set maxWidth unless the brief demands an exact cap.',
  'Collections: render a list of items as a Grid of Cards (columns 2 or 3), or a Table when the items share the same fields. Never one full-width Card per item stacked vertically.',
  'Tabular data goes in Table, metrics go in Stat inside a Grid, record details go in KeyValue, short statuses go in Badge.',
  'Forms: group related fields side by side in a Grid (columns 2) and keep only long free-text fields full width. Forms have labeled fields, one SubmitButton, and an optional Back NavLink.',
  'Chrome: start a page with PageHeader (title, subtitle, primary action as its child) instead of a bare Heading. Use Toolbar for a row of filters or secondary buttons, and Columns for a main area beside a supporting sidebar.',
  'Navigation: when the app has three or more pages, put a Tabs element with one "Label|path" line per top-level page at the top of each page and set activePath to the current path. Detail pages are reached with NavLink/navigateTo and offer a Back NavLink.',
  'Typography: one h1-level page title per page (PageHeader.title counts), then a short supporting subtitle. Never title a page "Page 1" or use lorem ipsum.',
  'Use catalog props (backgroundColor, padding, gap, columns, justify, color) so the layout is not the default grey dump.',
  'Do not include a logo, wordmark, or decorative Image for branding. The host already provides the outer shell.',
] as const

/** Added to the generator prompt only when a declared binding has `stream: true`. */
export const ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE =
  'If a declared API binding has stream: true, still infer a multi-page sitemap from the brief. Put DataText with statePath "content" in the section or page that shows that API body (often a results page). If the result is not on the form page, set onSuccess.navigate to that page and add a Back NavLink to the form. Include ProgressSteps only when the user asked for stepped progress; otherwise omit it.'
