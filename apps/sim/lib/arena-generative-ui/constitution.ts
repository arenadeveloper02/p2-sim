/**
 * Universal UI/UX Constitution for every Arena Generative UI app.
 *
 * Platform guarantees (host) vs emit contract (generator) live on each clause
 * so the spec LLM is not told to paint chrome the compiler already owns.
 * `ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT` is the generator-facing summary.
 */

export type ConstitutionOwnership = 'generator' | 'host' | 'shared'

export type ConstitutionSectionId =
  | 'composition'
  | 'actions'
  | 'states'
  | 'forms'
  | 'navigation'
  | 'responsive'
  | 'accessibility'
  | 'content'
  | 'density'
  | 'consistency'

export interface ConstitutionClause {
  ownership: ConstitutionOwnership
  /** Human / compiler wording. */
  text: string
  /**
   * Generator-facing line. Host clauses tell the model to bind and not emit a
   * second copy of runtime chrome.
   */
  prompt: string
  /** Host never-do, collected into {@link ARENA_GENERATIVE_UI_UX_NEVERS}. */
  never?: string
}

export interface ConstitutionSection {
  id: ConstitutionSectionId
  title: string
  /** One-line principle used by {@link ARENA_GENERATIVE_UI_UX_PRINCIPLES}. */
  principle: string
  clauses: ConstitutionClause[]
}

export const ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS: ConstitutionSection[] = [
  {
    id: 'composition',
    title: '1. COMPOSITION',
    principle:
      'Prefer a content container, five-level visual hierarchy, readable measure vs wide collections, one primary action, one dominant region, and grouped sections over decorative chrome.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Establish one clear primary action per viewport.',
        prompt: 'Establish one clear primary action per viewport.',
      },
      {
        ownership: 'generator',
        text: 'Use five-level visual hierarchy: purpose → primary/result → supporting → secondary/metadata → optional.',
        prompt:
          'Use five-level visual hierarchy: purpose (PageHeader / EntityHeader) → primary action or key result → supporting information → secondary actions and metadata → optional details.',
      },
      {
        ownership: 'generator',
        text: 'Only one primary action dominates a local Section.',
        prompt:
          'Only one primary action dominates a local Section. SubmitButton and SearchField already count. Do not add variant "primary" beside them.',
      },
      {
        ownership: 'generator',
        text: 'Secondary actions use secondary or ghost styling.',
        prompt:
          'Ordinary actions are variant "secondary"; Back / Cancel / dismiss are "ghost". Do not paint emphasis with a colour prop.',
      },
      {
        ownership: 'generator',
        text: 'Destructive actions must never visually compete with the primary action.',
        prompt:
          'variant "destructive" for delete / disconnect. It must never visually compete with the primary. Confirm is host.',
      },
      {
        ownership: 'generator',
        text: 'Metadata should have lower visual prominence than content.',
        prompt:
          'Kicker, KeyValue keys, timestamps, and captions stay muted. Do not promote metadata with Heading or Stat.',
      },
      {
        ownership: 'generator',
        text: 'Every page has a content container: Page → Section → PageHeader, then the task.',
        prompt:
          'Every page is Page → Section → PageHeader, then the task. Do not put Table, Form, or Repeat as a direct child of Page.',
      },
      {
        ownership: 'generator',
        text: 'Forms and prose use a readable measure; dashboards, tables, and collections stay wide.',
        prompt:
          'Multi-field forms and long DataText use Section width "narrow". Dashboards, Table, Repeat collections, and Sparkline use width "wide". Do not run a form the full 1280px.',
      },
      {
        ownership: 'generator',
        text: 'Avoid more than two primary content columns unless the task requires it.',
        prompt:
          'At most two primary content columns (Columns main+sidebar, or Grid columns 2). Grid columns 3 only for a Repeat card collection.',
      },
      {
        ownership: 'generator',
        text: 'Related controls share a toolbar.',
        prompt:
          'Related filters and secondary actions share one Toolbar above Table/Repeat. Do not scatter Filter, Chip, or Select through the page.',
      },
      {
        ownership: 'generator',
        text: 'Do not stack multiple visually prominent elements above the primary task.',
        prompt:
          'PageHeader then the task. Do not stack extra display titles, Stat rows, or Alerts above the primary task.',
      },
      {
        ownership: 'generator',
        text: 'Prefer one dominant content region per viewport.',
        prompt:
          'One dominant content region per viewport (the Form, the Table/Repeat, or the DataText). A Columns sidebar is supporting, not a second main.',
      },
      {
        ownership: 'generator',
        text: 'Prefer progressive disclosure over showing everything simultaneously.',
        prompt: 'Prefer progressive disclosure over showing everything simultaneously.',
      },
      {
        ownership: 'generator',
        text: 'Group related information into sections.',
        prompt: 'Group related information into sections.',
      },
      {
        ownership: 'generator',
        text: 'Avoid unnecessary cards, borders, dividers, and decorative UI.',
        prompt: 'Avoid unnecessary cards, borders, dividers, and decorative UI.',
      },
      {
        ownership: 'generator',
        text: 'Never create a component merely to fill empty space.',
        prompt: 'Never create a component merely to fill empty space.',
      },
    ],
  },
  {
    id: 'actions',
    title: '2. ACTIONS',
    principle:
      'Every control has a purpose; the primary action is visually dominant; every CTA follows before, during, success, and error.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Every interactive control must have a clear purpose.',
        prompt: 'Every interactive control must have a clear purpose.',
      },
      {
        ownership: 'generator',
        text: 'Primary action must be visually dominant.',
        prompt: 'Primary action must be visually dominant.',
      },
      {
        ownership: 'host',
        text: 'Before run, the control is enabled. Destructive actions require confirmation.',
        prompt:
          'The control is enabled until it runs. The runtime confirms destructive actions — do not emit Modal or Alert for delete confirm.',
        never: 'destroy user data without confirmation',
      },
      {
        ownership: 'host',
        text: 'During run, disable that control, show a spinner on it, and keep the form and page visible.',
        prompt:
          'The runtime disables the in-flight control, shows a spinner on it, and keeps inputs and page context — do not emit Spinner, ProgressBar, ProgressSteps, or a second disabled overlay, and do not clear the form.',
        never: 'submit the same mutation twice',
      },
      {
        ownership: 'shared',
        text: 'Long-running actions require visible progress.',
        prompt:
          'When the brief names status steps, elapsed, estimate, or Cancel, emit WorkingCard on the waiting page. The runtime ticks steps and the bar — do not emit ProgressSteps, a filling ProgressBar, or Spinner as the wait.',
        never: 'create fake progress',
      },
      {
        ownership: 'host',
        text: 'On success, bind the result; same-page save with no visible result is a toast.',
        prompt:
          'Bind the result as Table, Repeat, Stat, or DataText. The runtime toasts a same-page save with no visible result — do not emit Toast or Alert for save success. Optional navigate is onSuccess.navigate.',
      },
      {
        ownership: 'host',
        text: 'On error, keep entered values and show an actionable banner with Retry when meaningful.',
        prompt:
          'The runtime keeps entered values and shows an actionable banner for API failure with Retry when retry is meaningful — do not emit Alert or Toast for that. Alert is only for in-content status the brief asked for (a disclaimer).',
        never: 'silently fail an action',
      },
    ],
  },
  {
    id: 'states',
    title: '3. STATES',
    principle:
      'For every async operation the platform provides loading, success, empty, error, retry, partial, stale, and disabled behavior.',
    clauses: [
      {
        ownership: 'shared',
        text: 'Every data-driven region accounts for loading, success, empty, and error.',
        prompt:
          'Bind every CTA or onLoad result region to a statePath. Set domain emptyText or EmptyState title/body; EmptyState’s child is the next useful action. The runtime skeletons pending regions and shows empty or error chrome — do not emit Spinner, Skeleton-as-the-page, or Alert for those host events.',
      },
      {
        ownership: 'host',
        text: 'Error copy is visitor-facing; Retry when the action can be retried.',
        prompt:
          'The runtime shows a plain-language banner with Retry when retry is meaningful — do not emit Alert, Toast, or Modal for API failure, and do not mention HTTP status, URLs, or secrets.',
      },
      {
        ownership: 'host',
        text: 'Partial data stays on screen; incomplete regions are marked busy.',
        prompt:
          'The runtime leaves regions that already have data visible and marks them busy — do not invent placeholder rows, fake metrics, or a second ProgressBar for partial data.',
        never: 'invent API data',
      },
      {
        ownership: 'host',
        text: 'Stale refetch keeps existing data and offers Refresh instead of blanking.',
        prompt:
          'The runtime keeps the previous result and offers Refresh — do not blank a bound region that already has data, and do not emit a Refresh Button.',
        never: 'show stale data as current without indication',
      },
      {
        ownership: 'host',
        text: 'Do not overwrite newer data with a stale response.',
        prompt: 'The runtime owns stale-vs-current merging — never invent API rows.',
        never: 'overwrite newer data with stale responses',
      },
      {
        ownership: 'host',
        text: 'Do not lose partial streaming results on failure, or block the page for a background refresh.',
        prompt: 'Do not block the entire page with a full-screen loader for a background refresh.',
        never: 'lose partial streaming results on failure',
      },
      {
        ownership: 'host',
        text: 'Do not block the entire page for a background refresh.',
        prompt: 'Keep the layout interactive while a bound region is pending.',
        never: 'block the entire page for a background refresh',
      },
    ],
  },
  {
    id: 'forms',
    title: '4. FORMS',
    principle:
      'Validate on submit with inline field errors; preserve entered values; the runtime disables submit and confirms the mutation.',
    clauses: [
      {
        ownership: 'host',
        text: 'Validate on submit. Show errors next to the relevant field.',
        prompt:
          'Mark required fields and optional errorText. The runtime validates on submit and shows errors next to the field — do not add a second Text or Alert for the error.',
      },
      {
        ownership: 'host',
        text: 'Preserve user-entered values after validation failure. Never clear a form unexpectedly.',
        prompt: 'Do not reset or clear a form on validation or API failure.',
        never: 'silently discard user input',
      },
      {
        ownership: 'host',
        text: 'Disable submit while submitting. Show success feedback after a successful mutation.',
        prompt:
          'The runtime disables submit while submitting and toasts a successful mutation — do not emit that chrome.',
      },
    ],
  },
  {
    id: 'navigation',
    title: '5. NAVIGATION',
    principle:
      'Preserve context, offer Back where users need it, and keep navigable state in the URL.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Preserve context when navigating.',
        prompt:
          'Preserve context when navigating. Put navigable application state in query parameters (id, range), not hidden component state.',
      },
      {
        ownership: 'generator',
        text: 'Provide Back navigation where users can reasonably need it.',
        prompt:
          'Provide Back navigation on results, detail, and progress pages. Never leave those pages without a way back.',
      },
      {
        ownership: 'generator',
        text: 'Never make navigation depend on a hidden state.',
        prompt: 'Never make navigation depend on a hidden state.',
        never: 'trap the user in a page without recovery/navigation',
      },
      {
        ownership: 'generator',
        text: 'URL parameters should represent navigable application state.',
        prompt: 'URL parameters should represent navigable application state.',
      },
    ],
  },
  {
    id: 'responsive',
    title: '6. RESPONSIVE',
    principle:
      'Compose for a full page; Grid and Columns collapse on narrow screens; actions stay reachable without hover.',
    clauses: [
      {
        ownership: 'shared',
        text: 'Design desktop-first only when the information architecture requires it.',
        prompt:
          'Compose for a full page up to 1280px. Grid and Columns collapse in a narrow Arena iframe — do not author a permanently narrow centre column, and do not assume the iframe is 1280px.',
      },
      {
        ownership: 'host',
        text: 'Collapse multi-column layouts on narrow screens.',
        prompt: 'The runtime collapses Grid and Columns — do not emit a second mobile-only layout.',
      },
      {
        ownership: 'generator',
        text: 'Avoid horizontal scrolling except for inherently wide data.',
        prompt: 'Avoid horizontal scrolling except for inherently wide data (Table).',
      },
      {
        ownership: 'generator',
        text: 'Actions must remain reachable on mobile.',
        prompt:
          'Actions must remain reachable on a stacked layout. Never rely on hover for essential functionality.',
      },
    ],
  },
  {
    id: 'accessibility',
    title: '7. ACCESSIBILITY',
    principle: 'Accessible names, labels, logical keyboard order, and no color-only state.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Interactive elements must have accessible names. Inputs require labels or accessible equivalents.',
        prompt:
          'Interactive elements must have accessible names. Inputs require labels or accessible equivalents (SearchField placeholder is enough).',
      },
      {
        ownership: 'generator',
        text: 'Do not use color as the only state indicator.',
        prompt:
          'Do not use color as the only state indicator. Never express Button emphasis with a colour prop.',
      },
      {
        ownership: 'shared',
        text: 'Maintain logical keyboard order.',
        prompt:
          'Emit interactive elements in the reading order they should be focused. The runtime paints focus rings.',
        never: 'create navigation that cannot be reached with keyboard',
      },
      {
        ownership: 'host',
        text: 'Loading and error states must be announced where appropriate.',
        prompt:
          'The runtime announces loading and error chrome — do not emit a second live-region Alert for that.',
        never: 'create inaccessible interactive elements',
      },
      {
        ownership: 'host',
        text: 'Do not expose secrets or API keys beyond existing missing-secret diagnostics.',
        prompt: 'Do not put secrets or API keys in copy, labels, or bound values.',
        never: 'expose secrets/API keys beyond existing missing-secret diagnostics',
      },
    ],
  },
  {
    id: 'content',
    title: '8. CONTENT',
    principle:
      'Specific product copy, inspectable truncation, sensible empty states, no placeholder UI.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Never truncate important information without a way to inspect it.',
        prompt:
          'Never truncate important information without a way to inspect it (detail page, same-page Open, or full DataText).',
      },
      {
        ownership: 'generator',
        text: 'Use sensible empty-state copy.',
        prompt:
          'Use sensible empty-state copy that names the collection. Never generic "No results" when the brief named the domain.',
      },
      {
        ownership: 'generator',
        text: 'Avoid placeholder-looking UI in the final generated application.',
        prompt:
          'Avoid placeholder-looking UI. Never title a page "Page 1" or use lorem ipsum. Copy is specific product language.',
      },
      {
        ownership: 'generator',
        text: 'Format dates, numbers, currencies and percentages appropriately.',
        prompt:
          'Format dates, numbers, currencies, and percentages in labels and literal copy. Do not invent API values to make a Stat look filled.',
      },
    ],
  },
  {
    id: 'density',
    title: '9. DENSITY',
    principle:
      'Comfortable density, at most 2–3 levels of visual nesting, whitespace for grouping.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Prefer comfortable information density.',
        prompt: 'Prefer comfortable information density.',
      },
      {
        ownership: 'generator',
        text: 'Avoid excessive nested cards. Avoid more than 2–3 levels of visual nesting.',
        prompt: 'Avoid excessive nested cards. Avoid more than 2–3 levels of visual nesting.',
      },
      {
        ownership: 'generator',
        text: 'Use whitespace to establish grouping.',
        prompt: 'Use whitespace to establish grouping (24px gaps between groups).',
      },
    ],
  },
  {
    id: 'consistency',
    title: '10. CONSISTENCY',
    principle:
      'Reuse the same component for the same semantic purpose; keep labels action-oriented and patterns consistent.',
    clauses: [
      {
        ownership: 'generator',
        text: 'Reuse the same component for the same semantic purpose.',
        prompt: 'Reuse the same component for the same semantic purpose.',
      },
      {
        ownership: 'generator',
        text: 'Keep button labels action-oriented.',
        prompt: 'Keep button labels action-oriented.',
      },
      {
        ownership: 'generator',
        text: 'Keep spacing, typography and interaction patterns consistent.',
        prompt: 'Keep spacing, typography, and interaction patterns consistent.',
      },
    ],
  },
]

/**
 * Compact generator-facing constitution. Host clauses are phrased as bind /
 * do-not-emit so the model does not paint a second copy of runtime chrome.
 */
export const ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT = [
  'UNIVERSAL UI/UX CONSTITUTION',
  'Apply to every generated app. The runtime compiles loading, error, retry, save confirmation, and destructive confirm. You compose pages, copy, forms, which API, navigation, and empty-state copy.',
  ...ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS.flatMap((section) => [
    section.title,
    ...section.clauses.map((clause) => `- ${clause.prompt}`),
  ]),
].join('\n')

/**
 * Compiler-facing principles derived from the constitution, not a second list.
 */
export const ARENA_GENERATIVE_UI_UX_PRINCIPLES = [
  'Generate interfaces that feel production-ready.',
  ...ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS.map((section) => section.principle),
  'Optimistic updates only when safe (navigate-first). Never invent API data. Never create fake progress.',
].join('\n')

/**
 * Host never-do list derived from tagged constitution clauses.
 */
export const ARENA_GENERATIVE_UI_UX_NEVERS = ARENA_GENERATIVE_UI_CONSTITUTION_SECTIONS.flatMap(
  (section) => section.clauses.flatMap((clause) => (clause.never ? [clause.never] : []))
) as readonly string[]
