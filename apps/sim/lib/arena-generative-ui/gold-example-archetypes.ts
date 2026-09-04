import type { Spec } from '@json-render/core'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

/** Render contract shared by every gold few-shot. Gold does not decide sitemap. */
export const GOLD_RENDER_CONTRACT = [
  'Match tokens, catalog types, and wiring (statePath, actionId, selectItem / showWhen).',
  'Honour pages[], regions, and interaction from the blueprint.',
  "Do not copy this sample's sitemap, page count, shell, or subject.",
  'Do not invent pages or regions the blueprint omitted.',
  'Note the default Arena theme and result components bound by statePath.',
  'gap and padding use spacing tokens (sm, md, lg); Card.variant is default or muted.',
  'Do not copy px, hex, or CSS variables.',
].join(' ')

function goldPrompt(
  archetype: string,
  framing: string,
  output: { title: string; content: string; manifest: ArenaGenerativeAppManifest }
): string {
  return [
    `GOLD STANDARD REFERENCE LAYOUT (${archetype})`,
    GOLD_RENDER_CONTRACT,
    framing,
    JSON.stringify(output, null, 2),
  ].join('\n\n')
}

const dashboardHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Operations', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['entity', 'filters', 'kpis', 'trend', 'activity'],
    },
    entity: {
      type: 'EntityHeader',
      props: {
        title: 'Northwind',
        description: 'Orders, fulfilment, and open exceptions for the current week.',
        badge: 'Live',
        badgeTone: 'success',
        logoSrc: null,
        initials: 'NW',
        statePath: 'company.logo',
        meta: 'Wholesale, Chicago',
      },
      children: [],
    },
    filters: {
      type: 'Filter',
      props: { justify: 'start', showWhen: null },
      children: ['range'],
    },
    range: {
      type: 'DateInput',
      props: {
        name: 'from',
        label: 'From',
        required: false,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
      },
      children: [],
    },
    kpis: {
      type: 'Grid',
      props: { columns: '2', gap: 'md', minItemWidth: null },
      children: ['kpi_orders', 'kpi_fill'],
    },
    kpi_orders: {
      type: 'Stat',
      props: {
        label: 'Orders',
        value: null,
        statePath: 'orders',
        hint: null,
        delta: '+8%',
        deltaTone: 'positive',
        size: 'display',
      },
      children: [],
    },
    kpi_fill: {
      type: 'Stat',
      props: {
        label: 'Fill rate',
        value: null,
        statePath: 'fillRate',
        hint: null,
        delta: null,
        deltaTone: null,
        size: 'display',
      },
      children: [],
    },
    trend: {
      type: 'Card',
      props: {
        title: 'Order volume',
        subtitle: 'Last 12 weeks',
        description: null,
        footerText: null,
        padding: 'lg',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['spark'],
    },
    spark: {
      type: 'Chart',
      props: {
        title: 'Weekly orders',
        chartType: 'line',
        statePath: 'orderVolume',
        categoryField: null,
        series: null,
        categories: null,
        values: null,
        height: '320',
        showLegend: false,
        stacked: false,
        emptyText: 'No volume yet.',
      },
      children: [],
    },
    activity: {
      type: 'Table',
      props: {
        statePath: 'exceptions',
        columns: 'Order, Status, Age',
        rows: null,
        emptyText: 'No open exceptions.',
      },
      children: [],
    },
  },
}

export const goldDashboardManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: {
      path: 'home',
      title: 'Operations',
      spec: dashboardHomeSpec,
      onLoad: ['load_dashboard'],
    },
  },
  actions: {
    load_dashboard: {
      onSuccess: {
        setState: {
          orders: 128,
          fillRate: '94%',
          orderVolume: [12, 18, 15, 22, 19, 24, 21, 28, 25, 31, 27, 34],
          exceptions: [
            { Order: '1001', Status: 'Late', Age: '2d' },
            { Order: '1002', Status: 'Hold', Age: '1d' },
          ],
        },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD = goldPrompt(
  'dashboard',
  'Slots: Header, Filters, KPI/summary, primary visualization, supporting activity. Module count follows the bound hostKeys — this example uses two Stats, a Chart, and a Table, not a fixed four-Stat grid. onLoad setState seeds those hostKeys; every Stat, Chart, and Table bind by statePath. When a binding was declared, use that apiKey instead of this setState. Do not invent API keys. There is no search hero.',
  {
    title: 'Operations',
    content: 'Dashboard of weekly operations metrics on arrival.',
    manifest: goldDashboardManifest,
  }
)

const listHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Orders', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'results_grid'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Open orders',
        subtitle: 'Select a row to open the record.',
        kicker: 'Inbox',
        align: 'start',
      },
      children: [],
    },
    results_grid: {
      type: 'Grid',
      props: { columns: '2', gap: 'md', minItemWidth: null },
      children: ['results_repeat'],
    },
    results_repeat: {
      type: 'Repeat',
      props: { statePath: 'orders', emptyText: 'No open orders.' },
      children: ['order_card'],
    },
    order_card: {
      type: 'Card',
      props: {
        title: '{item.name}',
        subtitle: '{item.status}',
        description: '{item.summary}',
        footerText: '{item.meta}',
        padding: 'lg',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['order_logo', 'open_order'],
    },
    order_logo: {
      type: 'Avatar',
      props: { src: '{item.logo}', initials: '{item.initials}', statePath: null },
      children: [],
    },
    open_order: {
      type: 'Button',
      props: {
        label: 'Open',
        actionId: null,
        selectItem: true,
        clearItem: null,
        navigateTo: 'detail?id={item.id}',
        href: null,
        variant: 'secondary',
        size: 'sm',
        shape: 'pill',
        showWhen: null,
      },
      children: [],
    },
  },
}

const listDetailSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Order', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['back', 'entity', 'details'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'home' },
      children: [],
    },
    entity: {
      type: 'EntityHeader',
      props: {
        title: '{selected.name}',
        description: '{selected.summary}',
        badge: '{selected.status}',
        badgeTone: 'info',
        logoSrc: null,
        initials: '{selected.initials}',
        statePath: 'selected.logo',
        meta: '{selected.meta}',
      },
      children: [],
    },
    details: {
      type: 'KeyValue',
      props: { items: null, statePath: 'selected', emptyText: 'Order not found.' },
      children: [],
    },
  },
}

export const goldListDetailManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: {
      path: 'home',
      title: 'Orders',
      spec: listHomeSpec,
      onLoad: ['load_orders'],
    },
    detail: {
      path: 'detail',
      title: 'Order',
      spec: listDetailSpec,
    },
  },
  actions: {
    load_orders: {
      onSuccess: {
        setState: {
          orders: [
            {
              id: 'o1',
              name: 'Acme',
              status: 'Open',
              summary: 'Q3 renewal.',
              meta: 'Due Friday',
              initials: 'A',
            },
            {
              id: 'o2',
              name: 'Northwind',
              status: 'Open',
              summary: 'New seat expansion.',
              meta: 'Due next week',
              initials: 'N',
            },
            {
              id: 'o3',
              name: 'Contoso',
              status: 'Open',
              summary: 'Support renewal.',
              meta: 'Due Monday',
              initials: 'C',
            },
            {
              id: 'o4',
              name: 'Adventure Works',
              status: 'Open',
              summary: 'Pilot kickoff.',
              meta: 'Due in two weeks',
              initials: 'AW',
            },
          ],
        },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL = goldPrompt(
  'list-detail',
  'This sample has a Detail page because the blueprint named one. Collection onLoad setState seeds 4–8 Repeat rows inside a 2-column Grid of entity Cards. Open is selectItem plus navigateTo "detail?id={item.id}" so the row is copied; Detail binds selected (EntityHeader + KeyValue) with no onLoad fetch. When list and record bindings were declared, list onLoad uses the list apiKey; Open may omit selectItem; Detail onLoad uses the record apiKey into record. Do not invent API keys. Cards is one valid representation because rows have per-item identity; Table is equally valid when rows are comparable scalars. Match REPRESENTATION, not this body, when the brief picked table or list. No search hero. Omit the Detail page when pages[] has no detail.',
  {
    title: 'Orders',
    content: 'Browse orders and open one record.',
    manifest: goldListDetailManifest,
  }
)

const collectionHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Items', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'results_grid', 'create_modal', 'edit_modal'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Items',
        subtitle: 'Create, edit, and complete stay on this page.',
        kicker: 'List',
        align: 'start',
      },
      children: ['new_item'],
    },
    new_item: {
      type: 'Button',
      props: {
        label: 'New item',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'creating=true',
        navigateTo: null,
        href: null,
        variant: 'primary',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    results_grid: {
      type: 'Grid',
      props: { columns: '2', gap: 'md', minItemWidth: null },
      children: ['results_repeat'],
    },
    results_repeat: {
      type: 'Repeat',
      props: { statePath: 'items', emptyText: 'No items yet.' },
      children: ['item_card'],
    },
    item_card: {
      type: 'Card',
      props: {
        title: '{item.name}',
        subtitle: '{item.status}',
        description: '{item.summary}',
        footerText: '{item.meta}',
        padding: 'lg',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['item_logo', 'edit_item', 'complete_item'],
    },
    item_logo: {
      type: 'Avatar',
      props: { src: '{item.logo}', initials: '{item.initials}', statePath: null },
      children: [],
    },
    edit_item: {
      type: 'Button',
      props: {
        label: 'Edit',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'editing=true',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    complete_item: {
      type: 'Button',
      props: {
        label: 'Complete',
        actionId: 'complete_item',
        selectItem: null,
        clearItem: null,
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    create_modal: {
      type: 'Modal',
      props: { title: 'New item', showWhen: 'creating' },
      children: ['create_form'],
    },
    create_form: {
      type: 'Form',
      props: { actionId: 'create_item', align: 'start' },
      children: ['item_name', 'create_actions'],
    },
    item_name: {
      type: 'TextInput',
      props: {
        name: 'name',
        label: 'Name',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Item name',
      },
      children: [],
    },
    create_actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['cancel_create', 'submit_create'],
    },
    cancel_create: {
      type: 'Button',
      props: {
        label: 'Cancel',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'creating=',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    submit_create: {
      type: 'SubmitButton',
      props: { label: 'Create', actionId: 'create_item', size: null },
      children: [],
    },
    edit_modal: {
      type: 'Modal',
      props: { title: 'Edit item', showWhen: 'editing' },
      children: ['edit_form'],
    },
    edit_form: {
      type: 'Form',
      props: { actionId: 'edit_item', align: 'start' },
      children: ['edit_name', 'edit_actions'],
    },
    edit_name: {
      type: 'TextInput',
      props: {
        name: 'name',
        label: 'Name',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Item name',
      },
      children: [],
    },
    edit_actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['cancel_edit', 'submit_edit'],
    },
    cancel_edit: {
      type: 'Button',
      props: {
        label: 'Cancel',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'editing=',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    submit_edit: {
      type: 'SubmitButton',
      props: { label: 'Save', actionId: 'edit_item', size: null },
      children: [],
    },
  },
}

export const goldCollectionManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: {
      path: 'home',
      title: 'Items',
      spec: collectionHomeSpec,
      onLoad: ['load_items'],
    },
  },
  actions: {
    load_items: {
      onSuccess: {
        setState: {
          items: [
            {
              id: 'i1',
              name: 'Ship',
              status: 'Open',
              summary: 'Finish the release.',
              meta: 'Due today',
              initials: 'S',
            },
            {
              id: 'i2',
              name: 'Review',
              status: 'Open',
              summary: 'Check the draft.',
              meta: 'Due Friday',
              initials: 'R',
            },
            {
              id: 'i3',
              name: 'Plan',
              status: 'Open',
              summary: 'Outline next sprint.',
              meta: 'Due Monday',
              initials: 'P',
            },
            {
              id: 'i4',
              name: 'Design',
              status: 'Open',
              summary: 'Update the mockups.',
              meta: 'Due Wednesday',
              initials: 'D',
            },
          ],
        },
      },
    },
    create_item: {},
    edit_item: {
      onSuccess: {
        setState: { editing: false },
      },
    },
    complete_item: {
      onSuccess: {
        setState: { done: true },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION = goldPrompt(
  'collection',
  'One collection page. onLoad setState seeds 4–8 Repeat rows inside a 2-column Grid of entity Cards. Create is a PageHeader trailing Button setValue that opens a Modal Form (create_item, no apiKey) on this page, not an extra page or region. Complete is a row Button (done: true); the host writes onto that row. Edit is a row Button setValue editing=true (the host selects that row); save uses editing: false, not creating: false. When a binding was declared, use that apiKey instead of this setState. Do not invent API keys. Match REPRESENTATION, not this body, when the brief picked table or list. No sibling Detail page. No catalog Workspace.',
  {
    title: 'Items',
    content: 'Browse a list on one page.',
    manifest: goldCollectionManifest,
  }
)

const wizardStepOneSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Company', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['stepper', 'header', 'form'],
    },
    stepper: {
      type: 'Stepper',
      props: {
        items: 'Company|home\nRole|role\nConfirm|confirm',
        activePath: 'home',
      },
      children: [],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Company details',
        subtitle: 'Step 1 of 3. Tell us who this account is.',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: null, align: 'start' },
      children: ['fields', 'next'],
    },
    fields: {
      type: 'Grid',
      props: { columns: '2', gap: 'md', minItemWidth: null },
      children: ['company', 'domain'],
    },
    company: {
      type: 'TextInput',
      props: {
        name: 'company',
        label: 'Company',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Acme Inc',
      },
      children: [],
    },
    domain: {
      type: 'TextInput',
      props: {
        name: 'domain',
        label: 'Domain',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'acme.com',
      },
      children: [],
    },
    next: {
      type: 'Button',
      props: {
        label: 'Next',
        navigateTo: 'role',
        href: null,
        actionId: null,
        variant: 'primary',
        size: null,
        shape: null,
        showWhen: null,
      },
      children: [],
    },
  },
}

const wizardStepTwoSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Role', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'form'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Your role',
        subtitle: 'Step 2 of 3.',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: null, align: 'start' },
      children: ['role', 'actions'],
    },
    role: {
      type: 'Select',
      props: {
        name: 'role',
        label: 'Role',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        options: 'Analyst, Operator, Admin',
      },
      children: [],
    },
    actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['back', 'next'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'home' },
      children: [],
    },
    next: {
      type: 'Button',
      props: {
        label: 'Next',
        navigateTo: 'confirm',
        href: null,
        actionId: null,
        variant: 'primary',
        size: null,
        shape: null,
        showWhen: null,
      },
      children: [],
    },
  },
}

const wizardStepThreeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Confirm', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'form'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Confirm and submit',
        subtitle: 'Step 3 of 3. Review the notes, then send.',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: 'submit_onboarding', align: 'start' },
      children: ['notes', 'actions'],
    },
    notes: {
      type: 'TextArea',
      props: {
        name: 'notes',
        label: 'Notes',
        required: false,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Anything the reviewer should know',
      },
      children: [],
    },
    actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['back', 'submit'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'role' },
      children: [],
    },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Submit', actionId: 'submit_onboarding', size: null },
      children: [],
    },
  },
}

export const goldWizardManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: { path: 'home', title: 'Company', spec: wizardStepOneSpec },
    role: { path: 'role', title: 'Role', spec: wizardStepTwoSpec },
    confirm: { path: 'confirm', title: 'Confirm', spec: wizardStepThreeSpec },
  },
  actions: {
    submit_onboarding: {
      onSuccess: {
        setState: { submitted: true },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD = goldPrompt(
  'workflow',
  'Sequential stages with a Stepper for Progress. This example uses one page per named stage; two or three short stages may instead be one page of Sections. Early stages use Next Button.navigateTo; the last step is the only SubmitButton (submit_onboarding, no apiKey) — the host toasts. When a binding was declared, use that apiKey. Do not invent API keys. Steps after the first have a Back NavLink. Not Tabs. There is no search hero and no dashboard Stats.',
  {
    title: 'Onboarding',
    content: 'Three-step onboarding that submits on the last page.',
    manifest: goldWizardManifest,
  }
)

const contentHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Brand guidelines', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'narrow', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'meta', 'body'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Voice and tone',
        subtitle: 'How we write for customers and partners.',
        kicker: 'Brand guidelines',
        align: 'start',
      },
      children: [],
    },
    meta: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['updated', 'owner'],
    },
    updated: {
      type: 'Chip',
      props: {
        text: 'Updated {updatedAt}',
        tone: 'muted',
        actionId: null,
        navigateTo: null,
        setValue: null,
      },
      children: [],
    },
    owner: {
      type: 'Chip',
      props: { text: '{owner}', tone: 'info', actionId: null, navigateTo: null, setValue: null },
      children: [],
    },
    body: {
      type: 'DataText',
      props: {
        statePath: 'content',
        fallback: 'The article loads when the page opens.',
        color: null,
        size: null,
      },
      children: [],
    },
  },
}

export const goldContentManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: {
      path: 'home',
      title: 'Brand guidelines',
      spec: contentHomeSpec,
      onLoad: ['load_article'],
    },
  },
  actions: {
    load_article: {
      onSuccess: {
        setState: {
          content:
            '# Voice\n\nWrite like a colleague. Short sentences. No slogans.\n\n## Tone\n\nCalm, direct, and specific.',
          updatedAt: 'Mar 2026',
          owner: 'Brand',
        },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT = goldPrompt(
  'content',
  'A document: Header, muted metadata chips, and a DataText markdown body. onLoad setState seeds content plus {updatedAt} and {owner}. When a binding was declared, use that apiKey instead of this setState. Do not invent API keys. Not Results (no WorkingCard) and not Detail (no EntityHeader firmographics). Related collections only when layoutPlan has one.',
  {
    title: 'Brand guidelines',
    content: 'Read the voice and tone guide.',
    manifest: goldContentManifest,
  }
)

const workspaceHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Projects', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['shell', 'create_modal', 'edit_modal'],
    },
    shell: {
      type: 'Workspace',
      props: { inspectorWhen: 'selectedId', gap: 'lg', showWhen: null },
      children: ['navigator', 'primary', 'inspector'],
    },
    navigator: {
      type: 'Stack',
      props: {
        direction: 'vertical',
        gap: 'md',
        align: 'stretch',
        justify: 'start',
        wrap: false,
      },
      children: ['nav_header', 'projects'],
    },
    nav_header: {
      type: 'PageHeader',
      props: {
        title: 'Projects',
        subtitle: 'Select a project.',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    projects: {
      type: 'Repeat',
      props: { statePath: 'projects', emptyText: 'No projects yet.' },
      children: ['project_card'],
    },
    project_card: {
      type: 'Card',
      props: {
        title: '{item.name}',
        subtitle: '{item.status}',
        description: null,
        footerText: null,
        padding: 'md',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['open_project'],
    },
    open_project: {
      type: 'Button',
      props: {
        label: 'Open',
        actionId: null,
        selectItem: true,
        clearItem: null,
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    primary: {
      type: 'Stack',
      props: {
        direction: 'vertical',
        gap: 'md',
        align: 'stretch',
        justify: 'start',
        wrap: false,
      },
      children: ['primary_header', 'tasks'],
    },
    primary_header: {
      type: 'PageHeader',
      props: {
        title: 'Tasks',
        subtitle: 'Rows include projectId matching the selected project. Create, edit, and complete stay here.',
        kicker: null,
        align: 'start',
      },
      children: ['new_task'],
    },
    new_task: {
      type: 'Button',
      props: {
        label: 'New task',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'creating=true',
        navigateTo: null,
        href: null,
        variant: 'primary',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    tasks: {
      type: 'Repeat',
      props: { statePath: 'tasks', emptyText: 'No tasks for this project.' },
      children: ['task_card'],
    },
    task_card: {
      type: 'Card',
      props: {
        title: '{item.name}',
        subtitle: '{item.projectId}',
        description: null,
        footerText: null,
        padding: 'md',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['open_task', 'edit_task', 'complete_task'],
    },
    open_task: {
      type: 'Button',
      props: {
        label: 'Open',
        actionId: null,
        selectItem: true,
        clearItem: null,
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    edit_task: {
      type: 'Button',
      props: {
        label: 'Edit',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'editing=true',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    complete_task: {
      type: 'Button',
      props: {
        label: 'Complete',
        actionId: 'complete_task',
        selectItem: null,
        clearItem: null,
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    inspector: {
      type: 'Stack',
      props: {
        direction: 'vertical',
        gap: 'md',
        align: 'stretch',
        justify: 'start',
        wrap: false,
      },
      children: ['entity', 'details'],
    },
    entity: {
      type: 'EntityHeader',
      props: {
        title: '{selected.name}',
        description: '{selected.status}',
        badge: null,
        badgeTone: null,
        logoSrc: null,
        initials: '{selected.initials}',
        statePath: 'selected.logo',
        meta: '{selected.meta}',
      },
      children: [],
    },
    details: {
      type: 'KeyValue',
      props: { items: null, statePath: 'selected', emptyText: 'Select a project or task.' },
      children: [],
    },
    create_modal: {
      type: 'Modal',
      props: { title: 'New task', showWhen: 'creating' },
      children: ['create_form'],
    },
    create_form: {
      type: 'Form',
      props: { actionId: 'create_task', align: 'start' },
      children: ['task_name', 'create_actions'],
    },
    task_name: {
      type: 'TextInput',
      props: {
        name: 'name',
        label: 'Name',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Task name',
      },
      children: [],
    },
    create_actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['cancel_create', 'submit_create'],
    },
    cancel_create: {
      type: 'Button',
      props: {
        label: 'Cancel',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'creating=',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    submit_create: {
      type: 'SubmitButton',
      props: { label: 'Create', actionId: 'create_task', size: null },
      children: [],
    },
    edit_modal: {
      type: 'Modal',
      props: { title: 'Edit task', showWhen: 'editing' },
      children: ['edit_form'],
    },
    edit_form: {
      type: 'Form',
      props: { actionId: 'edit_task', align: 'start' },
      children: ['edit_name', 'edit_actions'],
    },
    edit_name: {
      type: 'TextInput',
      props: {
        name: 'name',
        label: 'Name',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        placeholder: 'Task name',
      },
      children: [],
    },
    edit_actions: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'center',
        justify: 'start',
        wrap: true,
      },
      children: ['cancel_edit', 'submit_edit'],
    },
    cancel_edit: {
      type: 'Button',
      props: {
        label: 'Cancel',
        actionId: null,
        selectItem: null,
        clearItem: null,
        setValue: 'editing=',
        navigateTo: null,
        href: null,
        variant: 'ghost',
        size: 'sm',
        shape: null,
        showWhen: null,
      },
      children: [],
    },
    submit_edit: {
      type: 'SubmitButton',
      props: { label: 'Save', actionId: 'edit_task', size: null },
      children: [],
    },
  },
}

export const goldWorkspaceManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: {
      path: 'home',
      title: 'Projects',
      spec: workspaceHomeSpec,
      onLoad: ['load_projects'],
    },
  },
  actions: {
    load_projects: {
      onSuccess: {
        setState: {
          projects: [
            { id: 'p1', name: 'Alpha', status: 'Active' },
            { id: 'p2', name: 'Beta', status: 'Paused' },
          ],
          tasks: [
            { id: 't1', name: 'Ship', projectId: 'p1', status: 'Open' },
            { id: 't2', name: 'Review', projectId: 'p1', status: 'Open' },
            { id: 't3', name: 'Plan', projectId: 'p2', status: 'Open' },
            { id: 't4', name: 'Design', projectId: 'p2', status: 'Done' },
          ],
        },
      },
    },
    create_task: {},
    edit_task: {
      onSuccess: {
        setState: { editing: false },
      },
    },
    complete_task: {
      onSuccess: {
        setState: { done: true },
      },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE = goldPrompt(
  'sidebar-shell',
  'Catalog Workspace wiring when the blueprint used a Workspace page or pages[].regions. Children are navigator (parent Repeat), primary (child Repeat), inspector (EntityHeader + KeyValue of selected). Honour pages[].regions and pages[].interaction; this sample\'s projects/tasks are subject matter. Parent and child Open are both selectItem. onLoad setState seeds both arrays — child rows include projectId matching a parent id; the host filters that collection locally. Create is a PageHeader trailing Button setValue that opens a Modal Form (create_task, no apiKey) on this page — the host appends and stamps the selected parent id. Complete is a row Button (done: true); the host writes onto that row. Edit is a row Button setValue editing=true (the host selects that row); save uses editing: false, not creating: false. When a binding was declared, use that apiKey instead of this setState. Do not invent API keys. Do not hide navigator or primary with !selectedId. No Tabs for the three regions. Sidebar chrome is the shell recipe, not this sample.',
  {
    title: 'Projects',
    content: 'Keep the parent list, child list, and selected record visible together.',
    manifest: goldWorkspaceManifest,
  }
)
