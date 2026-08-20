import type { Spec } from '@json-render/core'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

function goldPrompt(
  archetype: string,
  framing: string,
  output: { title: string; content: string; manifest: ArenaGenerativeAppManifest }
): string {
  return [
    `GOLD STANDARD REFERENCE LAYOUT (${archetype})`,
    'Match this structure and density, not its subject matter. Note the default Arena theme and result components bound by statePath.',
    framing,
    JSON.stringify(output, null, 2),
  ].join('\n\n')
}

/** Binding key the dashboard `onLoad` points at. */
export const GOLD_DASHBOARD_LOAD_API_KEY = 'fetch_dashboard'

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
      children: ['entity', 'kpis', 'trend', 'summary'],
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
    kpis: {
      type: 'Grid',
      props: { columns: '4', gap: '16px', minItemWidth: null },
      children: ['kpi_orders', 'kpi_fill', 'kpi_backlog', 'kpi_exceptions'],
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
    kpi_backlog: {
      type: 'Stat',
      props: {
        label: 'Backlog',
        value: null,
        statePath: 'backlog',
        hint: null,
        delta: null,
        deltaTone: null,
        size: 'display',
      },
      children: [],
    },
    kpi_exceptions: {
      type: 'Stat',
      props: {
        label: 'Exceptions',
        value: null,
        statePath: 'exceptions',
        hint: null,
        delta: 'Low',
        deltaTone: 'positive',
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
        padding: null,
        backgroundColor: null,
      },
      children: ['spark'],
    },
    spark: {
      type: 'Sparkline',
      props: { values: null, statePath: 'orderVolume', label: 'Weekly orders' },
      children: [],
    },
    summary: {
      type: 'Card',
      props: {
        title: 'Week in review',
        subtitle: null,
        description: null,
        footerText: null,
        padding: null,
        backgroundColor: null,
      },
      children: ['summary_body'],
    },
    summary_body: {
      type: 'DataText',
      props: {
        statePath: 'summary',
        fallback: 'Metrics load when the page opens.',
        color: null,
        size: null,
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
    load_dashboard: { apiKey: GOLD_DASHBOARD_LOAD_API_KEY },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD = goldPrompt(
  'dashboard',
  'Home is EntityHeader plus a Grid of four display Stats, a Sparkline trend Card, and a summary Card. Page onLoad fetches the metrics; every Stat and the Sparkline bind by statePath. There is no search hero and no form.',
  {
    title: 'Operations',
    content: 'Dashboard of weekly operations metrics on arrival.',
    manifest: goldDashboardManifest,
  }
)

/** Binding key the list page `onLoad` points at. */
export const GOLD_LIST_DETAIL_LIST_API_KEY = 'list_orders'

/** Binding key the detail page `onLoad` points at. */
export const GOLD_LIST_DETAIL_RECORD_API_KEY = 'fetch_order'

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
      props: { columns: '2', gap: '16px', minItemWidth: null },
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
        padding: null,
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
        title: '{record.name}',
        description: '{record.summary}',
        badge: '{record.status}',
        badgeTone: 'info',
        logoSrc: null,
        initials: 'OR',
        statePath: 'record.logo',
        meta: '{record.meta}',
      },
      children: [],
    },
    details: {
      type: 'KeyValue',
      props: { items: null, statePath: 'record', emptyText: 'Order not found.' },
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
      onLoad: ['load_order'],
    },
  },
  actions: {
    load_orders: { apiKey: GOLD_LIST_DETAIL_LIST_API_KEY },
    load_order: {
      apiKey: GOLD_LIST_DETAIL_RECORD_API_KEY,
      inputMapping: { id: 'id' },
    },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL = goldPrompt(
  'list-detail',
  'List page onLoad fills Repeat inside a 2-column Grid of entity Cards. Open uses navigateTo "detail?id={item.id}". Detail onLoad fetches that record and shows EntityHeader plus KeyValue. No search hero.',
  {
    title: 'Orders',
    content: 'Browse orders and open one record.',
    manifest: goldListDetailManifest,
  }
)

/** Binding key the wizard last-step submit points at. */
export const GOLD_WIZARD_SUBMIT_API_KEY = 'submit_onboarding'

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
      children: ['header', 'form'],
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
      props: { columns: '2', gap: '16px', minItemWidth: null },
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
        gap: '12px',
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
        gap: '12px',
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
    submit_onboarding: { apiKey: GOLD_WIZARD_SUBMIT_API_KEY },
  },
}

export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD = goldPrompt(
  'wizard',
  'One page per step. Early steps use Next Button.navigateTo; the last step is the only SubmitButton. Steps after the first have a Back NavLink. There is no search hero and no dashboard Stats.',
  {
    title: 'Onboarding',
    content: 'Three-step onboarding that submits on the last page.',
    manifest: goldWizardManifest,
  }
)
