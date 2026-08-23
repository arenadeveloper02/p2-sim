import type { Spec } from '@json-render/core'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import type { ArenaGenerativeArchetype } from '@/lib/arena-generative-ui/structured-brief'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

const TABS_ITEMS = 'Search|home\nResults|results\nOverview|overview'

/**
 * Hero search: centered kicker and display title, pill SearchField, suggestion
 * chips, and three icon-well feature cards.
 */
const goldHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Company research', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'search', 'hints', 'features'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Find any company',
        subtitle: 'Search a name or domain, pick a match, and run a structured analysis.',
        kicker: 'Watchtower',
        align: 'center',
      },
      children: ['history'],
    },
    history: {
      type: 'Button',
      props: {
        label: 'View analysis history',
        navigateTo: 'results',
        href: null,
        actionId: null,
        variant: 'outline',
        size: null,
        shape: 'pill',
        showWhen: null,
      },
      children: [],
    },
    search: {
      type: 'SearchField',
      props: {
        name: 'query',
        label: null,
        placeholder: 'Search a company or domain',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        actionId: 'search_companies',
        suggestions: 'Stripe, Notion, Figma',
        submitLabel: 'Search',
      },
      children: [],
    },
    hints: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: '8px',
        align: 'center',
        justify: 'center',
        wrap: true,
      },
      children: ['try_stripe'],
    },
    try_stripe: {
      type: 'Chip',
      props: {
        text: 'Try Stripe',
        tone: 'muted',
        setValue: 'query=Stripe',
        actionId: null,
        navigateTo: null,
      },
      children: [],
    },
    features: {
      type: 'Grid',
      props: { columns: '3', gap: '24px', minItemWidth: null },
      children: ['feature_filings', 'feature_signals', 'feature_risk'],
    },
    feature_filings: {
      type: 'Card',
      props: {
        title: 'Filings',
        subtitle: null,
        description: 'SEC and registry documents in one place.',
        footerText: null,
        padding: null,
        backgroundColor: null,
      },
      children: ['icon_filings'],
    },
    icon_filings: {
      type: 'Icon',
      props: { name: 'file', well: 'circle' },
      children: [],
    },
    feature_signals: {
      type: 'Card',
      props: {
        title: 'Signals',
        subtitle: null,
        description: 'Hiring, funding, and product momentum.',
        footerText: null,
        padding: null,
        backgroundColor: null,
      },
      children: ['icon_signals'],
    },
    icon_signals: {
      type: 'Icon',
      props: { name: 'chart', well: 'circle' },
      children: [],
    },
    feature_risk: {
      type: 'Card',
      props: {
        title: 'Risk',
        subtitle: null,
        description: 'Litigation, sanctions, and exposure.',
        footerText: null,
        padding: null,
        backgroundColor: null,
      },
      children: ['icon_risk'],
    },
    icon_risk: {
      type: 'Icon',
      props: { name: 'shield', well: 'circle' },
      children: [],
    },
  },
}

/**
 * Entity results: back link, kicker, Repeat in a 2-column Grid of Cards with
 * Avatar, subtitle, truncated body, and footer Analyze.
 */
const goldResultsSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Matches', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['back', 'header', 'query_chip', 'results_grid'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'home' },
      children: [],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Matching companies',
        subtitle: 'Select a record to run analysis.',
        kicker: 'Results',
        align: 'start',
      },
      children: [],
    },
    query_chip: {
      type: 'Chip',
      props: {
        text: 'Query: {query}',
        tone: 'muted',
        actionId: null,
        navigateTo: null,
        setValue: null,
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
      props: { statePath: 'companies', emptyText: 'No matching companies.' },
      children: ['company_card'],
    },
    company_card: {
      type: 'Card',
      props: {
        title: '{item.name}',
        subtitle: '{item.domain}',
        description: '{item.summary}',
        footerText: '{item.meta}',
        padding: null,
        backgroundColor: null,
      },
      children: ['company_logo', 'analyze'],
    },
    company_logo: {
      type: 'Avatar',
      props: { src: '{item.logo}', initials: '{item.initials}', statePath: null },
      children: [],
    },
    analyze: {
      type: 'Button',
      props: {
        label: 'Analyze',
        actionId: 'run_analysis',
        navigateTo: null,
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

/**
 * Run destination: EntityHeader plus bound DataText. The host supplies pending chrome.
 */
const goldProgressSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Analysis', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['back', 'entity', 'reply', 'continue'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back to results', to: 'results' },
      children: [],
    },
    entity: {
      type: 'EntityHeader',
      props: {
        title: 'Company analysis',
        description: 'Resolving company profile and source documents.',
        badge: 'Running',
        badgeTone: 'info',
        logoSrc: null,
        initials: 'CO',
        statePath: 'company.logo',
        meta: 'Enterprise, 2010',
      },
      children: [],
    },
    reply: {
      type: 'DataText',
      props: {
        statePath: 'content',
        fallback: 'Waiting for analysis…',
        color: null,
        size: null,
      },
      children: [],
    },
    continue: {
      type: 'NavLink',
      props: { label: 'Open overview', to: 'overview' },
      children: [],
    },
  },
}

/**
 * Entity dashboard: EntityHeader, Tabs, four display Stats, editorial summary Card.
 */
const goldOverviewSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Overview', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['tabs', 'entity', 'kpis', 'summary'],
    },
    tabs: {
      type: 'Tabs',
      props: { items: TABS_ITEMS, activePath: 'overview' },
      children: [],
    },
    entity: {
      type: 'EntityHeader',
      props: {
        title: 'Stripe',
        description: 'Financial infrastructure for the internet.',
        badge: 'Public',
        badgeTone: 'success',
        logoSrc: null,
        initials: 'ST',
        statePath: 'company.logo',
        meta: 'Payments, San Francisco',
      },
      children: ['site_link'],
    },
    site_link: {
      type: 'Link',
      props: { label: 'stripe.com', href: 'https://stripe.com', color: null },
      children: [],
    },
    kpis: {
      type: 'Grid',
      props: { columns: '4', gap: '16px', minItemWidth: null },
      children: ['kpi_revenue', 'kpi_employees', 'kpi_funding', 'kpi_risk'],
    },
    kpi_revenue: {
      type: 'Stat',
      props: {
        label: 'Revenue',
        value: null,
        statePath: 'revenue',
        hint: null,
        delta: '+12%',
        deltaTone: 'positive',
        size: 'display',
      },
      children: [],
    },
    kpi_employees: {
      type: 'Stat',
      props: {
        label: 'Employees',
        value: null,
        statePath: 'employees',
        hint: null,
        delta: null,
        deltaTone: null,
        size: 'display',
      },
      children: [],
    },
    kpi_funding: {
      type: 'Stat',
      props: {
        label: 'Funding',
        value: null,
        statePath: 'funding',
        hint: null,
        delta: null,
        deltaTone: null,
        size: 'display',
      },
      children: [],
    },
    kpi_risk: {
      type: 'Stat',
      props: {
        label: 'Risk score',
        value: null,
        statePath: 'riskScore',
        hint: null,
        delta: 'Low',
        deltaTone: 'positive',
        size: 'display',
      },
      children: [],
    },
    summary: {
      type: 'Card',
      props: {
        title: 'Analyst summary',
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
        fallback: 'Run an analysis to generate the overview.',
        color: null,
        size: null,
      },
      children: [],
    },
  },
}

/** Binding key the example's search CTA points at. */
export const GOLD_EXAMPLE_API_KEY = 'search_companies'

/** Binding key the example's analyze CTA points at. */
export const GOLD_EXAMPLE_RUN_API_KEY = 'run_analysis'

/** Binding key the overview `onLoad` points at. */
export const GOLD_EXAMPLE_LOAD_API_KEY = 'fetch_company_overview'

export const goldExampleManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: { path: 'home', title: 'Company research', spec: goldHomeSpec },
    results: { path: 'results', title: 'Matches', spec: goldResultsSpec },
    progress: { path: 'progress', title: 'Analysis', spec: goldProgressSpec },
    overview: {
      path: 'overview',
      title: 'Overview',
      spec: goldOverviewSpec,
      onLoad: ['load_overview'],
    },
  },
  actions: {
    search_companies: {
      apiKey: GOLD_EXAMPLE_API_KEY,
      onSuccess: { navigate: 'results' },
    },
    run_analysis: {
      apiKey: GOLD_EXAMPLE_RUN_API_KEY,
      onSuccess: { navigate: 'progress' },
    },
    load_overview: {
      apiKey: GOLD_EXAMPLE_LOAD_API_KEY,
    },
  },
}

export const goldExampleOutput = {
  title: 'Company research',
  content: 'Search a company, pick a match, run analysis, and read the overview.',
  manifest: goldExampleManifest,
}

/**
 * Reference layout appended to the generator system prompt. A concrete legal
 * manifest is the strongest signal available, so it is asserted against
 * `validateArenaGenerativeManifest` in tests to guarantee it never drifts out of
 * spec and teaches an invalid shape.
 */
export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE = [
  'GOLD STANDARD REFERENCE LAYOUT (form-result)',
  'Match this structure and density, not its subject matter. Note the default Arena theme, the four screens (centered search hero, entity result cards, analysis destination, entity dashboard), SearchField with nested submit, Icon wells, Avatar on entity Cards, EntityHeader, display Stats, and result components bound by statePath.',
  'Note also how data moves: home has no onLoad — SearchField runs the search CTA and onSuccess navigates to results. Submitted fields are available immediately as inputs.query and "{query}" — Results echoes the query on a Chip. Results is a Repeat of entity Cards inside a Grid; Card.title uses "{item.name}", Avatar.src uses "{item.logo}", and Analyze sends the item fields. Progress binds DataText to content (the host shows pending chrome). Overview declares onLoad and binds each Stat by statePath. emptyText is the zero-result copy when the companies array is empty.',
  `Replace the actions apiKey values ("${GOLD_EXAMPLE_LOAD_API_KEY}", "${GOLD_EXAMPLE_API_KEY}", "${GOLD_EXAMPLE_RUN_API_KEY}") with declared API binding keys, and drop manifest.actions and every onLoad entirely when no bindings were declared.`,
  JSON.stringify(goldExampleOutput, null, 2),
].join('\n\n')

/**
 * Few-shot for the generator: the matching archetype only. A single Watchtower
 * example taught every app to become a search hero; injecting all four at once
 * would just restore that bias toward the longest one.
 */
export function goldExamplePromptForArchetype(archetype?: ArenaGenerativeArchetype): string {
  if (archetype === 'dashboard') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD
  if (archetype === 'list-detail') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL
  if (archetype === 'wizard') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD
  return ARENA_GENERATIVE_UI_GOLD_EXAMPLE
}
