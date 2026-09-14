import type { Spec } from '@json-render/core'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_KANBAN,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TIMELINE,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE,
  GOLD_RENDER_CONTRACT,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import type {
  ArenaGenerativeArchetype,
  ArenaGenerativeShell,
} from '@/lib/arena-generative-ui/structured-brief'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

/**
 * Task entry: left-aligned header and a SearchField on the readable measure.
 */
const goldHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Company research', backgroundColor: null },
      children: ['app_header', 'section'],
    },
    app_header: {
      type: 'AppHeader',
      props: { title: 'Company research', icon: 'spark' },
      children: [],
    },
    section: {
      type: 'Section',
      props: { width: 'narrow', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'search', 'hints'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Analyze a company',
        subtitle: 'Enter a name or domain and receive a structured report.',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    search: {
      type: 'SearchField',
      props: {
        name: 'company',
        label: null,
        placeholder: 'Company name or domain',
        required: true,
        defaultValue: null,
        statePath: null,
        errorText: null,
        showWhen: null,
        actionId: 'analyze_company',
        suggestions: 'Stripe, Notion, Figma',
        submitLabel: 'Analyze',
        live: null,
        surface: null,
      },
      children: [],
    },
    hints: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
        align: 'start',
        justify: 'start',
        wrap: true,
      },
      children: ['try_stripe'],
    },
    try_stripe: {
      type: 'Chip',
      props: {
        text: 'Try Stripe',
        tone: 'muted',
        setValue: 'company=Stripe',
        actionId: null,
        navigateTo: null,
      },
      children: [],
    },
  },
}

/**
 * Results destination: WorkingCard while pending, then bound DataText. No history,
 * SWOT, or stats modules.
 */
const goldReportSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Report', backgroundColor: null },
      children: ['app_header', 'section'],
    },
    app_header: {
      type: 'AppHeader',
      props: { title: 'Company research', icon: 'spark' },
      children: [],
    },
    section: {
      type: 'Section',
      props: { width: 'narrow', padding: null, backgroundColor: null, maxWidth: null },
      children: ['back', 'header', 'working', 'reply'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'home' },
      children: [],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Report',
        subtitle: '{company}',
        kicker: null,
        align: 'start',
      },
      children: [],
    },
    working: {
      type: 'WorkingCard',
      props: {
        title: 'Working on this analysis…',
        steps: 'Resolving the company\nReading public sources\nDrafting the report',
        estimate: 'Usually takes 90–150s',
        intervalMs: '2500',
        durationMs: null,
        tip: 'Tip: A strong analysis names the sources it used.',
        cancelTo: 'home',
        cancelLabel: 'Cancel',
        skeleton: true,
      },
      children: [],
    },
    reply: {
      type: 'Card',
      props: {
        title: null,
        subtitle: null,
        description: null,
        footerText: null,
        padding: 'lg',
        variant: 'default',
        backgroundColor: null,
      },
      children: ['reply_body'],
    },
    reply_body: {
      type: 'DataText',
      props: {
        statePath: 'content',
        fallback: 'Run an analysis to generate the report.',
        color: null,
        size: null,
      },
      children: [],
    },
  },
}

/** Action id the SearchField points at. Not a binding key. */
export const GOLD_EXAMPLE_API_KEY = 'analyze_company'

export const goldExampleManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  theme: DEFAULT_ARENA_GENERATIVE_THEME,
  pages: {
    home: { path: 'home', title: 'Company research', spec: goldHomeSpec },
    results: { path: 'results', title: 'Report', spec: goldReportSpec },
  },
  actions: {
    analyze_company: {
      onSuccess: {
        setState: {
          content:
            '## Stripe\n\nPayments infrastructure. Strong brand, dense competitor set.',
        },
        navigate: 'results',
      },
    },
  },
}

export const goldExampleOutput = {
  title: 'Company research',
  content: 'Enter a company and read the report.',
  manifest: goldExampleManifest,
}

/**
 * Reference layout appended to the generator system prompt. A concrete legal
 * manifest is the strongest wiring signal available, so it is asserted against
 * `validateArenaGenerativeManifest` in tests to guarantee it never drifts out of
 * spec. Sitemap, page count, and shell come from the blueprint, not this sample.
 */
export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE = [
  'GOLD STANDARD REFERENCE LAYOUT (task)',
  GOLD_RENDER_CONTRACT,
  'This sample uses two screens (left-aligned company input on a narrow Section, report destination) because a task page then a results page is the blueprint. AppHeader is sticky product chrome on Page; both Sections are width "narrow" with PageHeader align start. Home is SearchField with nested submit in a Card (the host paints that surface if the Card is omitted). Results is Back, PageHeader, WorkingCard, then DataText bound by statePath — not a 1280px prose strip. Home has no onLoad — SearchField runs the analyze CTA and onSuccess navigates to results. Submitted fields are available immediately as inputs.company and "{company}". Results has no onLoad of that CTA. WorkingCard applies when CAPABILITY includes long-running, multi-step, or cancellable; omit it when no wait capability is selected. This sample\'s estimate (90–150s) is illustrative — copy the brief\'s duration, not that band. Do not add history, SWOT, stats, or extra pages this example omitted. Do not author a centered SearchField hero on a 1280px Section without a Card.',
  `SearchField actionId is "${GOLD_EXAMPLE_API_KEY}" — do not paraphrase it as company_search. This sample has no apiKey: onSuccess.setState fills content then navigates. When a binding was declared, add that apiKey and omit the dummy content setState. Do not invent API keys. Do not drop manifest.actions.`,
  JSON.stringify(goldExampleOutput, null, 2),
].join('\n\n')

export interface GoldExamplePickerOptions {
  /** Planned page archetypes. */
  pageArchetypes?: readonly ArenaGenerativeArchetype[]
  /** True when any page declared named regions. */
  hasRegions?: boolean
  /**
   * Used only for tabs + task + results → agent product-shell gold.
   * Sidebar chrome remains the shell recipe, not gold.
   */
  shell?: ArenaGenerativeShell
  /** Dummy collection plotted on Calendar (representation calendar). */
  needsCalendar?: boolean
  /** Dummy collection plotted on Timeline (representation timeline). */
  needsTimeline?: boolean
  /** Dummy collection plotted on Kanban (representation kanban). */
  needsKanban?: boolean
  /** Collection body is Table (representation table). */
  needsTables?: boolean
}

/** Validated gold sample injected for an uncovered planned page job. */
export type GoldExampleKey =
  | 'task'
  | 'agent-shell'
  | 'list-detail'
  | 'workspace'
  | 'collection'
  | 'table'
  | 'calendar'
  | 'timeline'
  | 'kanban'
  | 'dashboard'
  | 'workflow'
  | 'content'

const MAX_GOLD_EXAMPLES = 3

const GOLD_PROMPT_BY_KEY: Record<GoldExampleKey, string> = {
  task: ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  'agent-shell': ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL,
  'list-detail': ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  workspace: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE,
  collection: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION,
  table: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TABLE,
  calendar: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CALENDAR,
  timeline: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_TIMELINE,
  kanban: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_KANBAN,
  dashboard: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  workflow: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD,
  content: ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT,
}

/**
 * Multi-gold preface: each block is a wiring few-shot for one page job.
 * Sitemap and subjects stay on `pages[]`.
 */
export const GOLD_MULTI_EXAMPLE_PREFACE =
  'Each GOLD STANDARD block applies only to pages whose job matches its label. Do not merge their sitemaps or subjects. Honour `pages[]`.'

const AGENT_SHELL_COVERS = ['task', 'results', 'collection'] as const
const TASK_COVERS = ['task', 'results'] as const
const LIST_DETAIL_COVERS = ['collection', 'detail'] as const

function collectionBodyKey(options?: GoldExamplePickerOptions): GoldExampleKey {
  if (options?.needsCalendar) return 'calendar'
  if (options?.needsTimeline) return 'timeline'
  if (options?.needsKanban) return 'kanban'
  if (options?.needsTables) return 'table'
  return 'collection'
}

/**
 * Unique gold keys for uncovered planned page jobs. Composite samples cover
 * their member jobs; cap is three. Workspace / regions stay exclusive.
 */
export function selectGoldExampleKeys(
  archetype?: ArenaGenerativeArchetype,
  options?: GoldExamplePickerOptions
): GoldExampleKey[] {
  const jobs = new Set<ArenaGenerativeArchetype>(options?.pageArchetypes ?? [])
  if (archetype) jobs.add(archetype)

  if (options?.hasRegions || jobs.has('workspace')) {
    return ['workspace']
  }

  const uncovered = new Set(jobs)
  const keys: GoldExampleKey[] = []

  const cover = (key: GoldExampleKey, covered: readonly ArenaGenerativeArchetype[]) => {
    if (keys.length >= MAX_GOLD_EXAMPLES) return
    keys.push(key)
    for (const job of covered) uncovered.delete(job)
  }

  const tabsShell = options?.shell?.navigation === 'tabs'
  if (uncovered.has('task') && uncovered.has('results') && tabsShell) {
    cover('agent-shell', AGENT_SHELL_COVERS)
  }

  if (uncovered.has('collection') && uncovered.has('detail')) {
    cover('list-detail', LIST_DETAIL_COVERS)
  }

  if (uncovered.has('task') || uncovered.has('results')) {
    cover('task', TASK_COVERS)
  }

  if (uncovered.has('collection')) {
    cover(collectionBodyKey(options), ['collection'])
  }

  if (uncovered.has('dashboard')) cover('dashboard', ['dashboard'])
  if (uncovered.has('workflow')) cover('workflow', ['workflow'])
  if (uncovered.has('content')) cover('content', ['content'])
  if (uncovered.has('detail')) cover('list-detail', ['detail'])

  return keys.length > 0 ? keys : ['task']
}

/**
 * Few-shot for the generator: wiring only. Concatenates one gold per uncovered
 * planned page job (max 3). Prefer agent product-shell gold only when
 * shell.tabs + task + results (covers collection History in that sample).
 */
export function goldExamplePromptForArchetype(
  archetype?: ArenaGenerativeArchetype,
  options?: GoldExamplePickerOptions
): string {
  const keys = selectGoldExampleKeys(archetype, options)
  const blocks = keys.map((key) => GOLD_PROMPT_BY_KEY[key])
  if (keys.length > 1) {
    return [GOLD_MULTI_EXAMPLE_PREFACE, ...blocks].join('\n\n')
  }
  return blocks[0] ?? ARENA_GENERATIVE_UI_GOLD_EXAMPLE
}
