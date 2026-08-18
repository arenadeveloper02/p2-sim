import type { Spec } from '@json-render/core'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

/**
 * Dashboard entry page: metrics across the top, then a parameters form beside a
 * supporting card. Shows the wide default width and side-by-side form fields.
 */
const goldHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Research operations', backgroundColor: null },
      children: ['section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'metrics', 'split'],
    },
    header: {
      type: 'PageHeader',
      props: {
        title: 'Research operations',
        subtitle: 'Compilation throughput and run parameters.',
      },
      children: ['header_action'],
    },
    header_action: {
      type: 'Button',
      props: {
        label: 'View latest report',
        navigateTo: 'report',
        href: null,
        actionId: null,
        backgroundColor: null,
        color: null,
      },
      children: [],
    },
    metrics: {
      type: 'Grid',
      props: { columns: '3', gap: '16px', minItemWidth: null },
      children: ['metric_reports', 'metric_pipelines', 'metric_latency'],
    },
    metric_reports: {
      type: 'Stat',
      props: {
        label: 'Total reports compiled',
        value: '12,480',
        delta: '+14.2%',
        deltaTone: 'positive',
        statePath: null,
        hint: null,
      },
      children: [],
    },
    metric_pipelines: {
      type: 'Stat',
      props: {
        label: 'Active data pipelines',
        value: '18',
        delta: 'Stable',
        deltaTone: 'neutral',
        statePath: null,
        hint: null,
      },
      children: [],
    },
    metric_latency: {
      type: 'Stat',
      props: {
        label: 'Median compile time',
        value: '42s',
        delta: '-8.1%',
        deltaTone: 'positive',
        statePath: null,
        hint: null,
      },
      children: [],
    },
    split: {
      type: 'Columns',
      props: { layout: 'equal', gap: '24px' },
      children: ['params_card', 'velocity_card'],
    },
    params_card: {
      type: 'Card',
      props: {
        title: 'System parameters',
        description: 'Configure compilation parameters for the next run.',
        padding: null,
        backgroundColor: null,
      },
      children: ['form'],
    },
    form: {
      type: 'Form',
      props: { actionId: 'compile_report' },
      children: ['form_fields', 'notes', 'submit'],
    },
    form_fields: {
      type: 'Grid',
      props: { columns: '2', gap: '16px', minItemWidth: null },
      children: ['batch_name', 'priority'],
    },
    batch_name: {
      type: 'TextInput',
      props: {
        name: 'batchName',
        label: 'Batch target identifier',
        placeholder: 'Q3-PROD-ALPHA',
        required: true,
      },
      children: [],
    },
    priority: {
      type: 'Select',
      props: {
        name: 'priority',
        label: 'Execution priority',
        options: 'Standard processing, High priority expedited',
        required: null,
      },
      children: [],
    },
    notes: {
      type: 'TextArea',
      props: {
        name: 'notes',
        label: 'Analyst notes',
        placeholder: 'Optional context for this run',
        required: null,
      },
      children: [],
    },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Execute run', actionId: null },
      children: [],
    },
    velocity_card: {
      type: 'Card',
      props: {
        title: 'Pipeline velocity',
        description: 'Processed records per second.',
        padding: null,
        backgroundColor: null,
      },
      children: ['velocity_table'],
    },
    velocity_table: {
      type: 'Table',
      props: {
        columns: 'Time, Records/sec',
        rows: '10:00 | 1,200\n11:00 | 1,450\n12:00 | 1,900',
        statePath: null,
      },
      children: [],
    },
  },
}

/**
 * Result page: bound Stat and Table read the CTA response straight from app
 * state, and the narrative body sits in a narrow Section so prose keeps a
 * readable measure while the tables above stay wide.
 */
const goldReportSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Compiled report', backgroundColor: null },
      children: ['section', 'summary_section'],
    },
    section: {
      type: 'Section',
      props: { width: 'wide', padding: null, backgroundColor: null, maxWidth: null },
      children: ['header', 'metrics', 'articles_card'],
    },
    header: {
      type: 'PageHeader',
      props: { title: 'Compiled report', subtitle: 'Ranked articles from the latest run.' },
      children: [],
    },
    metrics: {
      type: 'Grid',
      props: { columns: '2', gap: '16px', minItemWidth: null },
      children: ['metric_count', 'run_meta'],
    },
    metric_count: {
      type: 'Stat',
      props: {
        label: 'Articles ranked',
        statePath: 'count',
        value: null,
        delta: null,
        deltaTone: null,
        hint: null,
      },
      children: [],
    },
    run_meta: {
      type: 'KeyValue',
      props: { statePath: 'meta', items: null },
      children: [],
    },
    articles_card: {
      type: 'Card',
      props: {
        title: 'Ranked articles',
        description: 'Sorted by relevance score.',
        padding: null,
        backgroundColor: null,
      },
      children: ['articles_table'],
    },
    articles_table: {
      type: 'Table',
      props: { statePath: 'articles', columns: 'title, score, url', rows: null },
      children: [],
    },
    summary_section: {
      type: 'Section',
      props: { width: 'narrow', padding: null, backgroundColor: null, maxWidth: null },
      children: ['summary_heading', 'summary_body', 'back'],
    },
    summary_heading: {
      type: 'Heading',
      props: { text: 'Analyst summary', level: 'h2', color: null },
      children: [],
    },
    summary_body: {
      type: 'DataText',
      props: {
        statePath: 'summary',
        fallback: 'Execute a run to generate the summary.',
        color: null,
        size: null,
      },
      children: [],
    },
    back: {
      type: 'NavLink',
      props: { label: 'Back to parameters', to: 'home' },
      children: [],
    },
  },
}

/** Binding key the example's CTA points at, used by tests and prompt framing. */
export const GOLD_EXAMPLE_API_KEY = 'compile_report'

export const goldExampleManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  pages: {
    home: { path: 'home', title: 'Research operations', spec: goldHomeSpec },
    report: { path: 'report', title: 'Compiled report', spec: goldReportSpec },
  },
  actions: {
    compile_report: {
      apiKey: GOLD_EXAMPLE_API_KEY,
      onSuccess: { navigate: 'report' },
    },
  },
}

export const goldExampleOutput = {
  title: 'Research operations',
  content: 'A two-page research operations app: run parameters and a compiled report.',
  manifest: goldExampleManifest,
}

/**
 * Reference layout appended to the generator system prompt. A concrete legal
 * manifest is the strongest signal available, so it is asserted against
 * `validateArenaGenerativeManifest` in tests to guarantee it never drifts out of
 * spec and teaches an invalid shape.
 */
export const ARENA_GENERATIVE_UI_GOLD_EXAMPLE = [
  'GOLD STANDARD REFERENCE LAYOUT',
  'Match this structure and density, not its subject matter. Note the flat elements map with string child ids, the wide Section for dashboard content, the narrow Section for narrative prose, metrics in a Grid of Stat, form fields paired in a Grid, and result components bound by statePath.',
  `Replace the actions apiKey ("${GOLD_EXAMPLE_API_KEY}") with a declared API binding key, and drop manifest.actions entirely when no bindings were declared.`,
  JSON.stringify(goldExampleOutput, null, 2),
].join('\n\n')
