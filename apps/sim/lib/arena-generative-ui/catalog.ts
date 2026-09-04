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
      description:
        'Root page wrapper. Always use as the root element for each page Spec. First child is AppHeader (sticky product chrome), then Section.',
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
        'Content section. width defaults to wide (fills up to 1280px); use narrow only for a focused single-column form, full to span the viewport. Leave maxWidth unset unless you need an exact cap. showWhen uses the same clause syntax as form fields. Same-page History Open hides the list with `!selectedId` and shows markdown with `selectedId`. Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`. Cross-page History (Open + navigateTo another path, or Chip view switch) must never use `!selectedId` on the list — the list page stays visible.',
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
        'Flex stack for vertical or horizontal layout. Use justify to distribute a horizontal row and wrap so it reflows on narrow screens. For collections of equal items use Grid instead. showWhen uses the same clause syntax as form fields. Wrap a same-page History list in showWhen "!selectedId" only when Open stays on this path. Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`. Cross-page History and Chip view-switch lists stay visible — never `!selectedId`.',
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
        'Renders its children once per element of a host-state array at statePath. Put Repeat inside a Grid or Stack; the children are the per-item template (typically a Card). Bind per-item fields with statePath "item.field" (no braces). Put per-item values into labels, hrefs, and navigation with "{item.field}" — NavLink.to "order?id={item.id}" opens that row\'s detail page. A Button.selectItem inside Repeat copies the row into host state without an API call; a Button.actionId sends the item\'s fields as the action input. Never bind a long prose field (output, content, body) inside Repeat. Use Table instead when every item is the same scalar fields with no per-row action. When the array is empty the host shows emptyText (default "No results") — do not add a second Text for that. showWhen "!selectedId" hides the list only for same-page History Open (no navigateTo, no Workspace or Drawer). Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`. Cross-page History (selectItem + navigateTo, or a Chip that switches activeView) must leave the list visible. When the binding has no pagination the host pages long lists locally; do not emit a Load more Button.',
    },
    Columns: {
      props: z.object({
        layout: z.enum(['equal', 'sidebar-left', 'sidebar-right']).nullable(),
        gap: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Two-column layout for asymmetric content: equal halves, or a 280px sidebar beside the main column. Stacks vertically on narrow screens. Not a three-region workspace — that is Workspace.',
    },
    Workspace: {
      props: z.object({
        inspectorWhen: z.string().nullable(),
        gap: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['navigator', 'primary', 'inspector'],
      description:
        'Multi-region application shell. Children in order: navigator, primary, optional inspector. Exactly one primary. Regions stay visible together — do not use Tabs for these three and do not hide navigator or primary with `!selectedId`. inspectorWhen uses the same clause syntax as form fields (typically "selectedId") to hide the inspector. The host stacks regions on narrow screens. Region bodies use other catalog types; do not nest Workspace.',
    },
    Stepper: {
      props: z.object({
        items: z.string(),
        activePath: z.string().nullable(),
      }),
      description:
        'Sequential workflow progress. items is newline-separated "Label|path" or "Label|section". activePath marks the current stage. Not Tabs (those are peer views) and not ProgressSteps (legacy wait chrome).',
    },
    AppHeader: {
      props: z.object({
        title: z.string(),
        icon: z
          .enum([
            'search',
            'shield',
            'file',
            'chart',
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
      slots: ['default'],
      description:
        'Sticky product chrome: mark + title flush to the left viewport edge, optional trailing children on the right. A direct child of Page — never inside Section. Not PageHeader (that is the in-page hero or task title). The host paints it full-bleed so content cannot slide under it. Do not fake this with Icon + Heading in a Stack.',
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
        'Page title with optional kicker (small brand-colored label above the title) and subtitle. align "center" stacks kicker/title/subtitle as a hero with a readable measure; children stay top-right (history, secondary). Default align is start. Use once at the top of a Section instead of a bare Heading. Not the sticky product bar — that is AppHeader.',
    },
    Toolbar: {
      props: z.object({
        justify: z.enum(['start', 'center', 'between', 'end']).nullable(),
      }),
      slots: ['default'],
      description: 'Horizontal row of controls (filters, buttons, badges) that wraps when narrow.',
    },
    Filter: {
      props: z.object({
        justify: z.enum(['start', 'center', 'between', 'end']).nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Toolbar of controls that narrow a collection. Children are Select, TextInput, DateInput, or Chip. Place above Table or Repeat. Name fields after collection columns. When no filter API exists the host filters visible rows locally; otherwise fields submit with onLoad / CTA. Not a SearchField hero.',
    },
    Tabs: {
      props: z.object({
        items: z.string(),
        activePath: z.string().nullable(),
      }),
      description:
        'Top-level navigation across pages. items is newline-separated "Label|path" where each path is a distinct manifest page path — never two tabs with the same path. activePath marks the current page. Do not fake tabs with Chip setValue on one page when the destinations are separate pages.',
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
        description: z.string().nullable(),
        footerText: z.string().nullable(),
        padding: z.string().nullable(),
        variant: z.enum(['default', 'muted']).nullable(),
        backgroundColor: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        "Card with optional title, subtitle, and description. variant is default (raised host surface) or muted (bordered, no shadow) — not a Button variant. padding takes a spacing token (xs–2xl) or a CSS length. The first Icon or Avatar child is media (feature well or entity logo). Button, Chip, NavLink, Link, and Toolbar children render in a footer under a divider with optional footerText. Use this for entity result cards (logo, title, subtitle, truncated body, footer meta + Analyze) and for feature cards with an Icon well. showWhen uses the same clause syntax as form fields (for example selectedId={item.id} to reveal a selected row's markdown).",
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
        'Displays a host-state value at a dotted path (e.g. content, selected.output, or item.output) as markdown/prose — never as a Table. Bind Table or KeyValue when the layout plan chose a collection or object. For stream: true CTAs, bind statePath to content on the page or section that shows the result. showWhen uses the same clause syntax as form fields — hide until a Repeat selectItem sets selectedId.',
    },
    Table: {
      props: z.object({
        columns: z.string().nullable(),
        rows: z.string().nullable(),
        statePath: z.string().nullable(),
        emptyText: z.string().nullable(),
      }),
      description:
        'Tabular data. Either static: columns as comma-separated headers plus rows as newline-separated lines with "|" between cells. Or bound: statePath pointing at a host-state array of objects, where columns names the object keys to show. Prefer this over stacked Cards when every item is the same scalar fields. A SearchField without actionId and Filter Selects named after columns filter these rows locally. When the binding has no pagination the host pages long tables locally; do not emit a Load more Button. A bound table with no rows shows emptyText (default "No results").',
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
    Chart: {
      props: z.object({
        title: z.string().nullable(),
        chartType: z.enum(['bar', 'line', 'area', 'pie']),
        statePath: z.string().nullable(),
        categoryField: z.string().nullable(),
        series: z.string().nullable(),
        categories: z.string().nullable(),
        values: z.string().nullable(),
        height: z.string().nullable(),
        showLegend: z.boolean().nullable(),
        stacked: z.boolean().nullable(),
        emptyText: z.string().nullable(),
      }),
      description:
        'Full chart with axes or pie slices (bar, line, area, pie). Prefer statePath on an array of records plus categoryField and series field keys (comma-separated, like Table.columns). Dummy/local: categories + values. Sparkline remains the compact trend under a Stat — do not use Chart as chrome. Never invent metrics when source data is provided.',
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
      slots: ['default'],
      description:
        'Designed empty region: title, optional body, optional catalog icon. The default slot is one primary next action (SearchField, Button, or NavLink). Use when a page has no collection yet and emptyText on Table/Repeat is not enough. Do not use as a loading state.',
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
    Toast: {
      props: z.object({
        text: z.string(),
        tone: z.enum(['info', 'success', 'warning', 'error']).nullable(),
        showWhen: z.string().nullable(),
      }),
      description:
        'Transient in-content feedback the brief asked for. Auto-dismisses. showWhen uses the same clause syntax as form fields. Do not use for save success or API failure — the host shows those.',
    },
    Modal: {
      props: z.object({
        title: z.string().nullable(),
        showWhen: z.string().nullable(),
      }),
      slots: ['default'],
      description:
        'Focused secondary surface (create a record, rename, add a note). showWhen uses the same clause syntax as form fields. Open with a Button setValue that sets that flag (`creating=true` for create, `editing=true` for edit); close with a ghost Button setValue that clears it (`creating=` / `editing=`) or the overlay Close control. Do not reuse creating for edit. Not a multi-step workflow and not delete confirm — the host owns destructive confirm.',
    },
    Drawer: {
      props: z.object({
        title: z.string().nullable(),
        showWhen: z.string().nullable(),
        side: z.enum(['left', 'right']).nullable(),
      }),
      slots: ['default'],
      description:
        'Contextual detail that keeps the list visible. showWhen is typically "selectedId". Close with a ghost Button clearItem true or Escape. Prefer this over navigating away when the row already has prose. Not a full record page that needs its own onLoad.',
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
        'Optional placeholder for a region built from static children. Table, Repeat, Stat, Chart, Sparkline, KeyValue and DataText bound to a statePath already skeleton automatically. Prefer binding statePath over emitting Skeleton.',
    },
    ProgressSteps: {
      props: z.object({
        steps: z.string(),
        durationMs: z.union([z.number(), z.string()]).nullable().optional(),
        actionId: z.string().nullable(),
      }),
      description:
        'Legacy step list. Do not emit — use WorkingCard when the brief names a generate wait. Existing specs still render.',
    },
    WorkingCard: {
      props: z.object({
        steps: z.string(),
        title: z.string().nullable(),
        estimate: z.string().nullable(),
        intervalMs: z.union([z.number(), z.string()]).nullable().optional(),
        durationMs: z.union([z.number(), z.string()]).nullable().optional(),
        tip: z.string().nullable(),
        cancelTo: z.string().nullable(),
        cancelLabel: z.string().nullable(),
        skeleton: z.boolean().nullable(),
        actionId: z.string().nullable(),
      }),
      description:
        'Long-run wait while a generate CTA is pending. Visible only while that actionId is in flight; hides when the answer arrives. The host stamps actionId when omitted. steps is newline-separated status copy from the brief. The host rotates one current step every intervalMs (default 2500) and fills a thin bar in lockstep — one increment per step, no independent loop, no wrap. title and tip interpolate form fields (`Working on \'{targetKeyword}\' for {clientBrand}...`). estimate is duration copy such as "Usually takes 90–150s"; the host appends elapsed. cancelTo is the form page path — Cancel abandons the in-flight CTA and navigates there. skeleton defaults true and draws a document-outline placeholder under the card. Put this on the destination of a navigate-first generate, or below SubmitButton when the brief stays on the form. Do not also emit ProgressBar, ProgressSteps, or Spinner. Do not reuse this card for History onLoad or other CTAs — those use the control spinner.',
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
        'One-line search with a nested primary submit inside a pill track. name is the query key. Omit actionId to filter the on-page Table/Repeat locally as the user types. actionId runs a manifest.actions key (declared apiKey, or dummy/local with no apiKey) when this field is not inside a Form; inside a Form the parent submits. suggestions is a comma-separated list of chips that fill the field. Use this for a one-field search hero — do not fake it with Stack + TextInput + SubmitButton.',
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
        'Form wrapper for multi-field forms. actionId must match a manifest.actions key (declared apiKey, or dummy/local with no apiKey). align controls cross-axis placement of its rows and defaults to stretch. The host stretches Form to fill its Card and narrows a form-only Section. A one-field search uses SearchField on its own instead of Form + TextInput.',
    },
    Chat: {
      props: z.object({
        actionId: z.string(),
        placeholder: z.string().nullable(),
      }),
      description:
        'Chat composer for a workflow Start that declares reserved input (and optional files / conversationId). actionId must be a manifest action whose binding has chatProtocol.input. Follow-up messages bind to input as typed. The first form CTA composes input from the Add-an-API prefix plus name: value for declared fields. The host stamps conversationId on form and Chat. When this page has no DataText bound to content, the host paints streamed state.content above the composer. Never put reserved names on Form controls.',
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
        setValue: z.string().nullable(),
        variant: z.enum(['primary', 'secondary', 'ghost', 'outline', 'destructive']).nullable(),
        size: z.enum(['sm', 'md']).nullable(),
        shape: z.enum(['default', 'pill']).nullable(),
        showWhen: z.string().nullable(),
      }),
      description:
        'Button. Prefer navigateTo for in-app pages, actionId for APIs, href only for true outbound links. setValue writes a host flag so a sibling Modal or Drawer showWhen can open: `creating=true` for New / Add, `editing=true` for a Repeat-row Edit (the host selects that row and prefills). Empty value (`creating=` / `editing=`) clears it — do not reuse creating for edit. Inside Repeat, selectItem true copies that row into host state (selected, selectedId, content from output/content) without calling an API — combine with navigateTo a results page that has no onLoad, or stay on the list page with no navigateTo. Same-page History then hides the list and shows sibling detail with showWhen "selectedId". Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`. It does not restamp inputs; Results chips still use the form field names. clearItem true drops that copied row so Back can restore the list; it must not set selectItem or actionId. variant sets emphasis and defaults to secondary: use primary for the single main action of a page, secondary for ordinary actions, outline for a brand-bordered pill such as "View analysis history", ghost for low-emphasis ones such as Back or Cancel, destructive for delete. shape "pill" fully rounds the control. showWhen hides the button until host state or a form field matches (same syntax as form fields) — use "hasMore" for Load more and "selectedId" for a same-page Back.',
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

let catalogComponentTypes: Set<string> | null = null

/**
 * True when `type` is a catalog component key (`Chat`, `Workspace`, `Stepper`, …).
 * Preview diagnostics must use this instead of a hand-maintained renderer set.
 */
export function isArenaGenerativeCatalogType(type: string): boolean {
  if (!catalogComponentTypes) {
    const names = (arenaGenerativeUiCatalog as { componentNames?: unknown }).componentNames
    if (!Array.isArray(names) || names.length === 0) {
      throw new Error(
        'The json-render catalog no longer exposes componentNames; arena-generative-ui/catalog.ts must be updated.'
      )
    }
    catalogComponentTypes = new Set(
      names.filter((name): name is string => typeof name === 'string')
    )
  }
  return catalogComponentTypes.has(type)
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
  'You are an expert principal frontend engineer specializing in design systems, dashboards, multi-step forms, and operational tools. Implement the structured brief as a finished product: honour every named page, field, CTA, and navigation, and fill the unsaid production details (labels, empty copy, Back, grouping, hierarchy) a senior engineer would ship. Do not change the sitemap, invent API keys, or add destinations the brief did not plan. Your only output is a single valid JSON object conforming to the schema below. Emit no markdown fences, no explanation, no preamble, and no trailing text.'

export {
  ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES,
  ARENA_GENERATIVE_UI_COMPONENT_RULES,
  ARENA_GENERATIVE_UI_ENVELOPE_RULES,
  ARENA_GENERATIVE_UI_INTERACTION_RULES,
  ARENA_GENERATIVE_UI_OUTPUT_RULES,
  ARENA_GENERATIVE_UI_RESPONSIVE_RULES,
} from '@/lib/arena-generative-ui/catalog-rules'

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
  'Reserved Start fields input, conversationId, and files are chat protocol, not form fields. input may appear on the binding as an optional constant prefix — do not render it. When the binding lists chatProtocol, emit Chat (actionId) — typically on results, often the right column. Never name a TextInput, TextArea, or SearchField input, conversationId, or files. Chat-only bindings (chatProtocol.input and no form fields) must include Chat, not an empty Form. The first form CTA composes input from that prefix plus name: value for declared fields; later Chat sends the composer text as input. The host stamps conversationId on both, and attachments as files. When stream is true, Chat on the destination paints streamed state.content unless DataText already binds content.',
  'visitorEmail is the signed-in user only (typical names: userEmail, loggedInEmail, visitorEmail). The host stamps it onto those Start fields — do not collect email in the form or send it in the browser body. A lone inputMapping { "email": "arenaEmailId" } is redundant and must not become an allowlist that drops form fields. Do not map a form "email" field to arenaEmailId. Constant fields need no form name and no inputMapping; the host stamps their value on every call.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ACTION_RESULT_RULE = [
  'CTA results: each binding includes layoutPlan — bind only those hostKeys as statePath, never nested schema paths (run_data.history) or envelopes (never "data.articles", "output.articles", or "response.articles"). Nested collections are lifted to the last segment ("history"). A response that is an array or a plain value lands under "result". A markdown string field (article_data, or a typo like artical_data) lands at that key and is copied to "content" as the prose body — not a JSON dump of the object. Bind DataText to "content" or the string field name; never "field.content" unless outputSchema shows an object with a content child.',
  'Submitted form fields land in host state under "inputs" immediately on click — before the API returns. Echo them on the destination with Chip or DataText statePath "inputs.targetKeyword", or "{targetKeyword}" in Chip/Text/Heading/PageHeader. Use the home form name ({targetKeyword}, {clientBrand}), not History row keys ({keyword}, {client}) — those are Repeat item.keyword / item.client only. Field name is camelCase; labels may have spaces. Do not hope the API echoes those fields, and do not write "{Target Keyword}" expecting the label to bind unless it matches the field name after ignoring spaces and case.',
  'When a binding declares outputSchema, bind its field names as statePath instead of dumping "content": an array field such as "articles" with children "articles[].title" becomes Table statePath="articles" with columns from those child names, or Repeat inside a Grid when each item needs its own Card, link, or action; a single number or string becomes Stat or KeyValue; a markdown string becomes DataText on that name or "content", never "field.content"; only fall back to DataText statePath="content" for unstructured prose or when the binding declares no outputSchema. showWhen on the results chrome must use that same key as the DataText (content or the string field), not one key for the toolbar and another for the article. Copy Markdown and Download PDF must not bind the generate API.',
  'When a binding has no outputSchema and no outputHint, do not invent Table columns or Stat metrics. Bind DataText to "content" (or Repeat/Table only if the brief names the exact collection keys). Prefer a results page of prose until an output sample is provided.',
  'When list items already include a prose field (history[].output, items[].content), Open is Button selectItem true with no actionId; the host copies that field to content and selected, not inputs. Do not invent a second fetch for a field already on the row. Generate still navigates to Results, which echoes form names. Same-page History: Open stays on this path (no navigateTo); hide the list with showWhen "!selectedId" and show markdown with showWhen "selectedId" plus Back clearItem true — the host compiles those props if missing. Workspace and Drawer keep the collection visible — do not hide navigator or primary with `!selectedId`. Cross-page History: Open is selectItem plus navigateTo the generator or results path; the History page is always a list — never showWhen "!selectedId". Tabs Label|history and Label|home must be distinct paths. Chip view-switch History on the same page also keeps the list visible.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_PAGINATION_RULE = [
  'Pagination: when a binding declares pagination, the host injects limit and cursor/offset, writes hasMore plus nextCursor (cursor mode) or offset (offset mode) into state, and appends the items array on page 2+ so Load more does not replace the list. Put a Button with the same actionId, showWhen "hasMore", and inputMapping that sends state nextCursor (cursor: "nextCursor") or offset (offset: "offset"). Do not invent a second action for the next page. When the binding has no pagination, the host pages Table and Repeat locally from the loaded rows — do not emit showWhen "hasMore" or a Load more actionId.',
].join(' ')

/** Added to the generator prompt only when at least one API binding is declared. */
export const ARENA_GENERATIVE_UI_ON_LOAD_RULE = [
  'Data on arrival: a page whose content comes from an API the user did not just submit must fetch it itself. Set page "onLoad" to an array of manifest.actions ids and the host runs them once when the page opens, merging the response into state exactly as a CTA does. A dashboard, a report, a list, or a record detail page needs onLoad; a form page does not. A Results page that Generate already navigates to must not onLoad that same action — empty query params would refetch and miss or overwrite the CTA body.',
  'onLoad receives the page query params as its action input, mapped through the action inputMapping. A navigation target may carry those params — NavLink.to "report?range=30d" opens the report page and its onLoad action receives range "30d", and inside Repeat the same target can be "order?id={item.id}" so each row opens its own record — while the part before "?" must still be an existing page path. Give an onLoad action no onSuccess.navigate: the host ignores it rather than bouncing the user off the page they just opened.',
  'A page with onLoad still needs loading states: bind its Table, Repeat, Stat, Chart, KeyValue, and DataText to a statePath so the placeholder shows while the load is in flight.',
].join(' ')

/**
 * Branding lives on `manifest.theme`. Always emit Arena DS defaults so the host
 * is never left on a generic Tailwind palette.
 */
export const ARENA_GENERATIVE_UI_THEME_RULE = [
  'Theme: always emit manifest.theme { brandColor: "#1A73E8", radius: "md", density: "comfortable", font: "sans", colorScheme: "light" }. Override brandColor, radius, font, or colorScheme only when Design Notes name them. Override density when Design Notes name it, or when DESIGN INTENT density is compact or roomy. Do not set backgroundColor on Page or Card for branding — the host applies theme as CSS variables.',
].join(' ')

/**
 * Compressed Arena Design System tokens. Archetype layouts live on the recipe
 * and gold few-shot, not here — repeating them on every run re-biased dashboards
 * toward a search hero.
 */
export const ARENA_GENERATIVE_UI_DESIGN_GUIDELINES = [
  'ARENA DESIGN SYSTEM',
  'The host already paints Poppins, brand blue #1A73E8, grey text hierarchy, 12px radius, 40px controls, display titles, and shadow-first cards. You compose catalog components; you do not invent hex, fonts, or CSS.',
  'DESIGN TOKENS (host-owned). Color, type, radius, and density are painted by the host. Do not set backgroundColor, color, fontFamily, or radius on elements. You may set gap and padding to a spacing token, and Card.variant to default or muted.',
  'color: background, surface, surfaceMuted, text, textMuted, border, primary, success, warning, danger — host CSS; not element props.',
  'spacing: none xs sm md lg xl 2xl — use on gap and padding only. Prefer gap "lg" between groups. Example: {"type":"Card","props":{"variant":"default","padding":"lg"}}.',
  'radius: sm md lg — manifest.theme.radius only.',
  'typography: display h1 h2 h3 body bodySmall caption — host maps PageHeader and Heading.level; do not set fontSize.',
  'density: compact comfortable roomy — manifest.theme.density only. Tokens scale with density.',
  'Viewport: full page up to 1280px; the same layout stacks in a narrow Arena iframe because Grid and Columns collapse. Do not author a permanently narrow centre column.',
  'Every generate reply includes the default theme. Page → AppHeader → Section → PageHeader; Section width follows DESIGN GUIDELINES. Then groups of Grid / Columns / Card with gap "lg". Surfaces are exactly two — the page canvas and the Card/Stat surface — both supplied by the host. Content avatars and company logos are allowed; app identity is AppHeader, not Image.',
].join('\n')

/**
 * Compact Design System context for the UI planner. Classification only — not
 * the spec Design Guidelines and not a catalog dump.
 */
export const ARENA_GENERATIVE_UI_PLANNER_DS_CONTEXT = [
  'Design system context (host-owned — do not emit hex, fonts, CSS, catalog component types, or a manifest).',
  'Surfaces are exactly two: the page canvas and the Card/Stat surface, both supplied by the host.',
  'Color, type, and radius are host CSS. density is compact | comfortable | roomy. gap and padding may use spacing tokens none xs sm md lg xl 2xl. App identity is AppHeader, not a decorative wordmark.',
].join('\n')

/** Added to the generator prompt only when a declared binding has `stream: true`. */
export const ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE =
  'If a declared API binding has stream: true, still infer a multi-page sitemap from the brief. For prose streams, put DataText with statePath "content" in the section or page that shows that API body (often a results page), or Chat on that page — the host paints streamed content above Chat when DataText is omitted. If the binding has outputHint, treat it as an example of the streamed body — match that shape in DataText and page copy; do not invent Table columns from it. If the binding also declares outputSchema, bind those fields as Table, Stat, or KeyValue instead of dumping content — an array field such as companies becomes Table statePath="companies". If the result is not on the form page, set onSuccess.navigate to that page and add a Back NavLink to the form. When the brief names status steps for that wait, emit WorkingCard on that page; otherwise the host shows pending chrome.'
