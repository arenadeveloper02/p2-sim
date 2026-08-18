import type { Spec } from '@json-render/core'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

/**
 * Dashboard entry page: metrics across the top, then a parameters form beside a
 * supporting card. Shows the wide default width and side-by-side form fields.
 *
 * The metrics are bound by `statePath` and filled by the page's `onLoad` action,
 * which is also what gives them their loading placeholder. `delta` stays literal
 * because the catalog has no binding for it — it is display copy, not data.
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
        variant: 'secondary',
        size: null,
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
        value: null,
        delta: '+14.2%',
        deltaTone: 'positive',
        statePath: 'totalReports',
        hint: null,
      },
      children: [],
    },
    metric_pipelines: {
      type: 'Stat',
      props: {
        label: 'Active data pipelines',
        value: null,
        delta: 'Stable',
        deltaTone: 'neutral',
        statePath: 'activePipelines',
        hint: null,
      },
      children: [],
    },
    metric_latency: {
      type: 'Stat',
      props: {
        label: 'Median compile time',
        value: null,
        delta: '-8.1%',
        deltaTone: 'positive',
        statePath: 'medianCompileTime',
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
      props: { label: 'Execute run', actionId: null, size: null },
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
        emptyText: null,
      },
      children: [],
    },
  },
}

/**
 * Result page: bound Stat, KeyValue, and a Repeat of article Cards read the
 * CTA response from app state. The narrative body sits in a narrow Section so
 * prose keeps a readable measure while the collection above stays wide.
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
      props: { statePath: 'meta', items: null, emptyText: null },
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
      children: ['articles_grid'],
    },
    articles_grid: {
      type: 'Grid',
      props: { columns: '2', gap: '16px', minItemWidth: null },
      children: ['articles_repeat'],
    },
    articles_repeat: {
      type: 'Repeat',
      props: { statePath: 'articles', emptyText: 'No articles ranked yet.' },
      children: ['article_card'],
    },
    article_card: {
      type: 'Card',
      props: {
        title: '{item.title}',
        description: null,
        padding: null,
        backgroundColor: null,
      },
      children: ['article_meta'],
    },
    article_meta: {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: '12px',
        align: 'center',
        justify: 'between',
        wrap: true,
      },
      children: ['article_score', 'article_link'],
    },
    article_score: {
      type: 'Badge',
      props: { text: '{item.score}', tone: 'info' },
      children: [],
    },
    article_link: {
      type: 'Link',
      props: { label: 'Open', href: '{item.url}', color: null },
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

/** Binding key the example's `onLoad` points at, used by tests and prompt framing. */
export const GOLD_EXAMPLE_LOAD_API_KEY = 'fetch_dashboard_metrics'

export const goldExampleManifest: ArenaGenerativeAppManifest = {
  entryPath: 'home',
  pages: {
    home: {
      path: 'home',
      title: 'Research operations',
      spec: goldHomeSpec,
      onLoad: ['load_metrics'],
    },
    report: { path: 'report', title: 'Compiled report', spec: goldReportSpec },
  },
  actions: {
    load_metrics: {
      apiKey: GOLD_EXAMPLE_LOAD_API_KEY,
    },
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
  'Match this structure and density, not its subject matter. Note the flat elements map with string child ids, the wide Section for dashboard content, the narrow Section for narrative prose, metrics in a Grid of Stat, form fields paired in a Grid, a live collection as Repeat inside a Grid of Cards, and result components bound by statePath.',
  'Note also how the home page fills itself: it declares onLoad and binds each Stat by statePath, so the metrics arrive without the user clicking anything. The report page has no onLoad because its data comes from the CTA that navigated there. Ranked articles are a Repeat template: Card.title uses "{item.title}", the outbound Link uses "{item.url}", and the Repeat sits inside the Grid so each article is one cell. emptyText is the zero-result copy when that array is empty.',
  `Replace the actions apiKey values ("${GOLD_EXAMPLE_LOAD_API_KEY}", "${GOLD_EXAMPLE_API_KEY}") with declared API binding keys, and drop manifest.actions and every onLoad entirely when no bindings were declared.`,
  JSON.stringify(goldExampleOutput, null, 2),
].join('\n\n')
