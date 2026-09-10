import type { Spec } from '@json-render/core'
import {
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD,
  ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL,
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
 * Task entry: centered header and a single SearchField that runs the analyze CTA.
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
      children: ['app_header', 'section'],
    },
    app_header: {
      type: 'AppHeader',
      props: { title: 'Company research', icon: 'spark' },
      children: [],
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
  'This sample uses two screens (centered company input, report destination) because a task page then a results page is the blueprint. AppHeader is sticky product chrome on Page; Section holds SearchField with nested submit, WorkingCard then DataText bound by statePath. Home has no onLoad — SearchField runs the analyze CTA and onSuccess navigates to results. Submitted fields are available immediately as inputs.company and "{company}". Results has no onLoad of that CTA. WorkingCard applies when CAPABILITY includes long-running, multi-step, or cancellable; omit it when no wait capability is selected. Do not add history, SWOT, stats, or extra pages this example omitted.',
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
}

/**
 * Few-shot for the generator: wiring only. Selected from the planned sitemap.
 * Prefer agent product-shell gold only when shell.tabs + task + results
 * (avoids mis-picking Article Agent gold for unrelated task+results+collection).
 */
export function goldExamplePromptForArchetype(
  archetype?: ArenaGenerativeArchetype,
  options?: GoldExamplePickerOptions
): string {
  const shapes = new Set<ArenaGenerativeArchetype>(options?.pageArchetypes ?? [])
  if (archetype) shapes.add(archetype)
  const hasRegions = Boolean(options?.hasRegions)
  const tabsShell = options?.shell?.navigation === 'tabs'
  const taskResults = shapes.has('task') && shapes.has('results')

  if (hasRegions || shapes.has('workspace')) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WORKSPACE
  }
  // Require shell.tabs so lead-form → results + unrelated collection does not
  // get Article Agent few-shot. Shell must be passed from the prompt pipeline.
  if (taskResults && tabsShell) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_AGENT_SHELL
  }
  if (taskResults) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE
  }
  if (shapes.has('collection') && shapes.has('detail')) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL
  }
  if (shapes.has('task')) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE
  }
  if (shapes.has('collection')) {
    return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_COLLECTION
  }
  if (shapes.has('dashboard')) return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_DASHBOARD
  if (shapes.has('workflow')) return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_WIZARD
  if (shapes.has('content')) return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_CONTENT
  if (shapes.has('detail')) return ARENA_GENERATIVE_UI_GOLD_EXAMPLE_LIST_DETAIL
  return ARENA_GENERATIVE_UI_GOLD_EXAMPLE
}
