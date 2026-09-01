import type { Spec } from '@json-render/core'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE,
} from '@/lib/arena-generative-ui/gold-example-archetypes'
import type {
  ArenaGenerativeArchetype,
  ArenaGenerativeShell,
} from '@/lib/arena-generative-ui/structured-brief'
import { DEFAULT_ARENA_GENERATIVE_THEME } from '@/lib/arena-generative-ui/theme'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

/**
 * Task entry: centered header and a single SearchField that runs the analyze CTA.
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
      children: ['header', 'search', 'hints'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Analyze a company',
        subtitle: 'Enter a name or domain and receive a structured report.',
        kicker: 'Research',
        align: 'center',
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
      },
      children: [],
    },
    hints: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 'sm',
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
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['back', 'working', 'reply'],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back', to: 'home' },
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
        title: 'Report',
        subtitle: '{company}',
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

/** Binding key the example's analyze CTA points at. */
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
      apiKey: GOLD_EXAMPLE_API_KEY,
      onSuccess: { navigate: 'results' },
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
 * manifest is the strongest signal available, so it is asserted against
 * `validateArenaGenerativeManifest` in tests to guarantee it never drifts out of
 * spec and teaches an invalid shape.
 */
export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE = [
  'GOLD STANDARD REFERENCE LAYOUT (task)',
  'Match this structure and density, not its subject matter. Note the default Arena theme, the two screens (centered company input, report destination), SearchField with nested submit, WorkingCard then DataText bound by statePath. gap and padding use spacing tokens (sm, md, lg); Card.variant is default or muted. Do not copy px, hex, or CSS variables.',
  'Note also how data moves: home has no onLoad — SearchField runs the analyze CTA and onSuccess navigates to results. Submitted fields are available immediately as inputs.company and "{company}". Results has no onLoad of that CTA. WorkingCard applies when CAPABILITY includes long-running, multi-step, or cancellable; omit it when no wait capability is selected. Do not add history, SWOT, stats, or extra pages this example omitted.',
  `Replace the action apiKey ("${GOLD_EXAMPLE_API_KEY}") with a declared API binding key. The SearchField actionId must be that same manifest.actions key — do not paraphrase ${GOLD_EXAMPLE_API_KEY} as company_search. When no bindings were declared, keep the action with no apiKey and use onSuccess.setState / navigate. Do not drop manifest.actions.`,
  JSON.stringify(goldExampleOutput, null, 2),
].join('\n\n')

/**
 * Few-shot for the generator: sidebar or workspace chrome wins so catalog
 * Workspace is taught. Otherwise the matching page job only.
 */
export function goldExamplePromptForArchetype(
  archetype?: ArenaGenerativeArchetype,
  options?: { shell?: ArenaGenerativeShell }
): string {
  if (
    options?.shell?.navigation === 'sidebar' ||
    options?.shell?.navigation === 'workspace' ||
    archetype === 'workspace'
  ) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE
  }
  if (archetype === 'dashboard') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD
  if (archetype === 'collection' || archetype === 'detail') {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL
  }
  if (archetype === 'workflow') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD
  if (archetype === 'content') return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT
  return ARENA_GENERATIVE_UI_GOLD_EXAMPLE
}
